import { describe, expect, it } from "vitest";
import type { ClipEntry, ClipPlays } from "@/bus/types";
import { clipBlock, pickClip, type ClipGate } from "./select";

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
    canShow: true,
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

describe("clipBlock", () => {
  it("allows a clean request on a visible source", () => {
    expect(clipBlock(gate())).toBeNull();
  });

  it("rejects a source that has stood down and a hidden source", () => {
    expect(clipBlock(gate({ canShow: false }))).not.toBeNull();
    expect(clipBlock(gate({ visible: false }))).not.toBeNull();
  });

  it("rejects while a clip, banner or poll is up", () => {
    expect(clipBlock(gate({ playing: true }))).not.toBeNull();
    expect(clipBlock(gate({ bannerActive: true }))).not.toBeNull();
    expect(clipBlock(gate({ pollOpen: true }))).not.toBeNull();
  });

  it("rejects an empty library or a killed switch", () => {
    expect(clipBlock(gate({ librarySize: 0 }))).not.toBeNull();
    expect(clipBlock(gate({ clipsEnabled: false }))).not.toBeNull();
  });

  it("honours the global cooldown", () => {
    expect(clipBlock(gate({ now: 50_000, lastGlobalAt: 40_000, clipCooldown: 120 }))).not.toBeNull();
    expect(clipBlock(gate({ now: 200_000, lastGlobalAt: 40_000, clipCooldown: 120 }))).toBeNull();
  });

  it("honours the rolling hourly cap", () => {
    const hourlyAt = Array.from({ length: 8 }, (_, i) => 9_000 - i * 1_000);
    expect(clipBlock(gate({ hourlyAt, clipHourlyCap: 8 }))).not.toBeNull();
    expect(clipBlock(gate({ hourlyAt: hourlyAt.slice(1), clipHourlyCap: 8 }))).toBeNull();
  });
});

describe("clipBlock — reasons", () => {
  it("says which gate held it, with time left for the timers", () => {
    expect(clipBlock(gate({ canShow: false }))?.text).toMatch(/another source/);
    expect(clipBlock(gate({ librarySize: 0 }))?.text).toMatch(/no enabled clips/);
    const cd = clipBlock(gate({ now: 50_000, lastGlobalAt: 40_000, clipCooldown: 120 }));
    expect(cd?.leftMs).toBe(110_000);
    expect(cd?.text).toMatch(/1:50 left/);
    const hourlyAt = Array.from({ length: 8 }, (_, i) => 9_000 - i * 1_000);
    expect(clipBlock(gate({ hourlyAt, clipHourlyCap: 8 }))?.leftMs).toBe(3_600_000 - (200_000 - 2_000));
  });

  it("gives no leftMs for gates a viewer can't wait out", () => {
    expect(clipBlock(gate({ bannerActive: true }))?.leftMs).toBeUndefined();
    expect(clipBlock(gate({ visible: false }))?.leftMs).toBeUndefined();
  });
});
