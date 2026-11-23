import { describe, expect, it } from "vitest";
import type { SupportCard } from "@/bus/types";
import { DEFAULT_SETTINGS } from "@/config/config";
import {
  CARD_LIMITS,
  DEFAULT_CARDS,
  DEFAULT_LIBRARY,
  bodyRuns,
  normalizeCardLibrary,
  uploadIds,
  validImageSrc,
} from "./library";
import { cardContext, cardEligible, describeWhen, labTonight, nextCardId, type CardContext } from "./rotation";

const card = (p: Partial<SupportCard> = {}): SupportCard => ({
  ...DEFAULT_CARDS[1]!,
  id: "abcd",
  ...p,
  when: { labs: "", days: [], from: "", until: "", ...p.when },
});

const ctx = (p: Partial<CardContext> = {}): CardContext => ({ date: "2026-12-16", weekday: 3, lab: "dev", ...p });

describe("validImageSrc", () => {
  it("keeps the four source kinds a card understands", () => {
    expect(validImageSrc("lib:renly")).toBe("lib:renly");
    expect(validImageSrc("up:abc123")).toBe("up:abc123");
    expect(validImageSrc("twitch:sub:2000")).toBe("twitch:sub:2000");
    expect(validImageSrc("https://static-cdn.jtvnw.net/x.png")).toBe("https://static-cdn.jtvnw.net/x.png");
  });
  it("drops anything that could run or leak", () => {
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://x.com/a.png", "lib:nope", 'https://x.com/"onerror', ""]) {
      expect(validImageSrc(bad)).toBe("");
    }
  });
});

describe("normalizeCardLibrary", () => {
  it("falls back to the defaults for junk", () => {
    expect(normalizeCardLibrary(null)).toEqual(DEFAULT_LIBRARY);
    expect(normalizeCardLibrary("nope")).toEqual(DEFAULT_LIBRARY);
  });

  it("keeps an emptied library empty instead of restoring the defaults", () => {
    expect(normalizeCardLibrary({ ...DEFAULT_LIBRARY, cards: [] }).cards).toEqual([]);
  });

  it("clamps text, seconds and position so a card can't overflow or leave the stage", () => {
    const lib = normalizeCardLibrary({
      ...DEFAULT_LIBRARY,
      seconds: 2,
      x: 5000,
      y: -40,
      cards: [card({ title: "x".repeat(200), kicker: "k".repeat(50), body: "  two   spaces  " })],
    });
    expect(lib.seconds).toBe(15);
    expect(lib.x).toBe(1920 - 320);
    expect(lib.y).toBe(0);
    expect(lib.cards[0]!.title).toHaveLength(CARD_LIMITS.title);
    expect(lib.cards[0]!.kicker).toHaveLength(CARD_LIMITS.kicker);
    expect(lib.cards[0]!.body).toBe("two spaces");
  });

  it("re-ids duplicates so Show never hits the wrong card", () => {
    const lib = normalizeCardLibrary({ ...DEFAULT_LIBRARY, cards: [card(), card()] });
    expect(new Set(lib.cards.map((c) => c.id)).size).toBe(2);
  });

  it("caps images at three and drops bad sources", () => {
    const images = ["lib:renly", "evil:x", "lib:orb", "lib:crown", "lib:una"].map((src) => ({ src, label: "" }));
    expect(normalizeCardLibrary({ ...DEFAULT_LIBRARY, cards: [card({ images })] }).cards[0]!.images.map((i) => i.src)).toEqual([
      "lib:renly",
      "lib:orb",
      "lib:crown",
    ]);
  });

  it("cleans the schedule", () => {
    const when = { labs: "weird", days: [3, 3, 9, 1], from: "soon", until: "2026-12-22" } as unknown as SupportCard["when"];
    expect(normalizeCardLibrary({ ...DEFAULT_LIBRARY, cards: [card({ when })] }).cards[0]!.when).toEqual({
      labs: "",
      days: [1, 3],
      from: "",
      until: "2026-12-22",
    });
  });
});

describe("bodyRuns", () => {
  it("turns **stars** into bold runs and nothing else", () => {
    expect(bodyRuns("I fix it live, **subs** first.")).toEqual([
      { text: "I fix it live, ", bold: false },
      { text: "subs", bold: true },
      { text: " first.", bold: false },
    ]);
    expect(bodyRuns("<b>no</b>")).toEqual([{ text: "<b>no</b>", bold: false }]);
  });
});

describe("uploadIds", () => {
  it("lists only uploads that saved cards still use", () => {
    const lib = { ...DEFAULT_LIBRARY, cards: [card({ images: [{ src: "up:aaaaaa", label: "" }, { src: "lib:orb", label: "" }] })] };
    expect([...uploadIds(lib)]).toEqual(["aaaaaa"]);
  });
});

describe("cardEligible", () => {
  it("respects the on/off switch", () => {
    expect(cardEligible(card({ enabled: false }), ctx())).toBe(false);
  });
  it("respects the date range, inclusive", () => {
    const c = card({ when: { labs: "", days: [], from: "2026-12-11", until: "2026-12-22" } });
    expect(cardEligible(c, ctx({ date: "2026-12-10" }))).toBe(false);
    expect(cardEligible(c, ctx({ date: "2026-12-11" }))).toBe(true);
    expect(cardEligible(c, ctx({ date: "2026-12-22" }))).toBe(true);
    expect(cardEligible(c, ctx({ date: "2026-12-23" }))).toBe(false);
  });
  it("respects days", () => {
    const c = card({ when: { labs: "", days: [1, 4], from: "", until: "" } });
    expect(cardEligible(c, ctx({ weekday: 3 }))).toBe(false);
    expect(cardEligible(c, ctx({ weekday: 4 }))).toBe(true);
  });
  it("matches lab kinds, and treats a lab of unknown kind as any", () => {
    const dev = card({ when: { labs: "dev", days: [], from: "", until: "" } });
    expect(cardEligible(dev, ctx({ lab: "dev" }))).toBe(true);
    expect(cardEligible(dev, ctx({ lab: "play" }))).toBe(false);
    expect(cardEligible(dev, ctx({ lab: "" }))).toBe(false);
    expect(cardEligible(dev, ctx({ lab: "lab" }))).toBe(true);
    const anyLab = card({ when: { labs: "any", days: [], from: "", until: "" } });
    expect(cardEligible(anyLab, ctx({ lab: "play" }))).toBe(true);
    expect(cardEligible(anyLab, ctx({ lab: "" }))).toBe(false);
  });
});

describe("labTonight", () => {
  // 2026-12-16 is a Wednesday; noon UTC is morning in Toronto
  const wed = new Date("2026-12-16T17:00:00Z");
  const fri = new Date("2026-12-18T17:00:00Z");
  it("falls back to the standing schedule", () => {
    expect(labTonight(DEFAULT_SETTINGS, wed)).toBe("dev");
    expect(labTonight(DEFAULT_SETTINGS, new Date("2026-12-14T17:00:00Z"))).toBe("play");
    expect(labTonight(DEFAULT_SETTINGS, fri)).toBe("");
  });
  it("lets a lab saved for today win, so a moved lab counts", () => {
    const moved = { ...DEFAULT_SETTINGS, labSummary: "Moved lab", labDate: "2026-12-18", labKind: "play" as const };
    expect(labTonight(moved, fri)).toBe("play");
    expect(cardContext(moved, fri)).toEqual({ date: "2026-12-18", weekday: 5, lab: "play" });
  });
});

describe("nextCardId", () => {
  const list = [card({ id: "aaaa" }), card({ id: "bbbb" }), card({ id: "cccc" })];
  it("walks in library order and wraps", () => {
    expect(nextCardId(list, "aaaa")).toBe("bbbb");
    expect(nextCardId(list, "cccc")).toBe("aaaa");
  });
  it("starts at the first when the current card is gone", () => {
    expect(nextCardId(list, "zzzz")).toBe("aaaa");
    expect(nextCardId(list, null)).toBe("aaaa");
    expect(nextCardId([], "aaaa")).toBe(null);
  });
});

describe("describeWhen", () => {
  it("summarises the schedule for the dock row", () => {
    expect(describeWhen(DEFAULT_CARDS[0]!)).toEqual(["Dev labs", "from Dec 16"]);
    expect(describeWhen(DEFAULT_CARDS[1]!)).toEqual(["Always"]);
    expect(describeWhen(DEFAULT_CARDS[3]!)).toEqual(["Dec 11 – Dec 22"]);
  });
});
