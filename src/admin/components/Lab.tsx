"use client";
import { useState } from "react";
import type { LabKind, Settings, SettingsPatch } from "@/bus/types";
import { easternDate, labReply } from "@/config/lab";
import { Button, Field, Hint, Section } from "./ui";
import s from "../admin.module.css";
export function Lab({ settings, save, disabled, notice }: { settings: Settings; save: (p: SettingsPatch) => void; disabled: boolean; notice?: string }) {
  const [summary, setSummary] = useState(settings.labSummary);
  const [date, setDate] = useState(settings.labDate || easternDate());
  const [title, setTitle] = useState(settings.labTitle);
  const [kind, setKind] = useState<LabKind>(settings.labKind);
  return <Section title="Today's lab" disabled={disabled}>
    <Field id="labKind" label="Lab kind">
      <select id="labKind" className={s.input} value={kind} onChange={e => setKind(e.target.value as LabKind)}>
        <option value="">Lab night</option>
        <option value="play">Play lab</option>
        <option value="dev">Dev lab</option>
      </select>
    </Field>
    <Field id="labTitle" label="Card headline (on screen)">
      <input id="labTitle" className={s.input} maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="Can a 1-div build clear T15 maps?" />
    </Field>
    <Field id="labSummary" label="Lab summary (optional: on screen + !lab reply)">
      <textarea id="labSummary" className={s.input} rows={3} maxLength={400} value={summary} onChange={e => setSummary(e.target.value)} placeholder="What are we testing or building today?" />
    </Field>
    <Field id="labDate" label="Lab date (Eastern)">
      <input id="labDate" className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
    </Field>
    <Button disabled={disabled || !date || !(title.trim() || summary.trim())} onClick={() => save({ labSummary: summary, labDate: date, labTitle: title, labKind: kind })}>Save lab</Button>{" "}
    <Button disabled={disabled} variant="ghost" onClick={() => { setSummary(""); setTitle(""); setKind(""); setDate(easternDate()); save({ labSummary: "", labDate: "", labTitle: "", labKind: "" }); }}>Clear lab</Button>
    <Hint>Chat reply preview: {labReply({ labSummary: summary, labTitle: title, labDate: date })}</Hint>
    <Hint>A headline alone is enough; with no summary, !lab replies with the headline. The top-right card and the !lab reply only show on the selected date. Other dates reply with the lab schedule and hide the card. !lab has a shared 15-second cooldown.</Hint>
    <div role="status"><Hint>{notice || "Waiting for the overlay's chat status…"}</Hint></div>
  </Section>;
}
