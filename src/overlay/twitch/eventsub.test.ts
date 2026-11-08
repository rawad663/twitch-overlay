import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventSub } from "./eventsub";
import { helix, resolveUserId } from "./helix";

vi.mock("./helix", () => ({ helix: vi.fn(), resolveUserId: vi.fn() }));

class Socket {
  static all: Socket[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { Socket.all.push(this); }
  message(type: string, payload = {}) {
    this.onmessage?.({ data: JSON.stringify({ metadata: { message_type: type }, payload }) });
  }
  welcome(id = "session") {
    this.message("session_welcome", { session: { id, keepalive_timeout_seconds: 10 } });
  }
}

describe("Twitch follow listener", () => {
  let listener: EventSub;
  const follow = vi.fn();
  const status = vi.fn();
  const notice = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    Socket.all = [];
    vi.stubGlobal("WebSocket", Socket);
    vi.mocked(resolveUserId).mockResolvedValue("channel-id");
    vi.mocked(helix).mockResolvedValue(new Response(null, { status: 202 }));
    listener = new EventSub({ token: "test-token", clientId: "test-client" }, "channel", follow, status, notice);
  });
  afterEach(() => {
    listener.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  async function live() {
    await listener.start();
    Socket.all[0]!.welcome();
    await Promise.resolve();
    return Socket.all[0]!;
  }

  it("subscribes to channel.follow v2 and forwards a real notification", async () => {
    const ws = await live();
    expect(JSON.parse(String(vi.mocked(helix).mock.calls[0]![2]?.body))).toEqual({
      type: "channel.follow", version: "2",
      condition: { broadcaster_user_id: "channel-id", moderator_user_id: "channel-id" },
      transport: { method: "websocket", session_id: "session" },
    });
    expect(status).toHaveBeenLastCalledWith("live");
    ws.message("notification", { subscription: { type: "channel.follow" }, event: { user_name: "NewFollower" } });
    expect(follow).toHaveBeenCalledWith("NewFollower");
  });

  it("retries a socket that closes before welcome", async () => {
    await listener.start();
    Socket.all[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(5000);
    expect(Socket.all).toHaveLength(2);
  });

  it("recovers when the initial socket never sends welcome", async () => {
    await listener.start();
    await vi.advanceTimersByTimeAsync(20000);
    expect(Socket.all).toHaveLength(2);
    expect(Socket.all[0]!.close).toHaveBeenCalledOnce();
  });

  it("reconnects and resubscribes after a silent connection loss", async () => {
    await live();
    await vi.advanceTimersByTimeAsync(11000);
    expect(status).toHaveBeenLastCalledWith("connecting");
    await vi.advanceTimersByTimeAsync(5000);
    Socket.all[1]!.welcome("replacement");
    await Promise.resolve();
    expect(helix).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenLastCalledWith("live");
  });

  it("keeps a quiet but healthy connection alive", async () => {
    const ws = await live();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(10000);
      ws.message("session_keepalive");
    }
    expect(ws.close).not.toHaveBeenCalled();
    expect(Socket.all).toHaveLength(1);
  });

  it("hands off without recreating the transferred subscription", async () => {
    const ws = await live();
    ws.message("session_reconnect", { session: { reconnect_url: "wss://handoff.test/ws" } });
    expect(ws.close).not.toHaveBeenCalled();
    expect(Socket.all[1]!.url).toBe("wss://handoff.test/ws");
    Socket.all[1]!.welcome();
    expect(ws.close).toHaveBeenCalledOnce();
    expect(helix).toHaveBeenCalledOnce();
    Socket.all[1]!.message("notification", { subscription: { type: "channel.follow" }, event: { user_login: "viewer" } });
    expect(follow).toHaveBeenCalledWith("viewer");
  });

  it("cleans up both sockets during an unfinished handoff", async () => {
    const ws = await live();
    ws.message("session_reconnect", { session: { reconnect_url: "wss://handoff.test/ws" } });
    listener.destroy();
    expect(Socket.all.every((s) => s.close.mock.calls.length === 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(Socket.all).toHaveLength(2);
  });

  it("does not remain live after authorization is revoked", async () => {
    const ws = await live();
    ws.message("revocation", { subscription: { type: "channel.follow", status: "authorization_revoked" } });
    expect(status).toHaveBeenLastCalledWith("expired");
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining("authorize Twitch again"));
  });

  it("explains missing follower permissions without a retry loop", async () => {
    vi.mocked(helix).mockResolvedValue(new Response(null, { status: 403 }));
    await live();
    expect(status).toHaveBeenLastCalledWith("error");
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining("moderator:read:followers"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(Socket.all).toHaveLength(1);
  });

  it("retries failed channel resolution", async () => {
    vi.mocked(resolveUserId).mockResolvedValueOnce(null);
    await listener.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(Socket.all).toHaveLength(1);
  });

  it("ignores a subscription response after destruction", async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(helix).mockReturnValue(new Promise((r) => { resolve = r; }));
    await live();
    listener.destroy();
    status.mockClear();
    resolve(new Response(null, { status: 202 }));
    await Promise.resolve();
    expect(status).not.toHaveBeenCalled();
  });
});
