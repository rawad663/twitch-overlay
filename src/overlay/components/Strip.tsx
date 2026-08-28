"use client";

import { useId } from "react";
import type { TallyCounts, TallyDef } from "@/bus/types";
import type { MoonState } from "../hooks/useMoon";
import s from "../overlay.module.css";

/**
 * The top strip — moon, chat-energy meter and the tally counters. It lives in
 * the narrow safe lane between PoE's buff icons (~x502) and the map info text
 * (~x1050), which is why it is only 520px wide.
 */
export function Strip({
  moon,
  defs,
  counts,
  hit,
}: {
  moon: MoonState;
  defs: TallyDef[];
  counts: TallyCounts;
  hit: string | null;
}) {
  // ids must be unique per instance — two overlays on one page would otherwise
  // share the gradient and mask
  const uid = useId().replace(/:/g, "");
  const litId = `lit-${uid}`;
  const phaseId = `phase-${uid}`;

  return (
    <div className={s.strip}>
      <div className={`${s.moonWrap} ${moon.full ? s.full : ""}`}>
        <svg className={s.moonSvg} viewBox="0 0 52 52" width={52} height={52} aria-hidden>
          <defs>
            <radialGradient id={litId} cx="38%" cy="34%">
              <stop offset="0%" stopColor="#FFFBF2" />
              <stop offset="100%" stopColor="#CDBBEB" />
            </radialGradient>
            <mask id={phaseId}>
              <circle cx="26" cy="26" r="19" fill="#fff" />
              {/* slide the shadow off to the right → waxing */}
              <circle cx={26 + moon.p * 40} cy="26" r="19" fill="#000" />
            </mask>
          </defs>
          <circle
            cx="26"
            cy="26"
            r="19"
            fill="rgba(122,47,242,.13)"
            stroke="rgba(169,123,255,.4)"
            strokeWidth="1"
          />
          <circle cx="26" cy="26" r="19" fill={`url(#${litId})`} mask={`url(#${phaseId})`} />
        </svg>
        {/* brush-stroke ring, echoes the swoosh under the wordmark */}
        <svg className={s.moonRing} viewBox="0 0 64 64" aria-hidden>
          <path d="M55 20a26 26 0 1 1-19-13" strokeDasharray="1 0" />
        </svg>
      </div>

      <div className={s.meters}>
        <div className={s.chatLabel}>
          Chat energy · <b>{moon.phase}</b>
        </div>
        <div className={s.track}>
          <div className={s.fill} style={{ width: `${moon.p * 100}%` }} />
        </div>
        <div className={`${s.quietHint} ${s.cap} ${moon.hint ? s.show : ""}`}>
          The moon awaits — type <b>!fate</b>
        </div>
      </div>

      <div className={s.tally}>
        {defs.map((d) => (
          <div key={d.key} className={`${s.stat} ${hit === d.key ? s.hit : ""}`}>
            {/* the key restarts the pop animation — the old code forced a reflow */}
            <span className={`${s.v} ${s.num}`} key={`${d.key}-${counts[d.key] ?? 0}`}>
              {counts[d.key] ?? 0}
            </span>
            <span className={s.k}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
