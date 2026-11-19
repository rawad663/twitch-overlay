"use client";
import { useState } from "react";
import type { Settings, SettingsPatch } from "@/bus/types";
import { easternDate, labReply } from "@/config/lab";
import { Button, Field, Hint, Section } from "./ui";
import s from "../admin.module.css";
export function Lab({ settings, save, disabled, notice }: { settings: Settings; save: (p: SettingsPatch) => void; disabled: boolean; notice?: string }) {
  const [summary, setSummary] = useState(settings.labSummary);
  const [date, setDate] = useState(settings.labDate || easternDate());
  return <Section title="Today's lab" disabled={disabled}>
    <Field id="labSummary" label="Lab summary">
      <textarea id="labSummary" className={s.input} rows={3} maxLength={400} value={summary} onChange={e => setSummary(e.target.value)} placeholder="What are we testing or building today?" />
    </Field>
    <Field id="labDate" label="Lab date (Eastern)">
      <input id="labDate" className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
    </Field>
    <Button disabled={disabled || !date} onClick={() => save({ labSummary: summary, labDate: date })}>Save lab</Button>{" "}
    <Button disabled={disabled} variant="ghost" onClick={() => { setSummary(""); setDate(easternDate()); save({ labSummary: "", labDate: "" }); }}>Clear lab</Button>
    <Hint>Chat reply preview: {labReply({ labSummary: summary, labDate: date })}</Hint>
    <Hint>Only replies for the selected date. Other dates use the lab schedule. !lab has a shared 15-second cooldown.</Hint>
    <div role="status"><Hint>{notice || "Waiting for the overlay's chat status…"}</Hint></div>
  </Section>;
}
