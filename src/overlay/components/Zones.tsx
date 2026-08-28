"use client";

import { CHILL_ZONES, POE_ZONES, type Zone } from "@/design/stage";
import s from "../overlay.module.css";

/**
 * `?guide=1` — the keep-out boxes, drawn from the same constants the canvas and
 * the HUD lanes use. Size the OBS camera source against the chill set once,
 * then drop the param.
 */
export function Zones({ chill }: { chill: boolean }) {
  const zones: readonly Zone[] = chill ? CHILL_ZONES : POE_ZONES;
  return (
    <>
      {zones.map((z) => (
        <div
          key={z.label}
          className={s.zone}
          style={{ left: z.rect[0], top: z.rect[1], width: z.rect[2], height: z.rect[3] }}
        >
          {z.label}
        </div>
      ))}
    </>
  );
}
