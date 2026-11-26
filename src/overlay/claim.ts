import { readJSON, writeJSON } from "@/bus/storage";

const CLAIMS_KEY = "rawad-claims";
const RING = 60;

/**
 * Every OBS source receives the same chat line and the same bus command, so
 * anything that must happen ONCE (a clip, a chat reply) has to be claimed.
 * The Web Locks API is the only cross-page primitive that is actually atomic;
 * the id ring in storage covers the source that gets the lock second.
 *
 * `check` runs under the lock, so shared limits can be read and written
 * without a race. Without locks (old OBS, plain http) this degrades to
 * check-then-write, which narrows the window but cannot close it.
 */
export async function claimOnce(id: string, check?: () => boolean): Promise<boolean> {
  const take = () => {
    const seen = readJSON<string[]>(CLAIMS_KEY) ?? [];
    if (seen.includes(id)) return false;
    if (check && !check()) return false;
    seen.push(id);
    writeJSON(CLAIMS_KEY, seen.slice(-RING));
    return true;
  };
  if (typeof navigator === "undefined" || !navigator.locks) return take();
  try {
    return await navigator.locks.request("rawad-claim", () => take());
  } catch {
    return take();
  }
}

/** Seconds → "1:42" / "42s" for chat and the dock. */
export function formatLeft(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
