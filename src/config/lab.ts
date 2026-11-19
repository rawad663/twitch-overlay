import type { Settings } from "@/bus/types";
export const NO_LAB = "No lab today! Labs run Monday, Wednesday & Thursday, 7–10 PM Eastern. Play labs on Mon/Thu, dev lab on Wed.";
export function easternDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function labActive(settings: Pick<Settings, "labSummary" | "labDate">, now = new Date()): boolean {
  return !!settings.labSummary.trim() && settings.labDate === easternDate(now);
}
export function labReply(settings: Pick<Settings, "labSummary" | "labDate">, now = new Date()): string {
  return labActive(settings, now) ? `Today's lab: ${settings.labSummary.replace(/\s+/g, " ").trim().slice(0, 400)}` : NO_LAB;
}
