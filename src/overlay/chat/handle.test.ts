import { beforeEach, describe, expect, it, vi } from "vitest";
import { handle, type ChatDeps } from "./handle";
import { parse } from "./parse";
import { CONFIG } from "@/config/config";

function makeDeps(over: Partial<ChatDeps> = {}): ChatDeps {
  const seen = new Set<string>();
  return {
    chill: false,
    ping: vi.fn(),
    star: vi.fn(),
    vibe: vi.fn(),
    alerts: {
      welcome: vi.fn(),
      sub: vi.fn(),
      gift: vi.fn(),
      massGift: vi.fn(),
      raid: vi.fn(),
      cheer: vi.fn(),
    },
    scene: {
      wave: vi.fn(),
      bloom: vi.fn(),
      brb: vi.fn(),
      soon: vi.fn(),
      afk: vi.fn(),
      back: vi.fn(),
    },
    fate: vi.fn(),
    say: vi.fn(),
    testAlert: vi.fn(),
    tally: {
      resolve: (w: string) => (["maps", "map"].includes(w) ? "maps" : null),
      bump: vi.fn(),
      set: vi.fn(),
    },
    poll: { open: vi.fn(), close: vi.fn(), isOpen: () => false, vote: vi.fn() },
    firstMessage: (l: string) => {
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    },
    cooldown: () => true,
    moonHeadroom: () => 99,
    ...over,
  };
}

const chat = (msg: string, { mod = false, login = "wick", bits = 0 } = {}) =>
  parse(
    `@badges=${mod ? "moderator/1" : ""};display-name=${login};mod=${mod ? 1 : 0}${bits ? `;bits=${bits}` : ""} :${login}!x@x.tmi.twitch.tv PRIVMSG #rawad663 :${msg}`,
  )!;

describe("handle — every message", () => {
  let d: ChatDeps;
  beforeEach(() => {
    d = makeDeps();
  });

  it("feeds the moon, the sky and the vibe", () => {
    handle(chat("just talking"), d);
    expect(d.ping).toHaveBeenCalled();
    expect(d.star).toHaveBeenCalledWith("wick", "wick");
    expect(d.vibe).toHaveBeenCalledWith("just talking");
  });

  it("welcomes a login only on its first message", () => {
    handle(chat("hi"), d);
    handle(chat("again"), d);
    expect(d.alerts.welcome).toHaveBeenCalledTimes(1);
  });

  it("never welcomes the broadcaster", () => {
    handle(chat("hi", { login: CONFIG.channel }), d);
    expect(d.alerts.welcome).not.toHaveBeenCalled();
  });

  it("fires a cheer when the message carries bits", () => {
    handle(chat("cheer250", { bits: 250 }), d);
    expect(d.alerts.cheer).toHaveBeenCalledWith("wick", 250);
  });
});

describe("handle — open to everyone", () => {
  it("lets a non-mod roll !fate", () => {
    const d = makeDeps();
    handle(chat("!fate"), d);
    expect(d.fate).toHaveBeenCalledWith("wick");
  });

  it("lets a NON-MOD use the chill commands", () => {
    const d = makeDeps({ chill: true });
    handle(chat("!wave"), d);
    handle(chat("!heart"), d);
    expect(d.scene.wave).toHaveBeenCalledWith("wick");
    expect(d.scene.bloom).toHaveBeenCalledWith("wick");
  });

  it("ignores the chill commands outside chill", () => {
    const d = makeDeps({ chill: false });
    handle(chat("!wave"), d);
    expect(d.scene.wave).not.toHaveBeenCalled();
  });

  it("stops !moon one short of a full moon", () => {
    const d = makeDeps({ chill: true, moonHeadroom: () => 1 });
    handle(chat("!moon"), d);
    // CONFIG.moonNudge is 3, but only 1 of headroom was available
    expect(d.ping).toHaveBeenCalledTimes(2); // 1 for the message + 1 nudge
  });

  it("honours the per-viewer cooldown", () => {
    const d = makeDeps({ chill: true, cooldown: () => false });
    handle(chat("!wave"), d);
    expect(d.scene.wave).not.toHaveBeenCalled();
  });

  it("counts a poll vote once per login", () => {
    const d = makeDeps({
      poll: { open: vi.fn(), close: vi.fn(), isOpen: () => true, vote: vi.fn() },
    });
    handle(chat("!1"), d);
    handle(chat("!2"), d);
    expect(d.poll.vote).toHaveBeenNthCalledWith(1, "wick", "a");
    expect(d.poll.vote).toHaveBeenNthCalledWith(2, "wick", "b");
  });
});

describe("handle — the mod gate", () => {
  it("ignores mod commands from a normal viewer", () => {
    const d = makeDeps();
    handle(chat("!maps"), d);
    handle(chat("!afk"), d);
    handle(chat("!say something"), d);
    expect(d.tally.bump).not.toHaveBeenCalled();
    expect(d.scene.afk).not.toHaveBeenCalled();
    expect(d.say).not.toHaveBeenCalled();
  });

  it("bumps a tally by either singular or plural", () => {
    const d = makeDeps();
    handle(chat("!maps", { mod: true }), d);
    handle(chat("!map", { mod: true }), d);
    expect(d.tally.bump).toHaveBeenCalledTimes(2);
    expect(d.tally.bump).toHaveBeenCalledWith("maps", 1);
  });

  it("!undo is case-insensitive", () => {
    // `!undo Maps` used to silently miss, because the word was never lowercased
    const d = makeDeps();
    handle(chat("!undo Maps", { mod: true }), d);
    expect(d.tally.bump).toHaveBeenCalledWith("maps", -1);
  });

  it("!set is case-insensitive and clamps at zero", () => {
    const d = makeDeps();
    handle(chat("!set MAPS 12", { mod: true }), d);
    expect(d.tally.set).toHaveBeenCalledWith("maps", 12);
    handle(chat("!set maps -5", { mod: true }), d);
    expect(d.tally.set).toHaveBeenCalledWith("maps", 0);
  });

  it("opens a poll with defaults when parts are missing", () => {
    const d = makeDeps();
    handle(chat("!poll", { mod: true }), d);
    expect(d.poll.open).toHaveBeenCalledWith("Yes or no?", "Yes", "No");
  });

  it("opens a poll with all three parts", () => {
    const d = makeDeps();
    handle(chat("!poll Run it again? | Absolutely | No chance", { mod: true }), d);
    expect(d.poll.open).toHaveBeenCalledWith("Run it again?", "Absolutely", "No chance");
  });

  it("routes the away commands", () => {
    const d = makeDeps();
    handle(chat("!brb 20", { mod: true }), d);
    handle(chat("!soon 5", { mod: true }), d);
    handle(chat("!afk", { mod: true }), d);
    handle(chat("!back", { mod: true }), d);
    expect(d.scene.brb).toHaveBeenCalledWith("20");
    expect(d.scene.soon).toHaveBeenCalledWith("5");
    expect(d.scene.afk).toHaveBeenCalled();
    expect(d.scene.back).toHaveBeenCalled();
  });

  it("defaults !testalert to a sub", () => {
    const d = makeDeps();
    handle(chat("!testalert", { mod: true }), d);
    expect(d.testAlert).toHaveBeenCalledWith("sub", "wick");
  });

  it("does nothing for an unknown command", () => {
    const d = makeDeps();
    handle(chat("!definitelynotacommand", { mod: true }), d);
    expect(d.tally.bump).not.toHaveBeenCalled();
    expect(d.say).not.toHaveBeenCalled();
  });
});

describe("handle — usernotices", () => {
  const notice = (tags: string) => parse(`@${tags} :tmi.twitch.tv USERNOTICE #rawad663`)!;

  it("routes a resub with its month count", () => {
    const d = makeDeps();
    handle(notice("msg-id=resub;display-name=Wick;msg-param-cumulative-months=14"), d);
    expect(d.alerts.sub).toHaveBeenCalledWith("Wick", "14");
  });

  it("routes a gift to its recipient", () => {
    const d = makeDeps();
    handle(
      notice("msg-id=subgift;display-name=Gifter;msg-param-recipient-display-name=Lucky"),
      d,
    );
    expect(d.alerts.gift).toHaveBeenCalledWith("Gifter", "Lucky");
  });

  it("routes a mass gift with its count", () => {
    const d = makeDeps();
    handle(notice("msg-id=submysterygift;display-name=Big;msg-param-mass-gift-count=20"), d);
    expect(d.alerts.massGift).toHaveBeenCalledWith("Big", "20");
  });

  it("routes a raid with its viewer count", () => {
    const d = makeDeps();
    handle(
      notice("msg-id=raid;msg-param-displayName=Raider;msg-param-viewerCount=137"),
      d,
    );
    expect(d.alerts.raid).toHaveBeenCalledWith("Raider", "137");
  });
});
