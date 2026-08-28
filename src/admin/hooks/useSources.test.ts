import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/config/config";
import type { AwaySnapshot, HelloPayload, Totals } from "@/bus/types";
import { composeLive, type Source } from "./useSources";

const TOTALS: Totals = {
  follows: 1200,
  subs: 40,
  followsState: "ok",
  subsState: "ok",
};

const IDLE: AwaySnapshot = {
  state: "idle",
  until: 0,
  since: 1,
  follows: 0,
  subs: 0,
  messages: 0,
};

const BRB: AwaySnapshot = {
  state: "brb",
  until: 1_700_000_000_000,
  since: 1_699_999_100_000,
  follows: 2,
  subs: 1,
  messages: 14,
};

function hello(partial: Partial<HelloPayload> & Pick<HelloPayload, "role" | "mode">): HelloPayload {
  return {
    demo: false,
    build: "bus-1",
    irc: "live",
    eventsub: "off",
    token: false,
    clientId: "",
    away: IDLE,
    tally: {},
    poll: { open: false },
    settings: DEFAULT_SETTINGS,
    ...partial,
  };
}

function src(
  partial: Partial<HelloPayload> & Pick<HelloPayload, "role" | "mode">,
  at = 1000,
): Source {
  return { ...hello(partial), at };
}

describe("composeLive", () => {
  it("returns null when nothing is saying hello", () => {
    expect(composeLive([])).toBeNull();
  });

  it("keeps BRB when the HUD's idle hello arrives after the away scene", () => {
    const live = composeLive([
      src({ role: "scene", mode: "scene", away: BRB }, 1000),
      src({ role: "hud", mode: "hud", away: IDLE, totals: TOTALS }, 2000),
    ]);
    expect(live?.away).toEqual(BRB);
    expect(live?.totals).toEqual(TOTALS);
    expect(live?.role).toBe("hud");
  });

  it("keeps BRB when chill's hello arrives after the away scene", () => {
    const live = composeLive([
      src({ role: "scene", mode: "scene", away: BRB }, 1000),
      src({ role: "scene", mode: "chill", away: { ...IDLE, state: "chill" } }, 2000),
    ]);
    expect(live?.away).toEqual(BRB);
  });

  it("does not let a scene hello blank HUD totals", () => {
    const live = composeLive([
      src({ role: "hud", mode: "hud", away: IDLE, totals: TOTALS }, 1000),
      src({ role: "scene", mode: "scene", away: BRB }, 2000),
    ]);
    expect(live?.totals).toEqual(TOTALS);
    expect(live?.away).toEqual(BRB);
  });

  it("uses the HUD's idle away when no away scene is alive", () => {
    const live = composeLive([
      src({ role: "hud", mode: "hud", away: IDLE, totals: TOTALS }),
      src({ role: "scene", mode: "chill", away: { ...IDLE, state: "chill" } }, 2000),
    ]);
    expect(live?.away.state).toBe("idle");
  });

  it("treats mode=brb as the away authority, not just mode=scene", () => {
    const live = composeLive([
      src({ role: "hud", mode: "hud", away: IDLE, totals: TOTALS }, 2000),
      src({ role: "scene", mode: "brb", away: BRB }, 1000),
    ]);
    expect(live?.away).toEqual(BRB);
  });

  it("falls back to the HUD once the away scene has gone", () => {
    const live = composeLive([src({ role: "hud", mode: "hud", away: IDLE, totals: TOTALS })]);
    expect(live?.away.state).toBe("idle");
    expect(live?.totals).toEqual(TOTALS);
  });
});
