/**
 * Stage geometry — the single source of truth for every coordinate in the
 * product. The canvas draws, the star keep-out test and the `?guide=1` boxes
 * all read from here, so a lane can only move in one place.
 *
 * The stage is a fixed 1920x1080 that gets CSS-scaled to whatever size the OBS
 * browser source actually is. Nothing below is ever recomputed for a viewport.
 */

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** [x, y, width, height] */
export type Rect = readonly [number, number, number, number];

export type Zone = { readonly label: string; readonly rect: Rect };

/**
 * Path of Exile's own UI. The HUD must stay out of these, which is what pins
 * the strip to the narrow lane between the buff icons and the map info text.
 */
export const POE_ZONES: readonly Zone[] = [
  { label: "buffs", rect: [0, 0, 502, 70] },
  { label: "map info", rect: [1050, 24, 200, 170] },
  { label: "inventory / minimap", rect: [1255, 0, 665, 1080] },
  { label: "life · shield · ward", rect: [0, 760, 210, 110] },
  { label: "flasks · skills · orbs", rect: [0, 880, 1920, 200] },
];

/**
 * Where the HUD itself lives. The away scene is a *separate* OBS source
 * layered underneath the HUD, so its content has to clear all of these.
 */
export const HUD_LANES = {
  strip: [520, 16, 520, 76] as Rect,
  goals: [520, 100, 520, 50] as Rect,
  rail: [26, 132, 56, 680] as Rect,
  notice: [26, 96, 174, 16] as Rect,
  banner: [470, 620, 560, 202] as Rect,
} as const;

/**
 * Chill has no HUD layered over it, so it gets its own keep-out set. The
 * camera rect is the bounding SQUARE — the frame actually drawn is the circle
 * inscribed in it (see `cameraCircle`).
 */
export const CHILL_ZONES: readonly Zone[] = [
  { label: "title stack", rect: [80, 60, 620, 216] },
  { label: "camera (circle inscribed)", rect: [80, 300, 620, 620] },
  { label: "alert banner", rect: [860, 690, 700, 160] },
  { label: "guide · prompt", rect: [760, 856, 1100, 174] },
];

/** The moon, which differs between the away scene and chill. */
export const MOON = {
  away: { x: 1360, y: 400, r: 200 },
  chill: { x: 1420, y: 360, r: 190 },
} as const;

/**
 * Derive the camera circle from its bounding square. `camera` is
 * [x1, y1, x2, y2] so it can be tuned as a rect in CONFIG; the drawn frame is
 * always the inscribed circle, which is why a non-square value would look
 * wrong rather than stretched.
 */
export function cameraCircle(camera: readonly [number, number, number, number]) {
  const [x1, y1, x2, y2] = camera;
  const w = x2 - x1;
  const h = y2 - y1;
  const r = Math.min(w, h) / 2;
  return { cx: x1 + w / 2, cy: y1 + h / 2, r };
}

/** Blocked rects a star may not be placed inside, per mode. */
export function keepOut(chill: boolean): readonly Rect[] {
  return chill
    ? CHILL_ZONES.map((z) => z.rect)
    : [HUD_LANES.strip, HUD_LANES.goals, HUD_LANES.rail, HUD_LANES.notice, HUD_LANES.banner];
}

/** Scale factor + horizontal centring for the fixed stage in a given viewport. */
export function stageTransform(vw: number, vh: number) {
  const scale = Math.min(vw / STAGE_W, vh / STAGE_H);
  return { scale, left: (vw - STAGE_W * scale) / 2 };
}
