/**
 * The starting-soon trailer. The video itself is a local file, so it plays in
 * an OBS Media Source on its own scene: this page is served over HTTPS and can
 * neither read a local file nor ship a 500 MB video. The overlay's two jobs
 * are (1) the `?mode=soon` source cuts to that scene when the countdown
 * reaches the trailer's length, and (2) a transparent `?mode=trailer` source
 * layered over the video keeps a small countdown up and draws tonight's lab
 * over the video's end card.
 *
 * Everything here is pure so the timing can be tested without OBS.
 */

/** The trailer runs exactly two minutes, so it starts when two are left. */
export const TRAILER_LEAD_S = 120;
/** Where the trailer's end card begins: the slot tonight's card covers. */
export const TRAILER_CARD_S = 113.6;

export type TrailerTrigger = {
  /** OBS scene to cut to, exactly as it is named in OBS. */
  scene: string;
  leadMs: number;
};

export type TrailerLayerParams = {
  leadMs: number;
  cardMs: number;
  chip: boolean;
};

function seconds(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

/** `?mode=soon&trailer=<scene name>[&lead=120]`. Absent or blank means off. */
export function parseTrigger(qs: URLSearchParams): TrailerTrigger | null {
  const scene = (qs.get("trailer") ?? "").trim();
  if (!scene) return null;
  return { scene, leadMs: seconds(qs.get("lead"), TRAILER_LEAD_S, 10, 900) * 1000 };
}

/** `?mode=trailer[&lead=120][&card=113.6][&chip=0]` */
export function parseLayer(qs: URLSearchParams): TrailerLayerParams | null {
  if ((qs.get("mode") ?? "").toLowerCase() !== "trailer") return null;
  const lead = seconds(qs.get("lead"), TRAILER_LEAD_S, 10, 900);
  // a card that starts after the trailer ends would never show under it
  const card = Math.min(lead, seconds(qs.get("card"), TRAILER_CARD_S, 0, 900));
  return { leadMs: lead * 1000, cardMs: card * 1000, chip: qs.get("chip") !== "0" };
}

/**
 * True on the one tick where the countdown crosses the lead. A countdown that
 * starts at or under the lead never fires: there is no room left for the whole
 * trailer, and half of one ending after "we're live" is worse than none.
 */
export function trailerDue(prevLeftMs: number | null, leftMs: number, leadMs: number): boolean {
  return prevLeftMs !== null && prevLeftMs > leadMs && leftMs <= leadMs && leftMs > 0;
}

/** m:ss of what is left, rounded up so it reads 2:00 on the first frame and never 0:00 early. */
export function leftLabel(elapsedMs: number, leadMs: number): string {
  const s = Math.max(0, Math.ceil((leadMs - elapsedMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Headline size by length, so a five-word question and an 80-character one both fill the card. */
export function headlineSize(text: string): number {
  const n = text.length;
  if (n <= 28) return 132;
  if (n <= 48) return 108;
  if (n <= 80) return 86;
  return 58;
}
