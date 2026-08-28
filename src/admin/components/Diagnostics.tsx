"use client";

import { useState } from "react";
import type { Diagnostics as Diag } from "../hooks/useDiagnostics";
import s from "../admin.module.css";
import { Button, Section } from "./ui";

export function Diagnostics({ diag }: { diag: Diag }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(diag.report).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <Section title="Diagnostics">
      <div>
        {diag.rows.map((r) => (
          <div className={s.drow} key={r.key}>
            <span className={s.drowKey}>{r.key}</span>
            <span className={`${s.drowVal} ${r.ok ? s.yes : s.no}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <div className={s.verdict}>{diag.verdict}</div>
      <Button size="block" onClick={copy}>
        {copied ? "Copied!" : "Copy diagnostics"}
      </Button>
    </Section>
  );
}
