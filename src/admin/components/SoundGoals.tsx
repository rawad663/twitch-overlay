"use client";

import type { Settings, SettingsPatch } from "@/bus/types";
import s from "../admin.module.css";
import { Button, Field, Hint, NumberInput, Section } from "./ui";

export function SoundGoals({
  settings,
  patch,
}: {
  settings: Settings;
  patch: (p: SettingsPatch) => void;
}) {
  const pct = Math.round(settings.volume * 100);

  return (
    <Section title="Sound & goals">
      <label className={s.label} htmlFor="vol">
        Volume — {pct}%
      </label>
      <div className={s.row2}>
        <input
          id="vol"
          type="range"
          className={s.range}
          min={0}
          max={100}
          value={pct}
          onChange={(e) => patch({ volume: (parseInt(e.target.value, 10) || 0) / 100 })}
        />
        <Button
          variant={settings.muted ? "warn" : "ghost"}
          onClick={() => patch({ muted: !settings.muted })}
        >
          {settings.muted ? "Unmute" : "Mute"}
        </Button>
      </div>
      <div className={s.row2} style={{ marginTop: 4 }}>
        <Field label="Follows" id="gFollows">
          <NumberInput
            id="gFollows"
            value={settings.goalFollows}
            onChange={(n) => patch({ goalFollows: n })}
          />
        </Field>
        <Field label="Subs" id="gSubs">
          <NumberInput id="gSubs" value={settings.goalSubs} onChange={(n) => patch({ goalSubs: n })} />
        </Field>
        <Field label="Messages" id="gMessages">
          <NumberInput
            id="gMessages"
            value={settings.goalMessages}
            onChange={(n) => patch({ goalMessages: n })}
          />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Hint>Away goals. Saved and applied to every source.</Hint>
      </div>
    </Section>
  );
}
