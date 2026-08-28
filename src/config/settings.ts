import { SETTINGS_KEY, type Settings, type SettingsPatch, type TallyDef } from "@/bus/types";
import { readJSON, writeJSON } from "@/bus/storage";
import { DEFAULT_SETTINGS } from "./config";

/** Numeric settings that must be a positive number to be accepted. */
const POSITIVE_KEYS = [
  "goalFollows",
  "goalSubs",
  "goalMessages",
  "milestoneFollows",
  "milestoneSubs",
  "brbMinutes",
  "fullMoonMessages",
  "bigCheer",
] as const;

/**
 * A tally's command word doubles as its storage key. Separators are stripped
 * rather than replaced, so "big drops" becomes "bigdrops" and `!bigdrops`
 * bumps it.
 */
export function slugKey(s: string): string {
  return (
    String(s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "tally"
  );
}

/** Clean, clamp and de-duplicate a tallyDefs list from the wire. */
export function normalizeTallyDefs(defs: unknown): TallyDef[] {
  if (!Array.isArray(defs)) return DEFAULT_SETTINGS.tallyDefs;
  const out: TallyDef[] = [];
  const taken = new Set<string>();
  for (const raw of defs) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Partial<TallyDef>;
    let key = slugKey(String(d.key ?? ""));
    // a duplicate key would make two rows share one counter
    if (taken.has(key)) {
      let n = 2;
      while (taken.has(`${key}${n}`)) n++;
      key = `${key}${n}`;
    }
    taken.add(key);
    const label = String(d.label ?? d.key ?? "Tally")
      .trim()
      .slice(0, 24);
    out.push({ key, label: label || "Tally" });
  }
  return out.length ? out : DEFAULT_SETTINGS.tallyDefs;
}

/**
 * Fold an incoming patch onto the current settings. Only keys that are
 * present AND the right type are taken — this is what lets the panel send a
 * partial object without clobbering the settings it has no UI for.
 */
export function mergeSettings(current: Settings, patch: SettingsPatch | null | undefined): Settings {
  if (!patch) return current;
  const next: Settings = { ...current };

  if (typeof patch.volume === "number") {
    next.volume = Math.max(0, Math.min(1, patch.volume));
  }
  if (typeof patch.muted === "boolean") next.muted = patch.muted;
  if (typeof patch.showMilestones === "boolean") next.showMilestones = patch.showMilestones;
  if (Array.isArray(patch.tallyDefs)) next.tallyDefs = normalizeTallyDefs(patch.tallyDefs);

  for (const k of POSITIVE_KEYS) {
    const v = patch[k];
    if (typeof v === "number" && v > 0) next[k] = v;
  }
  return next;
}

export function loadSettings(seed: Settings = DEFAULT_SETTINGS): Settings {
  // saved settings win over URL params — the panel is the control surface
  return mergeSettings(seed, readJSON<SettingsPatch>(SETTINGS_KEY));
}

export function persistSettings(s: Settings): void {
  writeJSON(SETTINGS_KEY, s);
}
