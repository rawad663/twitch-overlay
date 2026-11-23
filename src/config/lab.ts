import type { Settings } from "@/bus/types";
export const NO_LAB = "No lab today! Labs run Monday, Wednesday & Thursday, 7–10 PM Eastern. Play labs on Mon/Thu, dev lab on Wed.";
export function easternDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
type LabFields = Pick<Settings, "labSummary" | "labDate"> & { labTitle?: string };
/** A headline alone is enough — the summary is optional (Rawad, 2026-11-23). */
export function labActive(settings: LabFields, now = new Date()): boolean {
  return !!(settings.labSummary.trim() || settings.labTitle?.trim()) && settings.labDate === easternDate(now);
}
/** The summary when there is one, otherwise the headline. */
export function labReply(settings: LabFields, now = new Date()): string {
  const text = (settings.labSummary.trim() || settings.labTitle?.trim() || "").replace(/\s+/g, " ").slice(0, 400);
  return labActive(settings, now) ? `Today's lab: ${text}` : NO_LAB;
}
