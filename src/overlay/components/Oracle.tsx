"use client";

import type { AlertEvent } from "../director/director";
import s from "../overlay.module.css";

const TIER_CLASS: Record<string, string> = {
  sub: s.tSub!,
  gift: s.tGift!,
  massgift: s.tMassgift!,
  raid: s.tRaid!,
  cheer: s.tCheer!,
};

/**
 * The alert banner. `evt.html` is already escaped by `phrase()` — every value
 * that reaches it went through `esc()` first, and the only markup is the <b>
 * this file's own copy adds.
 *
 * The `key` on the wrapper is what restarts the unfurl animation for each new
 * event; the old code forced a reflow to do the same thing.
 */
export function Oracle({
  evt,
  lowered,
  chill,
}: {
  evt: AlertEvent | null;
  lowered: boolean;
  chill: boolean;
}) {
  if (!evt) return null;

  const tier = evt.tier ? (TIER_CLASS[evt.tier] ?? "") : "";

  return (
    <div
      key={evt.id}
      className={`${s.oracle} ${tier} ${lowered ? s.lowered : ""} ${chill ? s.chillOracle : ""}`}
      style={{ animationDuration: `${evt.dur}ms` }}
    >
      <div className={s.rod} />
      <div className={s.cloth}>
        <div className={s.oWho}>{evt.who}</div>
        <div className={s.oLine} dangerouslySetInnerHTML={{ __html: evt.html }} />
      </div>
    </div>
  );
}
