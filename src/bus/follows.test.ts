import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Bus } from "./bus";
import { SharedFollows } from "./follows";
import type { BusPayloads, BusType } from "./types";

class MemoryBus extends Bus {
  static peers: MemoryBus[] = [];
  static broadcast = true;
  constructor() { super("scene"); MemoryBus.peers.push(this); }
  override send<T extends BusType>(type: T, payload?: BusPayloads[T]) {
    const id = `${this.id}-${Math.random()}`;
    if (MemoryBus.broadcast) for (const peer of MemoryBus.peers) {
      peer.deliver({ v: 1, id, type, payload: structuredClone(payload!), from: this.id, ts: Date.now() });
    }
    return id;
  }
}

function lockManager() {
  const held = new Set<string>();
  return {
    request: vi.fn(async (name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { await callback({ name }); } finally { held.delete(name); }
    }),
  } as unknown as Pick<LockManager, "request">;
}

let locks: Pick<LockManager, "request">;
let storage: Map<string, string>;
let instances: SharedFollows[];
let active: number;
let maximum: number;

function source(eligible = true, manager = locks) {
  let sink!: Parameters<ConstructorParameters<typeof SharedFollows>[3]>[0];
  const follow = vi.fn();
  const state = vi.fn();
  const connect = vi.fn((callbacks: typeof sink) => {
    sink = callbacks;
    maximum = Math.max(maximum, ++active);
    sink.status("live");
    return () => { active--; };
  });
  const shared = new SharedFollows(new MemoryBus(), "channel", eligible, connect, follow, state, manager).start();
  instances.push(shared);
  return {
    shared, connect, follow, state,
    emit: (user: string, id: string) => sink.follow(user, id),
    fail: (status: "expired" | "error", terminal = true) => {
      sink.status(status);
      sink.notice("Authorization rejected");
      if (terminal) sink.terminal();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  locks = lockManager();
  instances = [];
  MemoryBus.peers = [];
  MemoryBus.broadcast = true;
  active = maximum = 0;
});
afterEach(async () => {
  for (const instance of instances) instance.destroy();
  await vi.advanceTimersByTimeAsync(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("four sources use one listener and each receives a follow exactly once", async () => {
  const peers = Array.from({ length: 4 }, () => source());
  await vi.advanceTimersByTimeAsync(0);
  expect(active).toBe(1);
  peers[0]!.emit("Viewer", "twitch-message");
  peers[0]!.emit("Viewer", "twitch-message");
  await vi.advanceTimersByTimeAsync(4000);
  for (const peer of peers) expect(peer.follow.mock.calls).toEqual([["Viewer"]]);
  expect(maximum).toBe(1);
});

it("takes over when the owner closes, without overlapping listeners", async () => {
  const first = source();
  const second = source();
  await vi.advanceTimersByTimeAsync(0);
  first.shared.destroy();
  await vi.advanceTimersByTimeAsync(2000);
  expect(second.connect).toHaveBeenCalledOnce();
  expect(active).toBe(1);
  expect(maximum).toBe(1);
  second.emit("After takeover", "second-event");
  expect(second.follow).toHaveBeenCalledWith("After takeover");
  expect(first.follow).not.toHaveBeenCalled();
});

it.each(["expired", "error"] as const)("releases a terminal %s owner and lets a healthy source take over", async (status) => {
  const first = source();
  const second = source();
  first.fail(status);
  await vi.advanceTimersByTimeAsync(2000);
  expect(active).toBe(1);
  expect(maximum).toBe(1);
  expect(second.connect).toHaveBeenCalledOnce();
  second.emit("Recovered viewer", "recovered-event");
  expect(first.follow).toHaveBeenCalledWith("Recovered viewer");
  expect(second.follow).toHaveBeenCalledWith("Recovered viewer");
  await vi.advanceTimersByTimeAsync(10000);
  expect(first.connect).toHaveBeenCalledOnce();
  expect(first.state).toHaveBeenLastCalledWith("live", "");
  second.shared.destroy();
  await vi.advanceTimersByTimeAsync(10000);
  expect(active).toBe(0);
  expect(first.connect).toHaveBeenCalledOnce();
  expect(first.state).toHaveBeenLastCalledWith(status, "Authorization rejected");
});

it("retains ownership for retryable errors", async () => {
  const first = source();
  const second = source();
  first.fail("error", false);
  await vi.advanceTimersByTimeAsync(10000);
  expect(active).toBe(1);
  expect(second.connect).not.toHaveBeenCalled();
});

it("does not spin when every source has rejected credentials; replacement can recover", async () => {
  const first = source();
  const second = source();
  first.fail("expired");
  await vi.advanceTimersByTimeAsync(2000);
  second.fail("expired");
  await vi.advanceTimersByTimeAsync(20000);
  expect(active).toBe(0);
  expect(first.connect).toHaveBeenCalledOnce();
  expect(second.connect).toHaveBeenCalledOnce();
  expect(first.state).toHaveBeenLastCalledWith("expired", "Authorization rejected");
  const replacement = source();
  await vi.advanceTimersByTimeAsync(2000);
  expect(replacement.connect).toHaveBeenCalledOnce();
  expect(first.state).toHaveBeenLastCalledWith("live", "");
});

it("cleans up a connector that reports terminal failure synchronously", async () => {
  const cleanup = vi.fn();
  const connect = vi.fn((sink: Parameters<ConstructorParameters<typeof SharedFollows>[3]>[0]) => {
    sink.status("expired");
    sink.notice("Authorization rejected");
    sink.terminal();
    return cleanup;
  });
  const shared = new SharedFollows(new MemoryBus(), "channel", true, connect, vi.fn(), vi.fn(), locks).start();
  instances.push(shared);
  const next = source();
  await vi.advanceTimersByTimeAsync(2000);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(next.connect).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000);
  expect(connect).toHaveBeenCalledOnce();
});

it("delivers bursts through storage polling without BroadcastChannel", async () => {
  MemoryBus.broadcast = false;
  const first = source();
  const second = source();
  for (let i = 0; i < 10; i++) first.emit(`Viewer ${i}`, `event-${i}`);
  await vi.advanceTimersByTimeAsync(2500);
  expect(first.follow).toHaveBeenCalledTimes(10);
  expect(second.follow).toHaveBeenCalledTimes(10);
  expect(active).toBe(1);
});

it("shares follows with sources that have no token", async () => {
  const listener = source(false);
  const owner = source();
  owner.emit("Viewer", "event");
  await vi.advanceTimersByTimeAsync(500);
  expect(listener.connect).not.toHaveBeenCalled();
  expect(listener.state).toHaveBeenLastCalledWith("live", "");
  expect(listener.follow).toHaveBeenCalledWith("Viewer");
});

it("does not replay old follows when a source loads", async () => {
  const owner = source();
  owner.emit("Earlier", "old-event");
  const later = source();
  await vi.advanceTimersByTimeAsync(2500);
  expect(later.follow).not.toHaveBeenCalled();
  owner.emit("New", "new-event");
  expect(later.follow.mock.calls).toEqual([["New"]]);
});

it("works through the bus when localStorage is blocked", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  });
  const owner = source();
  const follower = source();
  owner.emit("Viewer", "event");
  await vi.advanceTimersByTimeAsync(2000);
  expect(follower.follow).toHaveBeenCalledOnce();
  expect(follower.state).toHaveBeenLastCalledWith("live", "");
  expect(active).toBe(1);
});

it("fails visibly rather than opening independent sockets without Web Locks", async () => {
  vi.stubGlobal("navigator", {});
  const connect = vi.fn();
  const state = vi.fn();
  const shared = new SharedFollows(new MemoryBus(), "other", true, connect, vi.fn(), state).start();
  instances.push(shared);
  await vi.advanceTimersByTimeAsync(2500);
  expect(connect).not.toHaveBeenCalled();
  expect(state).toHaveBeenLastCalledWith("error", expect.stringContaining("update OBS"));
});

it("stops reporting live when the owner is gone and no authorized successor exists", async () => {
  const owner = source();
  const follower = source(false);
  owner.shared.destroy();
  await vi.advanceTimersByTimeAsync(6500);
  expect(follower.state).toHaveBeenLastCalledWith("off", expect.stringContaining("authorize"));
});
