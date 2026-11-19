"use client";

import type { Settings } from "@/bus/types";
import s from "../overlay.module.css";

const KIND: Record<Settings["labKind"], string> = { "": "Lab night", play: "Play lab", dev: "Dev lab" };

/**
 * Top-right card that tells a newcomer what tonight's lab is testing. Only
 * shown on the lab's own Eastern date, the same rule `!lab` uses, so a
 * forgotten summary from last week never reaches the screen.
 */
export function LabCard({ active, settings }: { active: boolean; settings: Settings }) {
  const title = settings.labTitle.trim();
  const summary = settings.labSummary.trim();
  return (
    <div className={`${s.labCard} ${active ? s.on : ""}`} aria-hidden={!active}>
      <div className={`${s.labKicker} ${s.cap}`}>
        <i className={s.labDot} />
        {KIND[settings.labKind]} · live now
      </div>
      {title && <div className={s.labTitle}>{title}</div>}
      {summary && <div className={`${s.labSummary} ${title ? "" : s.labSummaryLead}`}>{summary}</div>}
      <div className={s.labFoot}>
        New here? Type <b>!lab</b> in chat
      </div>
    </div>
  );
}
