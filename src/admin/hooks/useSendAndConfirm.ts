"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bus } from "@/bus/bus";
import type { BusPayloads, BusType } from "@/bus/types";

/** How long a command has to be acked before we call it undelivered. */
const ACK_WINDOW = 1000;
const TOAST_MS = 3200;

export type Toast = { text: string; ok: boolean } | null;

/**
 * Sends a command and reports back how many sources actually acted on it.
 * "Nothing happened" should never be a silent question — every button either
 * confirms a source count or says plainly that no one answered.
 */
export function useSendAndConfirm(bus: Bus | null) {
  const ledger = useRef(new Map<string, Set<string>>());
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!bus) return;
    return bus.on("ack", (p, msg) => {
      ledger.current.get(p.forId)?.add(p.role ?? msg.from);
    });
  }, [bus]);

  const show = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const send = useCallback(
    <T extends BusType>(type: T, payload: BusPayloads[T], label: string) => {
      if (!bus) return;
      const id = bus.send(type, payload);
      ledger.current.set(id, new Set());
      const t = setTimeout(() => {
        const n = ledger.current.get(id)?.size ?? 0;
        ledger.current.delete(id);
        timers.current.delete(t);
        if (n > 0) show(`✓ ${label} — reached ${n} source${n > 1 ? "s" : ""}`, true);
        else show(`✕ ${label} — no source responded. Is it visible in OBS?`, false);
      }, ACK_WINDOW);
      timers.current.add(t);
    },
    [bus, show],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return { send, toast };
}
