import { CONFIG } from "@/config/config";
import type { AlertKind } from "@/bus/types";
import type { ChatMessage, NoticeMessage, ParsedMessage } from "./parse";

/**
 * Everything the command dispatcher is allowed to touch. Passing this in
 * rather than importing modules directly is what keeps the old file's
 * forward-reference tangle (Moon → Director → Milestones → Moon) from
 * becoming a real circular import.
 */
export type ChatDeps = {
  chill: boolean;
  /** feed the moon / chat-energy meter */
  ping: () => void;
  /** a chatter becomes a named star; names only, never message text */
  star: (login: string, name: string) => void;
  /** count mood words and discard them */
  vibe: (msg: string) => void;
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
  fate: (user: string) => void;
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
  /** per-viewer cooldown ledgers, keyed by command */
  cooldown: (name: string, login: string, seconds: number) => boolean;
  /** how much room is left before a full moon, so !moon can't complete one */
  moonHeadroom: () => number;
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

export function handle(m: ParsedMessage, deps: ChatDeps) {
  if (m.kind === "notice") return handleNotice(m, deps);
  return handleChat(m, deps);
}

function handleChat(m: ChatMessage, deps: ChatDeps) {
  deps.ping();
  deps.star(m.login, m.user);
  deps.vibe(m.msg);

  if (m.bits) deps.alerts.cheer(m.user, m.bits);

  // the broadcaster talking to their own chat isn't a "new voice"
  if (m.login !== CONFIG.channel && deps.firstMessage(m.login)) {
    deps.alerts.welcome(m.user);
  }

  if (!m.msg.startsWith("!")) return;
  const [cmd, ...rest] = m.msg.slice(1).split(/\s+/);
  const arg = rest.join(" ");
  const c = (cmd ?? "").toLowerCase();

  /* ── open to everyone ──
     The chill commands sit ABOVE the mod gate on purpose: they're for chat,
     not for mods. They rely on `star()` having already placed the sender. */

  if (c === "fate") return deps.fate(m.user);

  if (c === "wave") {
    if (deps.chill && deps.cooldown("wave", m.login, CONFIG.waveCooldown)) {
      deps.scene.wave(m.user);
    }
    return;
  }
  if (c === "heart") {
    if (deps.chill && deps.cooldown("heart", m.login, CONFIG.waveCooldown)) {
      deps.scene.bloom(m.login);
    }
    return;
  }
  if (c === "moon") {
    if (deps.chill && deps.cooldown("moon", m.login, CONFIG.moonCooldown)) {
      // always stop one short of full — chat still has to actually talk to land it
      const room = Math.min(CONFIG.moonNudge, deps.moonHeadroom());
      for (let i = 0; i < room; i++) deps.ping();
    }
    return;
  }

  if (c === "1" || c === "2") {
    if (deps.poll.isOpen()) deps.poll.vote(m.login, c === "1" ? "a" : "b");
    return;
  }

  /* ── mod / broadcaster only ── */
  if (!m.mod) return;

  // `!undo Maps` used to silently miss — the word is lowercased now
  const word = (rest[0] ?? "").toLowerCase();

  const key = deps.tally.resolve(c);
  if (key) return deps.tally.bump(key, 1);

  if (c === "undo") {
    const k = deps.tally.resolve(word);
    if (k) deps.tally.bump(k, -1);
    return;
  }
  if (c === "set") {
    const k = deps.tally.resolve(word);
    if (k) deps.tally.set(k, Math.max(0, parseInt(rest[1] ?? "", 10) || 0));
    return;
  }

  if (c === "poll") {
    const [q, a, b] = arg.split("|").map((x) => x.trim());
    return deps.poll.open(q || "Yes or no?", a || "Yes", b || "No");
  }
  if (c === "endpoll") {
    if (deps.poll.isOpen()) deps.poll.close();
    return;
  }
  if (c === "say") return deps.say("Rawad says —", arg);
  if (c === "testalert") return deps.testAlert((word || "sub") as AlertKind, m.user);

  if (c === "brb") return deps.scene.brb(rest[0]);
  if (c === "soon") return deps.scene.soon(rest[0]);
  if (c === "afk") return deps.scene.afk();
  if (c === "back") return deps.scene.back();
}
