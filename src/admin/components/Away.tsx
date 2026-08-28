"use client";

import { useEffect, useState } from "react";
import type { AwaySnapshot } from "@/bus/types";
import s from "../admin.module.css";
import { Button, NumberInput, Section } from "./ui";

function fmt(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function readout(away: AwaySnapshot | null | undefined, now: number) {
  if (!away) return { label: "State", value: "—" };
  if (away.state === "brb" || away.state === "soon") {
    const left = away.until - now;
    const name = away.state === "brb" ? "BRB" : "Starting soon";
    return left < 0
      ? { label: `${name} — overrunning`, value: "any moment now" }
      : { label: `${name} — time left`, value: fmt(left) };
  }
  if (away.state === "afk") return { label: "AFK — elapsed", value: fmt(now - away.since) };
  if (away.state === "chill") return { label: "State", value: "Chill" };
  if (away.state === "back") return { label: "State", value: "Back" };
  return { label: "State", value: "Idle" };
}

export function Away({
  away,
  minutes,
  onMinutes,
  send,
  disabled,
}: {
  away: AwaySnapshot | null | undefined;
  minutes: number;
  onMinutes: (n: number) => void;
  send: (type: "away.brb" | "away.soon" | "away.afk" | "away.back" | "away.reset") => void;
  disabled: boolean;
}) {
  // the countdown has to tick on its own — hellos land every 2s, which would
  // make the readout stutter a second at a time
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const r = readout(away, now);

  return (
    <Section title="Away" disabled={disabled}>
      <div className={s.readout}>
        <small>{r.label}</small>
        {r.value}
      </div>
      <label className={s.label} htmlFor="brbMin">
        Minutes
      </label>
      <div className={s.row2}>
        <NumberInput
          id="brbMin"
          value={minutes}
          onChange={onMinutes}
          min={1}
          max={180}
          style={{ width: 78, flex: "0 0 78px" }}
        />
        <Button onClick={() => send("away.brb")}>Start BRB</Button>
        <Button onClick={() => send("away.soon")}>Starting soon</Button>
        <Button variant="ghost" onClick={() => send("away.reset")}>
          Reset
        </Button>
      </div>
      <div className={s.row2} style={{ marginTop: 8 }}>
        <Button variant="ghost" onClick={() => send("away.afk")}>
          AFK
        </Button>
        <Button variant="warn" onClick={() => send("away.back")}>
          Back now
        </Button>
      </div>
    </Section>
  );
}
