"use client";

import type { PollState } from "../hooks/usePoll";
import s from "../overlay.module.css";

export function Poll({ poll }: { poll: PollState | null }) {
  if (!poll) return <div className={s.poll} />;

  const total = poll.a + poll.b;
  const pa = total === 0 ? 50 : Math.round((poll.a / total) * 100);

  return (
    <div className={`${s.poll} ${s.on}`}>
      <div className={s.pq}>
        <span>{poll.text}</span>
        <span className={`${s.pTime} ${s.num}`}>{poll.left}s</span>
      </div>
      <div className={s.pBar}>
        <div className={s.pA} style={{ width: `${pa}%` }}>
          !1 {poll.aLabel}
        </div>
        <div className={s.pB} style={{ width: `${100 - pa}%` }}>
          {poll.bLabel} !2
        </div>
      </div>
    </div>
  );
}
