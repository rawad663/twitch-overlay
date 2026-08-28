/**
 * Alert tiers. `prio` decides what wins the banner when two things land at
 * once; `dur` is how long that banner holds the screen.
 *
 * The tier also picks the banner's colour treatment — `tier` names the CSS
 * variant, and null means "no special treatment".
 */
export type AlertType =
  | "raid"
  | "massgift"
  | "sub"
  | "gift"
  | "bigcheer"
  | "cheer"
  | "follow"
  | "welcome"
  | "system";

export type Tier = { prio: number; dur: number; tier: string | null };

export const TIERS: Record<AlertType, Tier> = {
  raid: { prio: 50, dur: 8500, tier: "raid" },
  massgift: { prio: 45, dur: 8000, tier: "massgift" },
  sub: { prio: 40, dur: 7000, tier: "sub" },
  gift: { prio: 40, dur: 7000, tier: "gift" },
  // a big cheer is loud, but it's bits — it borrows the cheer treatment
  bigcheer: { prio: 35, dur: 7000, tier: "cheer" },
  cheer: { prio: 20, dur: 5500, tier: "cheer" },
  follow: { prio: 15, dur: 4500, tier: null },
  welcome: { prio: 12, dur: 4200, tier: null },
  system: { prio: 10, dur: 9400, tier: null },
};

/** Types that must never be shed from a full queue — they cost real money. */
export const NEVER_SHED = new Set<AlertType>(["sub", "gift", "massgift", "raid"]);
