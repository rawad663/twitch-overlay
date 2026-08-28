"use client";

import { useState } from "react";
import type { AlertKind } from "@/bus/types";
import s from "../admin.module.css";
import { Button, Section } from "./ui";

const TEST_ALERTS: { kind: AlertKind; label: string }[] = [
  { kind: "follow", label: "Follow" },
  { kind: "sub", label: "Sub" },
  { kind: "resub", label: "Resub" },
  { kind: "gift", label: "Gift" },
  { kind: "massgift", label: "Mass gift" },
  { kind: "raid", label: "Raid" },
  { kind: "cheer", label: "Cheer" },
  { kind: "bigcheer", label: "Big cheer" },
  { kind: "burst", label: "Burst" },
];

export function Alerts({
  onTest,
  onSay,
  onFate,
  disabled,
}: {
  onTest: (kind: AlertKind) => void;
  onSay: (line: string) => void;
  onFate: () => void;
  disabled: boolean;
}) {
  const [line, setLine] = useState("");

  const say = () => {
    const t = line.trim();
    if (!t) return;
    onSay(t);
    setLine("");
  };

  return (
    <Section title="Alerts & oracle" disabled={disabled}>
      <div className={s.grid}>
        {TEST_ALERTS.map((a) => (
          <Button key={a.kind} onClick={() => onTest(a.kind)}>
            {a.label}
          </Button>
        ))}
      </div>
      <label className={s.label} htmlFor="oracleLine">
        Say something
      </label>
      <input
        id="oracleLine"
        className={s.input}
        placeholder="Message for the banner"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") say();
        }}
      />
      <div className={s.row2} style={{ marginTop: 8 }}>
        <Button onClick={say}>Send</Button>
        <Button variant="ghost" onClick={onFate}>
          Roll a fate
        </Button>
      </div>
    </Section>
  );
}
