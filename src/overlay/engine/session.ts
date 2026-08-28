/**
 * The night's sky, shared across HUD / chill / away browser sources.
 *
 * Each OBS scene is its own page, so in-memory constellation and chat energy
 * die when you leave. Tallies already survive through localStorage; this is
 * the same trick for the atmosphere. Coordinates are not stored — chill and
 * away have different keep-outs, so Scene re-places every star on hydrate.
 *
 * Not a Bus message. A source that is shutting down must flush on pagehide
 * because the 1s throttle would otherwise lose the last minute of chat.
 */

import { CONFIG } from "@/config/config";
import { readJSON, writeJSON } from "@/bus/storage";
import { Vibe, type VibeMood, type VibeRecord } from "./vibe";

export const SESSION_KEY = "rawad-session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SAVE_THROTTLE_MS = 1000;

export type StarRecord = {
  login: string;
  name: string;
  born: number;
  last: number;
  bright: number;
};

export type SessionSnapshot = {
  v: 1;
  ts: number;
  beats: number[];
  stars: StarRecord[];
  recent: string[];
  vibe: VibeRecord;
  seen: string[];
};

const MOODS: ReadonlySet<string> = new Set(["calm", "cozy", "funny", "hype"]);

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseStar(raw: unknown): StarRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.login !== "string" || !o.login) return null;
  if (typeof o.name !== "string") return null;
  if (!isNum(o.born) || !isNum(o.last) || !isNum(o.bright)) return null;
  return { login: o.login, name: o.name, born: o.born, last: o.last, bright: o.bright };
}

function parseVibe(raw: unknown): VibeRecord {
  const empty: VibeRecord = { scores: { cozy: 0, funny: 0, hype: 0 }, mood: "calm" };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const scoresRaw = o.scores && typeof o.scores === "object" ? (o.scores as Record<string, unknown>) : {};
  const scores = {
    cozy: isNum(scoresRaw.cozy) ? scoresRaw.cozy : 0,
    funny: isNum(scoresRaw.funny) ? scoresRaw.funny : 0,
    hype: isNum(scoresRaw.hype) ? scoresRaw.hype : 0,
  };
  const mood: VibeMood = typeof o.mood === "string" && MOODS.has(o.mood) ? (o.mood as VibeMood) : "calm";
  return { scores, mood };
}

/** Drop a snapshot that is malformed or from a previous stream day. */
export function parseSession(raw: unknown, now = Date.now()): SessionSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !isNum(o.ts) || now - o.ts > SESSION_TTL_MS || now - o.ts < 0) return null;

  const beats = Array.isArray(o.beats) ? o.beats.filter(isNum) : [];
  const stars: StarRecord[] = [];
  if (Array.isArray(o.stars)) {
    for (const s of o.stars) {
      const rec = parseStar(s);
      if (rec) stars.push(rec);
    }
  }
  const recent = Array.isArray(o.recent)
    ? o.recent.filter((l): l is string => typeof l === "string" && l.length > 0)
    : [];
  const seen = Array.isArray(o.seen)
    ? o.seen.filter((l): l is string => typeof l === "string" && l.length > 0)
    : [];

  return { v: 1, ts: o.ts, beats, stars, recent, vibe: parseVibe(o.vibe), seen };
}

export function loadSession(now = Date.now()): SessionSnapshot | null {
  return parseSession(readJSON<unknown>(SESSION_KEY), now);
}

export function saveSession(snap: SessionSnapshot): boolean {
  return writeJSON(SESSION_KEY, snap);
}

/**
 * Fill the moon's `beats` array from a snapshot without reassigning it.
 * The scene engine and Vibe hold this exact reference.
 */
export function hydrateBeats(target: number[], beats: number[], now = Date.now()) {
  const keep = beats.filter((t) => now - t < 60000);
  target.splice(0, target.length, ...keep);
}

/**
 * Stars + vibe + welcome-ledger for every source, including the HUD (which
 * has no canvas). Scene re-places on mount; this only remembers who was here.
 */
export class SessionLedger {
  readonly stars = new Map<string, StarRecord>();
  recent: string[] = [];
  vibe = new Vibe();
  seen = new Set<string>();
  /** Snapshot beats, copied once into the moon — live timestamps stay on useMoon. */
  readonly beats: number[] = [];

  static from(snap: SessionSnapshot | null): SessionLedger {
    const ledger = new SessionLedger();
    if (!snap) return ledger;
    ledger.beats.push(...snap.beats);
    for (const rec of snap.stars) ledger.stars.set(rec.login, { ...rec });
    ledger.recent = snap.recent.slice();
    ledger.vibe.restore(snap.vibe);
    for (const login of snap.seen) ledger.seen.add(login);
    return ledger;
  }

  star(login: string, name: string) {
    const now = Date.now();
    let st = this.stars.get(login);
    if (!st) {
      st = { login, name, born: now, last: now, bright: 0 };
      this.stars.set(login, st);
      if (this.stars.size > CONFIG.maxStars) {
        let oldest: string | null = null;
        let oldestAt = Infinity;
        for (const [k, v] of this.stars) {
          if (v.last < oldestAt) {
            oldestAt = v.last;
            oldest = k;
          }
        }
        if (oldest) this.stars.delete(oldest);
      }
    }
    st.name = name;
    st.last = now;
    st.bright = 1;
    this.recent = [login, ...this.recent.filter((l) => l !== login)].slice(0, CONFIG.constellation);
  }

  note(msg: string) {
    this.vibe.note(msg);
  }

  see(login: string): boolean {
    if (this.seen.has(login)) return false;
    this.seen.add(login);
    return true;
  }

  dump(beats: number[], now = Date.now()): SessionSnapshot {
    return {
      v: 1,
      ts: now,
      beats: beats.filter((t) => now - t < 60000),
      stars: [...this.stars.values()],
      recent: this.recent.slice(),
      vibe: this.vibe.dump(),
      seen: [...this.seen],
    };
  }
}
