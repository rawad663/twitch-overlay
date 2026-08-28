"use client";

import { useState } from "react";
import type { TallyCounts, TallyDef } from "@/bus/types";
import { slugKey } from "@/config/settings";
import s from "../admin.module.css";
import { Button, Section } from "./ui";

/**
 * The panel adopts the overlay's tallyDefs on the FIRST hello only, then owns
 * them — otherwise the 2s live sync would clobber a row mid-edit. Adding a
 * tally sends `settings` before any bump can happen, which matters: the
 * overlay ignores bumps for keys it doesn't yet know about.
 */
export function Tallies({
  defs,
  counts,
  onDefs,
  onBump,
  onSet,
  disabled,
}: {
  defs: TallyDef[];
  counts: TallyCounts | null | undefined;
  onDefs: (defs: TallyDef[]) => void;
  onBump: (key: string, delta: number) => void;
  onSet: (key: string, value: number) => void;
  disabled: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const edit = (i: number, patch: Partial<TallyDef>) => {
    const next = defs.map((d, j) => (j === i ? { ...d, ...patch } : d));
    onDefs(next);
  };

  const remove = (i: number) => {
    const next = defs.filter((_, j) => j !== i);
    // an empty strip would leave nothing to bump — keep one placeholder
    onDefs(next.length ? next : [{ key: "tally", label: "Tally" }]);
  };

  const add = () => {
    // `tally<len+1>` alone collides after a delete, so walk to a free key
    const taken = new Set(defs.map((d) => d.key));
    let n = defs.length + 1;
    while (taken.has(`tally${n}`)) n++;
    onDefs([...defs, { key: `tally${n}`, label: "New tally" }]);
  };

  const commitSet = (key: string) => {
    const v = parseInt(drafts[key] ?? "", 10);
    if (Number.isNaN(v) || v < 0) return;
    onSet(key, v);
    setDrafts((d) => ({ ...d, [key]: "" }));
  };

  return (
    <Section title="Tallies" disabled={disabled}>
      <div>
        {defs.map((d, i) => (
          <div className={s.tallyItem} key={i}>
            <div className={s.tallyEdit}>
              <input
                className={`${s.input} ${s.tallyLbl}`}
                value={d.label}
                aria-label="Tally label"
                onChange={(e) => edit(i, { label: e.target.value.slice(0, 24) })}
                onBlur={(e) => edit(i, { label: e.target.value.trim().slice(0, 24) || "Tally" })}
              />
              <input
                className={`${s.input} ${s.tallyKey}`}
                value={d.key}
                aria-label="Chat command"
                onChange={(e) => edit(i, { key: e.target.value })}
                onBlur={(e) => edit(i, { key: slugKey(e.target.value) })}
              />
              <Button variant="remove" onClick={() => remove(i)} aria-label={`Remove ${d.label}`}>
                ✕
              </Button>
            </div>
            <div className={s.tallyRow}>
              <span className={s.tallyVal}>{counts?.[d.key] ?? 0}</span>
              <Button variant="ghost" onClick={() => onBump(d.key, -1)}>
                −
              </Button>
              <Button variant="ghost" onClick={() => onBump(d.key, 1)}>
                +
              </Button>
              <input
                className={`${s.input} ${s.tallySet}`}
                type="number"
                placeholder="set…"
                aria-label={`Set ${d.label}`}
                value={drafts[d.key] ?? ""}
                onChange={(e) => setDrafts((x) => ({ ...x, [d.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitSet(d.key);
                }}
              />
              <Button variant="ghost" onClick={() => commitSet(d.key)}>
                Set
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button variant="ghost" onClick={add} style={{ marginTop: 10 }}>
        + Add tally
      </Button>
    </Section>
  );
}
