"use client";

import { useState } from "react";
import type { PollSnapshot } from "@/bus/types";
import s from "../admin.module.css";
import { Button, Section } from "./ui";

export function PollPanel({
  poll,
  onOpen,
  onClose,
  disabled,
}: {
  poll: PollSnapshot | null | undefined;
  onOpen: (text: string, a: string, b: string) => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  let status = "No poll running.";
  if (poll?.open) {
    const total = poll.a + poll.b;
    const pa = total === 0 ? 50 : Math.round((poll.a / total) * 100);
    status = `Running · ${poll.left}s left · ${pa}% / ${100 - pa}%`;
  }

  return (
    <Section title="Poll" disabled={disabled}>
      <div className={s.hint} style={{ margin: "0 0 9px" }}>
        {status}
      </div>
      <input
        className={s.input}
        placeholder="Question"
        aria-label="Poll question"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={s.row2} style={{ marginTop: 7 }}>
        <input
          className={s.input}
          style={{ flex: 1, width: "auto" }}
          placeholder="Option !1"
          aria-label="Option 1"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
        <input
          className={s.input}
          style={{ flex: 1, width: "auto" }}
          placeholder="Option !2"
          aria-label="Option 2"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>
      <div className={s.row2} style={{ marginTop: 8 }}>
        <Button
          onClick={() => onOpen(q.trim() || "Yes or no?", a.trim() || "Yes", b.trim() || "No")}
        >
          Open poll
        </Button>
        <Button variant="ghost" onClick={onClose}>
          End poll
        </Button>
      </div>
    </Section>
  );
}
