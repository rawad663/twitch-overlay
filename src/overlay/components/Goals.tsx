"use client";

import type { Settings, Totals } from "@/bus/types";
import s from "../overlay.module.css";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

/**
 * Lifetime milestone bars — follower and sub totals against the targets set in
 * the dock. Distinct from the away scene's goals, which are session gains from
 * while you were gone.
 *
 * Hidden entirely when the dock says so, when there is nothing to show, or
 * while a banner/poll is up — it must never compete with an alert.
 */
export function Goals({
  totals,
  settings,
  suppressed,
}: {
  totals: Totals;
  settings: Settings;
  suppressed: boolean;
}) {
  const rows = [
    {
      key: "follows",
      label: "Followers",
      value: totals.follows,
      target: settings.milestoneFollows,
      on: totals.followsState === "ok" && totals.follows !== null,
    },
    {
      key: "subs",
      label: "Subs",
      value: totals.subs,
      target: settings.milestoneSubs,
      on: totals.subsState === "ok" && totals.subs !== null,
    },
  ];

  const any = rows.some((r) => r.on);
  const show = settings.showMilestones && any && !suppressed;

  return (
    <div className={`${s.goals} ${show ? s.on : ""}`}>
      {rows.map((r) => {
        if (!r.on || r.value === null) return null;
        const done = r.value >= r.target;
        const pct = Math.min(100, (r.value / Math.max(1, r.target)) * 100);
        return (
          <div key={r.key} className={`${s.goal} ${done ? s.done : ""}`}>
            <div className={s.goalRow}>
              <span>{r.label}</span>
              <b className={s.num}>
                {fmt(r.value)} / {fmt(r.target)}
              </b>
            </div>
            <div className={s.bar}>
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
