"use client";

import { useEffect, useState } from "react";
import s from "../overlay.module.css";

/* Every fifth tick is longer and brighter, so the rail reads as a scale
   rather than a texture. */
const TICKS = Array.from({ length: 26 }, (_, i) => ({
  top: `${i * 3.85}%`,
  width: i % 5 === 0 ? 13 : 6,
  opacity: i % 5 === 0 ? 0.8 : 0.32,
}));

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

/** The left rail: session clock, tick marks and the crosshair mark. */
export function Rail({ t0 }: { t0: number }) {
  const [now, setNow] = useState(t0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={s.rail}>
      <svg className={s.glyph} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 2 2 6v14h5v3h3l3-3h4l5-5V2H4zm16 12-3 3h-4l-3 3v-3H7V4h13v10zM11 7h2v6h-2V7zm5 0h2v6h-2V7z" />
      </svg>
      <div className={s.railName}>Rawad</div>
      <div className={s.hair}>
        <div className={s.ticks}>
          {TICKS.map((t, i) => (
            <i key={i} style={{ top: t.top, width: t.width, opacity: t.opacity }} />
          ))}
        </div>
      </div>
      <svg className={s.crosshair} viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="9" />
        <circle className={s.core} cx="17" cy="17" r="2.4" />
        <line x1="17" y1="0" x2="17" y2="5" />
        <line x1="17" y1="29" x2="17" y2="34" />
        <line x1="0" y1="17" x2="5" y2="17" />
        <line x1="29" y1="17" x2="34" y2="17" />
      </svg>
      <div className={s.hair} />
      <div className={`${s.clock} ${s.num}`}>{fmt(now - t0)}</div>
    </div>
  );
}
