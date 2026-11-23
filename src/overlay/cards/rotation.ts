import type { Settings, SupportCard } from "@/bus/types";
import { easternDate, labActive } from "@/config/lab";

/** "" no lab tonight · "lab" a lab whose kind wasn't set · or the kind. */
export type LabTonight = "" | "lab" | "play" | "dev";

export type CardContext = {
  /** YYYY-MM-DD, Eastern */
  date: string;
  /** 0 = Sunday … 6 = Saturday, Eastern */
  weekday: number;
  lab: LabTonight;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function easternWeekday(now = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" }).format(now);
  return Math.max(0, WEEKDAYS.indexOf(short));
}

/**
 * Tonight's lab. A lab saved in the dock for today wins (it knows about moved
 * labs); otherwise the standing schedule decides — play labs Monday and
 * Thursday, the dev lab Wednesday — so a card still shows on a night the dock
 * lab wasn't filled in.
 */
export function labTonight(settings: Pick<Settings, "labSummary" | "labDate" | "labKind">, now = new Date()): LabTonight {
  if (labActive(settings, now)) return settings.labKind || "lab";
  const day = easternWeekday(now);
  if (day === 1 || day === 4) return "play";
  if (day === 3) return "dev";
  return "";
}

export function cardContext(settings: Pick<Settings, "labSummary" | "labDate" | "labKind">, now = new Date()): CardContext {
  return { date: easternDate(now), weekday: easternWeekday(now), lab: labTonight(settings, now) };
}

export function cardEligible(card: SupportCard, ctx: CardContext): boolean {
  if (!card.enabled) return false;
  const w = card.when;
  if (w.from && ctx.date < w.from) return false;
  if (w.until && ctx.date > w.until) return false;
  if (w.days.length && !w.days.includes(ctx.weekday)) return false;
  if (w.labs === "any" && !ctx.lab) return false;
  if ((w.labs === "play" || w.labs === "dev") && ctx.lab !== w.labs && ctx.lab !== "lab") return false;
  return true;
}

/** The card after `currentId` in library order, wrapping. Unknown or missing current → the first. */
export function nextCardId(eligible: readonly SupportCard[], currentId: string | null): string | null {
  if (!eligible.length) return null;
  const i = eligible.findIndex((c) => c.id === currentId);
  return eligible[(i + 1) % eligible.length]!.id;
}

/** One line for the dock's card row: when this card can show. */
export function describeWhen(card: SupportCard): string[] {
  const w = card.when;
  const out: string[] = [];
  if (w.labs === "any") out.push("Lab nights");
  if (w.labs === "play") out.push("Play labs");
  if (w.labs === "dev") out.push("Dev labs");
  if (w.days.length && w.days.length < 7) out.push(w.days.map((d) => WEEKDAYS[d]).join(" "));
  const md = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (w.from && w.until) out.push(`${md(w.from)} – ${md(w.until)}`);
  else if (w.from) out.push(`from ${md(w.from)}`);
  else if (w.until) out.push(`until ${md(w.until)}`);
  return out.length ? out : ["Always"];
}
