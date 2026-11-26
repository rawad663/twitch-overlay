import type { ClipEntry, ClipPlays, CommandOutcome } from "@/bus/types";
import { formatLeft } from "../claim";

/**
 * Least-played enabled clip. Ties go to the one idle longest, then a random
 * pick among what's left. The clip that just played is skipped when anything
 * else is eligible, so chat never sees the same one twice in a row.
 */
export function pickClip(
  clips: readonly ClipEntry[],
  plays: ClipPlays,
  lastSlug: string | null,
  rng: () => number = Math.random,
): ClipEntry | null {
  const enabled = clips.filter((c) => c.enabled);
  if (!enabled.length) return null;

  const pool =
    lastSlug && enabled.length > 1 ? enabled.filter((c) => c.slug !== lastSlug) : enabled;
  const candidates = pool.length ? pool : enabled;

  let best: ClipEntry[] = [];
  let bestCount = Infinity;
  let bestLast = Infinity;

  for (const clip of candidates) {
    const rec = plays[clip.slug];
    const count = rec?.count ?? 0;
    const lastAt = rec?.lastAt ?? 0;
    if (count < bestCount || (count === bestCount && lastAt < bestLast)) {
      bestCount = count;
      bestLast = lastAt;
      best = [clip];
    } else if (count === bestCount && lastAt === bestLast) {
      best.push(clip);
    }
  }

  if (!best.length) return null;
  const i = Math.min(best.length - 1, Math.max(0, Math.floor(rng() * best.length)));
  return best[i] ?? null;
}

export type ClipGate = {
  /** this source is the one that shows clips right now (see `canShow` in OverlayApp) */
  canShow: boolean;
  visible: boolean;
  playing: boolean;
  bannerActive: boolean;
  pollOpen: boolean;
  clipsEnabled: boolean;
  librarySize: number;
  now: number;
  lastGlobalAt: number;
  hourlyAt: readonly number[];
  clipCooldown: number;
  clipHourlyCap: number;
};

/**
 * Every chat-side limit except the per-viewer ledger (mods skip that one).
 * Null means allowed; otherwise the reason, so the dock tester can say which
 * gate held it and chat can be told how long a timer has left.
 */
export function clipBlock(g: ClipGate): CommandOutcome | null {
  const no = (text: string): CommandOutcome => ({ cmd: "clip", ok: false, text });
  if (!g.canShow) return no("another source has the clips while the away / lounge scene is on air");
  if (!g.visible) return no("this source is hidden in OBS");
  if (!g.clipsEnabled) return no("clip rotation is switched off in the dock");
  if (g.librarySize <= 0) return no("no enabled clips in the dock library");
  if (g.playing) return no("a clip is already playing");
  if (g.bannerActive) return no("an alert banner is on screen");
  if (g.pollOpen) return no("a poll is open");
  const sinceLast = g.now - g.lastGlobalAt;
  if (sinceLast < g.clipCooldown * 1000) {
    const left = g.clipCooldown * 1000 - sinceLast;
    return { cmd: "clip", ok: false, text: `channel cooldown — ${formatLeft(left)} left`, leftMs: left };
  }
  const hour = g.hourlyAt.filter((t) => g.now - t < 3_600_000);
  if (hour.length >= g.clipHourlyCap) {
    const left = 3_600_000 - (g.now - Math.min(...hour));
    return { cmd: "clip", ok: false, text: `hourly cap of ${g.clipHourlyCap} reached — ${formatLeft(left)} left`, leftMs: left };
  }
  return null;
}
