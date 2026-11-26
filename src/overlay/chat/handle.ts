import { CONFIG } from "@/config/config";
import type { AlertKind, CommandOutcome, SourceView } from "@/bus/types";
import { formatLeft } from "../claim";
import type { BalloonGlyph } from "./emotes";
import type { ChatMessage, NoticeMessage, ParsedMessage } from "./parse";

export type { CommandOutcome } from "@/bus/types";

/**
 * Everything the command dispatcher is allowed to touch. Passing this in
 * rather than importing modules directly is what keeps the old file's
 * forward-reference tangle (Moon → Director → Milestones → Moon) from
 * becoming a real circular import.
 */
export type ChatDeps = {
  chill: boolean;
  /** which layout this source draws — outcomes say what applies where */
  where: SourceView;
  /** feed the moon / chat-energy meter */
  ping: () => void;
  /** a chatter becomes a named star; names only, never message text */
  star: (login: string, name: string) => void;
  /** count mood words and discard them */
  vibe: (msg: string) => void;
  /** unicode emoji / Twitch emotes as rising glyphs — never the chat text */
  balloons: (glyphs: BalloonGlyph[]) => void;
  alerts: {
    welcome: (user: string) => void;
    sub: (user: string, months?: string | number) => void;
    gift: (user: string, recipient?: string) => void;
    massGift: (user: string, count?: string | number) => void;
    raid: (user: string, viewers?: string | number) => void;
    cheer: (user: string, bits?: string | number) => void;
  };
  scene: {
    wave: (name: string) => void;
    bloom: (login: string) => void;
    brb: (min?: string) => void;
    soon: (min?: string) => void;
    afk: () => void;
    back: () => void;
  };
  /** rolls unconditionally — the per-viewer gate lives here in handle() */
  fate: (user: string) => void;
  fatePoe: (user: string) => void;
  say: (who: string, line: string) => void;
  testAlert: (kind: AlertKind, user: string) => void;
  tally: {
    /** resolve a command word to a tally key, honouring singular/plural */
    resolve: (word: string) => string | null;
    bump: (key: string, delta: number) => void;
    set: (key: string, value: number) => void;
  };
  poll: {
    open: (text: string, a: string, b: string) => void;
    close: () => void;
    isOpen: () => boolean;
    vote: (login: string, which: "a" | "b") => void;
  };
  /** true the first time this login speaks in the session */
  firstMessage: (login: string) => boolean;
  /** per-viewer ledgers: 0 = allowed (and the cooldown starts), else ms left */
  cooldown: (name: string, login: string, seconds: number) => number;
  /** how much room is left before a full moon, so !moon can't complete one */
  moonHeadroom: () => number;
  /** play the least-shown clip; gates live in the hook, not here */
  clip: (user: string, login: string, isMod: boolean, msgId: string) => CommandOutcome | Promise<CommandOutcome>;
  /** answer !lab in chat (the replier serializes across sources) */
  lab: (msgId: string) => CommandOutcome;
  /** !so: their top clip, a "go check them out" card and a chat line — one source does it */
  shoutout: (login: string, msgId: string) => CommandOutcome | Promise<CommandOutcome>;
};

export function handleNotice(m: NoticeMessage, deps: ChatDeps) {
  deps.ping();
  const t = m.tags;
  switch (m.id) {
    case "sub":
    case "resub":
      deps.alerts.sub(m.user, t["msg-param-cumulative-months"] ?? t["msg-param-months"]);
      break;
    case "subgift":
    case "anonsubgift":
      deps.alerts.gift(m.user, t["msg-param-recipient-display-name"]);
      break;
    case "submysterygift":
      deps.alerts.massGift(m.user, t["msg-param-mass-gift-count"]);
      break;
    case "raid":
      deps.alerts.raid(
        t["msg-param-displayName"] ?? m.user,
        t["msg-param-viewerCount"],
      );
      break;
  }
}

/**
 * Null for anything that isn't a `!command`. Otherwise what this source did
 * with it — the dock tester shows these, and a `leftMs` outcome is what a
 * viewer gets told about in chat.
 */
export type HandleResult = CommandOutcome | Promise<CommandOutcome> | null;

export function handle(m: ParsedMessage, deps: ChatDeps): HandleResult {
  if (m.kind === "notice") {
    handleNotice(m, deps);
    return null;
  }
  return handleChat(m, deps);
}

const MOD_WORDS = new Set([
  "undo", "set", "poll", "endpoll", "say", "testalert", "brb", "soon", "afk", "back",
]);

const ok = (cmd: string, text: string): CommandOutcome => ({ cmd, ok: true, text });
const no = (cmd: string, text: string): CommandOutcome => ({ cmd, ok: false, text });
const waiting = (cmd: string, text: string, leftMs: number): CommandOutcome => ({
  cmd,
  ok: false,
  text: `${text} — ${formatLeft(leftMs)} left`,
  leftMs,
});

function handleChat(m: ChatMessage, deps: ChatDeps): HandleResult {
  deps.ping();
  deps.star(m.login, m.user);
  deps.vibe(m.msg);
  // before bits/commands so `!fate 🔥` still floats the fire
  if (m.glyphs.length) deps.balloons(m.glyphs);

  if (m.bits) deps.alerts.cheer(m.user, m.bits);

  // the broadcaster talking to their own chat isn't a "new voice"
  if (m.login !== CONFIG.channel && deps.firstMessage(m.login)) {
    deps.alerts.welcome(m.user);
  }

  if (!m.msg.startsWith("!")) return null;
  const [cmd, ...rest] = m.msg.slice(1).split(/\s+/);
  const arg = rest.join(" ");
  const c = (cmd ?? "").toLowerCase();

  /* ── open to everyone ──
     The chill commands sit ABOVE the mod gate on purpose: they're for chat,
     not for mods. They rely on `star()` having already placed the sender. */

  if (c === "fate" || c === "fatepoe") {
    // !fatepoe shares the !fate ledger on purpose
    const left = deps.cooldown("fate", m.login, CONFIG.fateCooldown);
    if (left) return waiting(c, `cooling down for ${m.user}`, left);
    if (c === "fate") deps.fate(m.user);
    else deps.fatePoe(m.user);
    return ok(c, deps.where === "away" ? "rolled (banner shows on the HUD layered above)" : "rolled — banner queued");
  }

  if (c === "wave" || c === "heart" || c === "moon") {
    if (!deps.chill) return no(c, "lounge (?mode=chill) only — ignored here");
    const left =
      c === "moon"
        ? deps.cooldown("moon", m.login, CONFIG.moonCooldown)
        : deps.cooldown(c, m.login, CONFIG.waveCooldown);
    if (left) return waiting(c, `cooling down for ${m.user}`, left);
    if (c === "wave") deps.scene.wave(m.user);
    else if (c === "heart") deps.scene.bloom(m.login);
    else {
      // always stop one short of full — chat still has to actually talk to land it
      const room = Math.min(CONFIG.moonNudge, deps.moonHeadroom());
      for (let i = 0; i < room; i++) deps.ping();
      return ok(c, room ? `nudged the moon by ${room}` : "moon is one short of full — chat has to land it");
    }
    return ok(c, c === "wave" ? "shooting star sent" : "star bloomed");
  }

  if (c === "1" || c === "2") {
    if (!deps.poll.isOpen()) return no(c, "no poll open");
    deps.poll.vote(m.login, c === "1" ? "a" : "b");
    return ok(c, "vote counted (one per viewer)");
  }

  if (c === "clip") return deps.clip(m.user, m.login, m.mod, m.id);
  if (c === "lab") return deps.lab(m.id);

  // Rawad only — not mods: it plays audio over the stream and posts as the channel
  if (c === "so") {
    if (m.login !== CONFIG.channel) return no(c, "Rawad only");
    const target = (rest[0] ?? "").replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(target)) return no(c, "usage: !so <channel>");
    if (target === CONFIG.channel) return no(c, "that's your own channel");
    return deps.shoutout(target, m.id);
  }

  /* ── mod / broadcaster only ── */
  const key = deps.tally.resolve(c);
  if (!m.mod) return key || MOD_WORDS.has(c) ? no(c, "mods / broadcaster only") : no(c, "unknown command");

  // `!undo Maps` used to silently miss — the word is lowercased now
  const word = (rest[0] ?? "").toLowerCase();

  if (key) {
    deps.tally.bump(key, 1);
    return ok(c, `${key} +1`);
  }

  if (c === "undo") {
    const k = deps.tally.resolve(word);
    if (!k) return no(c, `no tally called "${word}"`);
    deps.tally.bump(k, -1);
    return ok(c, `${k} −1`);
  }
  if (c === "set") {
    const k = deps.tally.resolve(word);
    if (!k) return no(c, `no tally called "${word}"`);
    const v = Math.max(0, parseInt(rest[1] ?? "", 10) || 0);
    deps.tally.set(k, v);
    return ok(c, `${k} = ${v}`);
  }

  if (c === "poll") {
    const [q, a, b] = arg.split("|").map((x) => x.trim());
    deps.poll.open(q || "Yes or no?", a || "Yes", b || "No");
    return ok(c, "poll opened");
  }
  if (c === "endpoll") {
    if (!deps.poll.isOpen()) return no(c, "no poll open");
    deps.poll.close();
    return ok(c, "poll closed");
  }
  if (c === "say") {
    deps.say("Rawad says —", arg);
    return ok(c, "banner queued");
  }
  if (c === "testalert") {
    deps.testAlert((word || "sub") as AlertKind, m.user);
    return ok(c, `${word || "sub"} alert fired`);
  }

  if (c === "brb" || c === "soon" || c === "afk" || c === "back") {
    if (deps.where === "chill") return no(c, "the lounge ignores away commands");
    // the HUD has no scene, but it still runs these: it hands clips to the away scene
    if (c === "brb") deps.scene.brb(rest[0]);
    else if (c === "soon") deps.scene.soon(rest[0]);
    else if (c === "afk") deps.scene.afk();
    else deps.scene.back();
    if (deps.where === "hud") return ok(c, c === "back" ? "HUD takes clips back" : "HUD hands clips to the away scene");
    return ok(c, "away scene switched");
  }
  return no(c, "unknown command");
}
