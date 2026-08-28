import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/config/config";
import {
  SESSION_TTL_MS,
  SessionLedger,
  hydrateBeats,
  parseSession,
  type SessionSnapshot,
} from "./session";
import { Scene } from "./scene";

function snap(over: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    v: 1,
    ts: Date.now(),
    beats: [],
    stars: [],
    recent: [],
    vibe: { scores: { cozy: 0, funny: 0, hype: 0 }, mood: "calm" },
    seen: [],
    ...over,
  };
}

describe("parseSession", () => {
  it("accepts a well-formed snapshot", () => {
    const now = Date.now();
    const out = parseSession(
      snap({
        ts: now,
        beats: [now - 1000],
        stars: [{ login: "alice", name: "Alice", born: now, last: now, bright: 1 }],
        recent: ["alice"],
        seen: ["alice"],
      }),
      now,
    );
    expect(out?.stars).toEqual([
      { login: "alice", name: "Alice", born: now, last: now, bright: 1 },
    ]);
    expect(out?.beats).toEqual([now - 1000]);
    expect(out?.seen).toEqual(["alice"]);
  });

  it("rejects a snapshot from yesterday", () => {
    expect(parseSession(snap({ ts: Date.now() - SESSION_TTL_MS - 1 }))).toBeNull();
  });

  it("rejects a future timestamp and a version bump", () => {
    expect(parseSession(snap({ ts: Date.now() + 60_000 }))).toBeNull();
    expect(parseSession({ ...snap(), v: 2 } as unknown)).toBeNull();
  });

  it("drops junk stars and non-number beats rather than throwing", () => {
    const now = Date.now();
    const out = parseSession(
      {
        v: 1,
        ts: now,
        beats: [now, "nope", NaN, now - 500],
        stars: [{ login: "ok", name: "Ok", born: now, last: now, bright: 0 }, { login: 1 }, null],
        recent: ["ok", 2, ""],
        seen: ["ok"],
        vibe: { scores: { hype: 3 }, mood: "hype" },
      },
      now,
    );
    expect(out?.beats).toEqual([now, now - 500]);
    expect(out?.stars).toEqual([{ login: "ok", name: "Ok", born: now, last: now, bright: 0 }]);
    expect(out?.recent).toEqual(["ok"]);
    expect(out?.vibe.mood).toBe("hype");
    expect(out?.vibe.scores.hype).toBe(3);
  });

  it("returns null for garbage", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("nope")).toBeNull();
  });
});

describe("hydrateBeats", () => {
  it("splices in place so Scene and Vibe keep the same array", () => {
    const now = Date.now();
    const target = [1, 2, 3];
    const same = target;
    hydrateBeats(target, [now, now - 90_000, now - 1000], now);
    expect(target).toBe(same);
    expect(target).toEqual([now, now - 1000]);
  });

  it("clears the array when nothing in the window is live", () => {
    const target = [1];
    hydrateBeats(target, [Date.now() - 90_000]);
    expect(target).toEqual([]);
  });
});

describe("SessionLedger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T18:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips stars, vibe, seen, and beats", () => {
    const now = Date.now();
    const a = new SessionLedger();
    a.star("alice", "Alice");
    a.note("pog");
    a.see("alice");
    const dumped = a.dump([now, now - 2000]);
    const parsed = parseSession(JSON.parse(JSON.stringify(dumped)), now);
    expect(parsed).not.toBeNull();
    const b = SessionLedger.from(parsed);
    expect(b.stars.get("alice")?.name).toBe("Alice");
    expect(b.recent).toEqual(["alice"]);
    expect(b.seen.has("alice")).toBe(true);
    expect(b.vibe.dump().scores.hype).toBe(1);
    expect(b.beats).toEqual([now, now - 2000]);
  });

  it("does not store x/y — placement belongs to the current scene layout", () => {
    const a = new SessionLedger();
    a.star("bob", "Bob");
    const rec = [...a.stars.values()][0];
    expect(rec).toEqual(
      expect.objectContaining({ login: "bob", name: "Bob" }),
    );
    expect(rec).not.toHaveProperty("x");
    expect(rec).not.toHaveProperty("y");
  });

  it("evicts the quietest star past maxStars", () => {
    const a = new SessionLedger();
    a.star("old", "Old");
    vi.advanceTimersByTime(5000);
    for (let i = 0; i < CONFIG.maxStars; i++) a.star(`u${i}`, `U${i}`);
    expect(a.stars.has("old")).toBe(false);
    expect(a.stars.size).toBe(CONFIG.maxStars);
  });

  it("see() is true only the first time a login appears", () => {
    const a = new SessionLedger();
    expect(a.see("alice")).toBe(true);
    expect(a.see("alice")).toBe(false);
  });

  it("from(null) is an empty ledger", () => {
    const a = SessionLedger.from(null);
    expect(a.stars.size).toBe(0);
    expect(a.beats).toEqual([]);
  });
});

describe("Scene.hydrate", () => {
  it("re-places stars for this layout and keeps the shared vibe", () => {
    const ledger = new SessionLedger();
    ledger.star("alice", "Alice");
    ledger.note("pog");
    const sc = new Scene({
      chill: true,
      mode: "chill",
      demo: false,
      minutes: null,
      beats: [],
      session: ledger,
      onStatus: () => {},
    });
    sc.hydrate(ledger);
    const star = sc.stars.get("alice");
    expect(star?.name).toBe("Alice");
    expect(star?.x).toBeGreaterThan(0);
    expect(star?.y).toBeGreaterThan(0);
    expect(sc.recent).toEqual(["alice"]);
    expect(sc.vibe).toBe(ledger.vibe);
  });
});
