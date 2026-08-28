"use client";

import { useCallback, useRef, useState } from "react";
import { CONFIG } from "@/config/config";
import { useInterval } from "@/bus/useBus";
import { hydrateBeats } from "../engine/session";

export const PHASES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
];

/* ── quiet-chat hint ── */
const QUIET_THRESHOLD = 0.25;
const QUIET_HOLD_MS = 30000;
const QUIET_GRACE_MS = 45000;

export type MoonState = {
  /** 0–1 chat energy over the last 60s */
  p: number;
  phase: string;
  full: boolean;
  hint: boolean;
  count: number;
};

function hydrateCopy(beats: number[]): number[] {
  const target: number[] = [];
  hydrateBeats(target, beats);
  return target;
}

/**
 * The chat-energy meter. `beats` is a plain array of timestamps that the scene
 * engine and Vibe both read directly — it's the one piece of shared mutable
 * state in the overlay, and it stays a ref so a chat message never triggers a
 * React render.
 */
export function useMoon({
  suppressed,
  onFull,
  t0,
  initialBeats,
}: {
  /** banners and polls hold the hint down */
  suppressed: () => boolean;
  onFull: (count: number) => void;
  t0: number;
  /** restored chat-energy window from a previous source, copied in place */
  initialBeats?: number[];
}) {
  const beats = useRef<number[]>(initialBeats ? hydrateCopy(initialBeats) : []);
  const fullUntil = useRef(0);
  const quietStart = useRef<number | null>(null);
  const flareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<MoonState>(() => {
    const count = beats.current.length;
    const p = Math.min(1, count / Math.max(1, CONFIG.fullMoonMessages));
    return {
      p,
      phase: PHASES[Math.min(4, Math.floor(p * 4.999))]!,
      full: false,
      hint: false,
      count,
    };
  });

  const ping = useCallback(() => {
    beats.current.push(Date.now());
  }, []);

  useInterval(() => {
    const now = Date.now();
    // Trimmed IN PLACE, never reassigned: the scene engine and Vibe both hold a
    // reference to this exact array, and swapping it would leave them reading a
    // frozen copy forever.
    const b = beats.current;
    let keep = 0;
    while (keep < b.length && now - b[keep]! >= 60000) keep++;
    if (keep) b.splice(0, keep);
    const count = b.length;
    const p = Math.min(1, count / Math.max(1, CONFIG.fullMoonMessages));

    setState((prev) => {
      // ── quiet hint ──
      let hint = prev.hint;
      if (p >= QUIET_THRESHOLD) {
        hint = false;
        quietStart.current = null;
      } else {
        if (quietStart.current === null) quietStart.current = now;
        const isSuppressed = suppressed();
        if (hint) {
          if (isSuppressed) {
            hint = false;
            quietStart.current = now; // the 30s timer restarts from zero
          }
        } else if (
          now - t0 >= QUIET_GRACE_MS &&
          !isSuppressed &&
          now - quietStart.current >= QUIET_HOLD_MS
        ) {
          hint = true;
        }
      }

      return {
        p,
        count,
        phase: PHASES[Math.min(4, Math.floor(p * 4.999))]!,
        full: prev.full,
        hint,
      };
    });

    // a full moon flares once, then holds a 20s lockout so it can't strobe
    if (p >= 1 && now > fullUntil.current) {
      fullUntil.current = now + 20000;
      setState((s) => ({ ...s, full: true }));
      if (flareTimer.current) clearTimeout(flareTimer.current);
      flareTimer.current = setTimeout(() => setState((s) => ({ ...s, full: false })), 1700);
      onFull(count);
    }
  }, 900);

  return { ...state, ping, beats };
}
