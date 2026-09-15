import { describe, expect, it } from "vitest";
import type { ClipEntry, ClipPlays } from "@/bus/types";
import { clipAllowed, pickClip, type ClipGate } from "./select";

function clip(slug: string, enabled = true): ClipEntry {
  return {
    slug,
    title: slug,
    creator: "",
    duration: 20,
    thumb: "",
    enabled,
    addedAt: 1,
  };
}

function gate(over: Partial<ClipGate> = {}): ClipGate {
  return {
    scene: true,
    visible: true,
    playing: false,
    bannerActive: false,
    pollOpen: false,
    clipsEnabled: true,
    librarySize: 2,
    now: 200_000,
    lastGlobalAt: 0,
    hourlyAt: [],
    clipCooldown: 120,
    clipHourlyCap: 8,
    ...over,
  };
}

describe("pickClip", () => {
  it("returns null when nothing is enabled", () => {
    expect(pickClip([clip("a", false)], {}, null)).toBeNull();
    expect(pickClip([], {}, null)).toBeNull();
  });

  it("picks the least-played enabled clip", () => {
    const plays: ClipPlays = {
      a: { count: 3, lastAt: 1 },
      b: { count: 1, lastAt: 1 },
      c: { count: 5, lastAt: 1 },
    };
    expect(pickClip([clip("a"), clip("b"), clip("c", false)], plays, null)?.slug).toBe("b");
  });

  it("breaks a count tie with the oldest lastAt", () => {
    const plays: ClipPlays = {
      a: { count: 2, lastAt: 50 },
      b: { count: 2, lastAt: 10 },
    };
    expect(pickClip([clip("a"), clip("b")], plays, null)?.slug).toBe("b");
  });

  it("never repeats the last clip when another is eligible", () => {
    const plays: ClipPlays = {
      a: { count: 0, lastAt: 0 },
      b: { count: 4, lastAt: 1 },
    };
    expect(pickClip([clip("a"), clip("b")], plays, "a")?.slug).toBe("b");
  });

  it("repeats only when it is the only enabled clip", () => {
    expect(pickClip([clip("solo")], {}, "solo")?.slug).toBe("solo");
  });

  it("picks among a full tie with the given rng", () => {
    const list = [clip("a"), clip("b"), clip("c")];
    expect(pickClip(list, {}, null, () => 0)?.slug).toBe("a");
    expect(pickClip(list, {}, null, () => 0.99)?.slug).toBe("c");
  });
});

describe("clipAllowed", () => {
  it("allows a clean request on a visible scene", () => {
    expect(clipAllowed(gate())).toBe(true);
  });

  it("rejects the HUD and a hidden source", () => {
    expect(clipAllowed(gate({ scene: false }))).toBe(false);
    expect(clipAllowed(gate({ visible: false }))).toBe(false);
  });

  it("rejects while a clip, banner or poll is up", () => {
    expect(clipAllowed(gate({ playing: true }))).toBe(false);
    expect(clipAllowed(gate({ bannerActive: true }))).toBe(false);
    expect(clipAllowed(gate({ pollOpen: true }))).toBe(false);
  });

  it("rejects an empty library or a killed switch", () => {
    expect(clipAllowed(gate({ librarySize: 0 }))).toBe(false);
    expect(clipAllowed(gate({ clipsEnabled: false }))).toBe(false);
  });

  it("honours the global cooldown", () => {
    expect(clipAllowed(gate({ now: 50_000, lastGlobalAt: 40_000, clipCooldown: 120 }))).toBe(false);
    expect(clipAllowed(gate({ now: 200_000, lastGlobalAt: 40_000, clipCooldown: 120 }))).toBe(true);
  });

  it("honours the rolling hourly cap", () => {
    const hourlyAt = Array.from({ length: 8 }, (_, i) => 9_000 - i * 1_000);
    expect(clipAllowed(gate({ hourlyAt, clipHourlyCap: 8 }))).toBe(false);
    expect(clipAllowed(gate({ hourlyAt: hourlyAt.slice(1), clipHourlyCap: 8 }))).toBe(true);
  });
});
