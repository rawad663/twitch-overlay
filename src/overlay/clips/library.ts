import {
  CLIPS_KEY,
  CLIP_PLAYS_KEY,
  type ClipEntry,
  type ClipLibrary,
  type ClipPlayRecord,
  type ClipPlays,
} from "@/bus/types";
import { readJSON, writeJSON } from "@/bus/storage";

/** Hard cap so a library replace stays a reasonable bus payload. */
export const CLIP_LIBRARY_CAP = 50;

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

function validSlug(raw: string | undefined): string | null {
  if (!raw) return null;
  const slug = raw.split("?")[0]?.split("#")[0] ?? "";
  return SLUG.test(slug) ? slug : null;
}

/**
 * Pull a clip slug out of any URL Twitch hands out, or a bare slug. Returns
 * null rather than a guess — a bad paste must not become a broken embed.
 */
export function parseClipSlug(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "clips.twitch.tv") {
      const fromQuery = validSlug(u.searchParams.get("clip") ?? "");
      if (fromQuery) return fromQuery;
      const first = u.pathname.split("/").filter(Boolean)[0];
      if (first && first.toLowerCase() !== "embed") return validSlug(first);
    }

    if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const clipIdx = parts.findIndex((p) => p.toLowerCase() === "clip");
      if (clipIdx !== -1) return validSlug(parts[clipIdx + 1]);
    }
  } catch {
    /* not a URL — fall through to a bare slug */
  }

  return validSlug(raw);
}

function asEntry(raw: unknown): ClipEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<ClipEntry>;
  const slug = validSlug(String(d.slug ?? ""));
  if (!slug) return null;
  const duration = Number(d.duration);
  return {
    slug,
    title: String(d.title ?? slug).trim().slice(0, 80) || slug,
    creator: String(d.creator ?? "").trim().slice(0, 32),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 30,
    thumb: String(d.thumb ?? ""),
    enabled: d.enabled !== false,
    addedAt: typeof d.addedAt === "number" && d.addedAt > 0 ? d.addedAt : Date.now(),
    unresolved: d.unresolved === true ? true : undefined,
  };
}

/** Clean, de-duplicate and cap a library from storage or the wire. */
export function normalizeClips(raw: unknown): ClipEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as ClipLibrary).clips)
      ? (raw as ClipLibrary).clips
      : [];
  const out: ClipEntry[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const entry = asEntry(item);
    if (!entry || seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    out.push(entry);
    if (out.length >= CLIP_LIBRARY_CAP) break;
  }
  return out;
}

export function loadLibrary(): ClipEntry[] {
  const stored = readJSON<ClipLibrary | ClipEntry[]>(CLIPS_KEY);
  return normalizeClips(stored);
}

export function persistLibrary(clips: ClipEntry[]): void {
  writeJSON(CLIPS_KEY, { v: 1, clips: normalizeClips(clips) } satisfies ClipLibrary);
}

export function loadPlays(): ClipPlays {
  const stored = readJSON<ClipPlays>(CLIP_PLAYS_KEY);
  if (!stored || typeof stored !== "object") return {};
  const out: ClipPlays = {};
  for (const [slug, rec] of Object.entries(stored)) {
    if (!validSlug(slug) || !rec || typeof rec !== "object") continue;
    const count = Number((rec as ClipPlayRecord).count);
    const lastAt = Number((rec as ClipPlayRecord).lastAt);
    if (!Number.isFinite(count) || count < 0) continue;
    out[slug] = {
      count: Math.floor(count),
      lastAt: Number.isFinite(lastAt) && lastAt > 0 ? lastAt : 0,
    };
  }
  return out;
}

export function persistPlays(plays: ClipPlays): void {
  writeJSON(CLIP_PLAYS_KEY, plays);
}

export function playCounts(plays: ClipPlays): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [slug, rec] of Object.entries(plays)) out[slug] = rec.count;
  return out;
}
