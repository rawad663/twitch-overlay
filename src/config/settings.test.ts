import { describe, expect, it } from "vitest";
import { mergeSettings, normalizeTallyDefs, slugKey } from "./settings";
import { DEFAULT_SETTINGS } from "./config";

describe("slugKey", () => {
  it("strips separators so the command word is one token", () => {
    expect(slugKey("Big Drops")).toBe("bigdrops");
    expect(slugKey("t1-maps")).toBe("t1maps");
  });
  it("falls back rather than producing an empty key", () => {
    expect(slugKey("!!!")).toBe("tally");
    expect(slugKey("")).toBe("tally");
  });
  it("clamps to 24 characters", () => {
    expect(slugKey("a".repeat(40))).toHaveLength(24);
  });
});

describe("normalizeTallyDefs", () => {
  it("de-duplicates keys so two rows can't share one counter", () => {
    const out = normalizeTallyDefs([
      { key: "maps", label: "Maps" },
      { key: "Maps", label: "More maps" },
    ]);
    expect(out.map((d) => d.key)).toEqual(["maps", "maps2"]);
  });

  it("falls back to defaults for junk", () => {
    expect(normalizeTallyDefs(null)).toEqual(DEFAULT_SETTINGS.tallyDefs);
    expect(normalizeTallyDefs([])).toEqual(DEFAULT_SETTINGS.tallyDefs);
  });

  it("uses the key as the label when none is given", () => {
    expect(normalizeTallyDefs([{ key: "deaths" }])).toEqual([
      { key: "deaths", label: "deaths" },
    ]);
  });
});

describe("mergeSettings", () => {
  it("keeps settings the panel has no UI for", () => {
    // the panel deliberately sends a partial object; a full one would clobber
    // brbMinutes / fullMoonMessages / bigCheer with stale values
    const cur = { ...DEFAULT_SETTINGS, bigCheer: 5000, brbMinutes: 42 };
    const next = mergeSettings(cur, { volume: 0.2, showMilestones: false });
    expect(next.bigCheer).toBe(5000);
    expect(next.brbMinutes).toBe(42);
    expect(next.volume).toBe(0.2);
    expect(next.showMilestones).toBe(false);
  });

  it("clamps volume to 0–1", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { volume: 9 }).volume).toBe(1);
    expect(mergeSettings(DEFAULT_SETTINGS, { volume: -3 }).volume).toBe(0);
  });

  it("rejects non-positive numbers rather than accepting a zero target", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { goalFollows: 0, goalSubs: -4 });
    expect(next.goalFollows).toBe(DEFAULT_SETTINGS.goalFollows);
    expect(next.goalSubs).toBe(DEFAULT_SETTINGS.goalSubs);
  });

  it("ignores wrong types instead of throwing", () => {
    const bad = { volume: "loud", muted: 1, tallyDefs: "nope" } as never;
    expect(() => mergeSettings(DEFAULT_SETTINGS, bad)).not.toThrow();
    expect(mergeSettings(DEFAULT_SETTINGS, bad).volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it("is a no-op for a null patch", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, null)).toBe(DEFAULT_SETTINGS);
  });

  it("trims and clamps an AFK reason, and empty clears it", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { afkReason: "  making lunch  " }).afkReason).toBe(
      "making lunch",
    );
    expect(mergeSettings(DEFAULT_SETTINGS, { afkReason: "x".repeat(60) }).afkReason).toHaveLength(48);
    const withReason = { ...DEFAULT_SETTINGS, afkReason: "a walk" };
    expect(mergeSettings(withReason, { afkReason: "   " }).afkReason).toBe("");
  });

  it("ignores a non-string AFK reason", () => {
    const bad = { afkReason: 12 } as never;
    expect(mergeSettings(DEFAULT_SETTINGS, bad).afkReason).toBe("");
  });
});
