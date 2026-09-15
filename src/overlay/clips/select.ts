import type { ClipEntry, ClipPlays } from "@/bus/types";

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
  scene: boolean;
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

/** Every chat-side limit except the per-viewer ledger (mods skip that one). */
export function clipAllowed(g: ClipGate): boolean {
  if (!g.scene || !g.visible) return false;
  if (g.playing) return false;
  if (g.bannerActive || g.pollOpen) return false;
  if (!g.clipsEnabled || g.librarySize <= 0) return false;
  if (g.now - g.lastGlobalAt < g.clipCooldown * 1000) return false;
  const hour = g.hourlyAt.filter((t) => g.now - t < 3_600_000);
  return hour.length < g.clipHourlyCap;
}
