"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG } from "@/config/config";

export type PollState = {
  text: string;
  aLabel: string;
  bLabel: string;
  a: number;
  b: number;
  ends: number;
  left: number;
  /** stays true through the 4s hold after close, so the result can be read */
  closing: boolean;
};

export function usePoll() {
  const [poll, setPoll] = useState<PollState | null>(null);
  const voters = useRef(new Set<string>());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  /** Leave the result up for a beat — a poll that vanishes on 0 reads as a bug. */
  const close = useCallback(() => {
    stop();
    setPoll((p) => (p ? { ...p, left: 0, closing: true } : null));
    if (hold.current) clearTimeout(hold.current);
    hold.current = setTimeout(() => setPoll(null), 4000);
  }, [stop]);

  const open = useCallback(
    (text: string, aLabel: string, bLabel: string) => {
      stop();
      if (hold.current) clearTimeout(hold.current);
      voters.current = new Set();
      const ends = Date.now() + CONFIG.pollSeconds * 1000;
      setPoll({ text, aLabel, bLabel, a: 0, b: 0, ends, left: CONFIG.pollSeconds, closing: false });

      tick.current = setInterval(() => {
        setPoll((p) => {
          if (!p || p.closing) return p;
          const left = Math.max(0, Math.ceil((p.ends - Date.now()) / 1000));
          if (left <= 0) {
            // close() can't run inside a setState updater, so defer it
            queueMicrotask(close);
            return { ...p, left: 0 };
          }
          return { ...p, left };
        });
      }, 250);
    },
    [stop, close],
  );

  const vote = useCallback((login: string, which: "a" | "b") => {
    setPoll((p) => {
      if (!p || p.closing) return p;
      if (voters.current.has(login)) return p;
      voters.current.add(login);
      return { ...p, [which]: p[which] + 1 };
    });
  }, []);

  const isOpen = useCallback(() => !!poll && !poll.closing, [poll]);

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );

  return { poll, open, close, vote, isOpen };
}
