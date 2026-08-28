"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TALLY_KEY, type TallyCounts, type TallyDef } from "@/bus/types";
import { readJSON, writeJSON } from "@/bus/storage";

/**
 * Tally counts, persisted so a source reload doesn't lose the night's maps.
 *
 * A tally's command word doubles as its key, and both the singular and plural
 * form bump it — `!map` and `!maps` are the same counter, because nobody
 * remembers which one you configured.
 */
export function useTallies(defs: TallyDef[]) {
  const [counts, setCounts] = useState<TallyCounts>({});
  const [hit, setHit] = useState<string | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // adopt saved counts once, then keep the shape in step with the defs
  useEffect(() => {
    setCounts((cur) => {
      const saved = readJSON<TallyCounts>(TALLY_KEY) ?? {};
      const next: TallyCounts = {};
      for (const d of defs) next[d.key] = cur[d.key] ?? saved[d.key] ?? 0;
      return next;
    });
  }, [defs]);

  /** command word → tally key, honouring singular/plural */
  const aliases = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of defs) {
      m.set(d.key, d.key);
      if (d.key.endsWith("s")) m.set(d.key.slice(0, -1), d.key);
      else m.set(d.key + "s", d.key);
    }
    return m;
  }, [defs]);

  const resolve = useCallback((word: string) => aliases.get(word.toLowerCase()) ?? null, [aliases]);

  const flash = useCallback((key: string) => {
    setHit(key);
    if (hitTimer.current) clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => setHit(null), 720);
  }, []);

  const write = useCallback(
    (key: string, next: number) => {
      setCounts((cur) => {
        if (!(key in cur)) return cur; // a def the overlay doesn't know yet
        const out = { ...cur, [key]: Math.max(0, next) };
        writeJSON(TALLY_KEY, out);
        return out;
      });
      flash(key);
    },
    [flash],
  );

  const bump = useCallback(
    (key: string, delta: number) => {
      setCounts((cur) => {
        if (!(key in cur)) return cur;
        const out = { ...cur, [key]: Math.max(0, (cur[key] ?? 0) + delta) };
        writeJSON(TALLY_KEY, out);
        return out;
      });
      flash(key);
    },
    [flash],
  );

  const set = useCallback((key: string, value: number) => write(key, value), [write]);

  useEffect(
    () => () => {
      if (hitTimer.current) clearTimeout(hitTimer.current);
    },
    [],
  );

  return { counts, hit, resolve, bump, set };
}
