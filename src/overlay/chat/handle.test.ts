import { beforeEach, describe, expect, it, vi } from "vitest";
import { handle, type ChatDeps } from "./handle";
import { parse } from "./parse";
import { CONFIG } from "@/config/config";

function makeDeps(over: Partial<ChatDeps> = {}): ChatDeps {
  const seen = new Set<string>();
  return {
    chill: false,
    where: "hud",
    ping: vi.fn(),
    star: vi.fn(),
    vibe: vi.fn(),
    balloons: vi.fn(),
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
    fatePoe: vi.fn(),
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
    cooldown: () => 0,
    moonHeadroom: () => 99,
    clip: vi.fn(),
    lab: vi.fn(() => ({ cmd: "lab", ok: true, text: "replying in chat" })),
    shoutout: vi.fn(() => ({ cmd: "so", ok: true, text: "shoutout" })),
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

  it("floats unicode emoji as balloons", () => {
    handle(chat("nice 🔥"), d);
    expect(d.balloons).toHaveBeenCalledWith([{ kind: "emoji", text: "🔥" }]);
  });

  it("does not spawn balloons for plain text", () => {
    handle(chat("just talking"), d);
    expect(d.balloons).not.toHaveBeenCalled();
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
    expect(d.fatePoe).not.toHaveBeenCalled();
  });

  it("lets a non-mod roll !fatepoe", () => {
    const d = makeDeps();
    handle(chat("!fatepoe"), d);
    expect(d.fatePoe).toHaveBeenCalledWith("wick");
    expect(d.fate).not.toHaveBeenCalled();
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
    const d = makeDeps({ chill: true, cooldown: () => 5000 });
    handle(chat("!wave"), d);
    expect(d.scene.wave).not.toHaveBeenCalled();
  });

  it("lets a non-mod request !clip", () => {
    const d = makeDeps();
    handle(chat("!clip"), d);
    expect(d.clip).toHaveBeenCalledWith("wick", "wick", false, "");
  });

  it("tells !clip when the sender is a mod", () => {
    const d = makeDeps();
    handle(chat("!clip", { mod: true }), d);
    expect(d.clip).toHaveBeenCalledWith("wick", "wick", true, "");
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

describe("handle — outcomes", () => {
  it("returns null for plain chat and an outcome for every command", () => {
    const d = makeDeps();
    expect(handle(chat("hello"), d)).toBeNull();
    expect(handle(chat("!nope"), d)).toMatchObject({ cmd: "nope", ok: false, text: "unknown command" });
  });

  it("reports a cooldown with the time left, and does not roll", () => {
    const d = makeDeps({ cooldown: () => 42_000 });
    const o = handle(chat("!fate"), d);
    expect(o).toMatchObject({ cmd: "fate", ok: false, leftMs: 42_000 });
    expect(d.fate).not.toHaveBeenCalled();
  });

  it("!fatepoe shares the !fate ledger", () => {
    const names: string[] = [];
    const d = makeDeps({ cooldown: (n) => (names.push(n), 0) });
    handle(chat("!fatepoe"), d);
    expect(names).toEqual(["fate"]);
  });

  it("says the chill commands are lounge-only outside chill", () => {
    expect(handle(chat("!wave"), makeDeps())).toMatchObject({ ok: false, text: expect.stringMatching(/lounge/) });
  });

  it("tells a viewer a mod command is mods-only", () => {
    expect(handle(chat("!maps"), makeDeps())).toMatchObject({ ok: false, text: "mods / broadcaster only" });
    expect(handle(chat("!brb"), makeDeps())).toMatchObject({ ok: false, text: "mods / broadcaster only" });
  });

  it("routes !lab with trailing words, and with a client's invisible repeat marker", () => {
    const d = makeDeps();
    handle(chat("!lab what is it"), d);
    handle(chat("!lab \u{E0000}"), d);
    handle(chat("!lab\u{E0000}"), d);
    expect(d.lab).toHaveBeenCalledTimes(3);
  });

  it("passes the Twitch message id to !clip and !lab", () => {
    const d = makeDeps();
    const m = parse("@badges=;display-name=wick;id=abc-123;mod=0 :wick!x@x.tmi.twitch.tv PRIVMSG #rawad663 :!clip")!;
    handle(m, d);
    expect(d.clip).toHaveBeenCalledWith("wick", "wick", false, "abc-123");
  });

  it("lets the HUD run away commands so it can hand clips over", () => {
    const d = makeDeps({ where: "hud" });
    expect(handle(chat("!brb 5", { mod: true }), d)).toMatchObject({ ok: true });
    expect(d.scene.brb).toHaveBeenCalledWith("5");
    const c = makeDeps({ where: "chill", chill: true });
    expect(handle(chat("!brb", { mod: true }), c)).toMatchObject({ ok: false });
    expect(c.scene.brb).not.toHaveBeenCalled();
  });
});

describe("handle — !so", () => {
  const broadcaster = (msg: string) =>
    parse(`@badges=broadcaster/1;display-name=Rawad663;id=m9;mod=0 :rawad663!x@x.tmi.twitch.tv PRIVMSG #rawad663 :${msg}`)!;

  it("is Rawad's alone — not even mods", () => {
    const d = makeDeps();
    expect(handle(chat("!so friend", { mod: true }), d)).toMatchObject({ ok: false, text: "Rawad only" });
    expect(handle(chat("!so friend"), d)).toMatchObject({ ok: false, text: "Rawad only" });
    expect(d.shoutout).not.toHaveBeenCalled();
  });

  it("takes the channel with or without @, lowercased, with the message id", () => {
    const d = makeDeps();
    handle(broadcaster("!so @FriendlyStreamer"), d);
    expect(d.shoutout).toHaveBeenCalledWith("friendlystreamer", "m9");
  });

  it("refuses a missing or malformed channel, and your own", () => {
    const d = makeDeps();
    expect(handle(broadcaster("!so"), d)).toMatchObject({ ok: false, text: expect.stringMatching(/usage/) });
    expect(handle(broadcaster("!so not-a-login!"), d)).toMatchObject({ ok: false });
    expect(handle(broadcaster("!so rawad663"), d)).toMatchObject({ ok: false });
    expect(d.shoutout).not.toHaveBeenCalled();
  });
});
