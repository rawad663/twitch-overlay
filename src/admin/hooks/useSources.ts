"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bus } from "@/bus/bus";
import { useInterval } from "@/bus/useBus";
import type { HelloPayload } from "@/bus/types";

/** A source that stops saying hello for this long is treated as gone. */
const STALE = 6000;

export type Source = HelloPayload & { at: number };

function sameList(a: Source[], b: Source[]) {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Tracks which overlay sources are alive from their 2s `hello` heartbeat, and
 * keeps a snapshot of the newest live state each one reported.
 */
export function useSources(bus: Bus | null) {
  const map = useRef(new Map<string, Source>());
  const [sources, setSources] = useState<Source[]>([]);
  const [live, setLive] = useState<HelloPayload | null>(null);

  const prune = useCallback(() => {
    const now = Date.now();
    for (const [k, v] of map.current) {
      if (now - v.at > STALE) map.current.delete(k);
    }
    const list = [...map.current.values()].sort((a, b) =>
      (a.role + a.mode).localeCompare(b.role + b.mode),
    );
    setSources((prev) => (sameList(prev, list) ? prev : list));
    if (!list.length) setLive(null);
  }, []);

  useEffect(() => {
    if (!bus) return;
    return bus.on("hello", (payload, msg) => {
      map.current.set(msg.from, { ...payload, at: Date.now() });
      // The HUD is the authority on totals; a scene source reports none, so
      // taking the newest hello outright would blank the milestone readout
      // every time the scene source spoke.
      setLive((prev) =>
        payload.totals === undefined && prev?.totals ? { ...payload, totals: prev.totals } : payload,
      );
      prune();
    });
  }, [bus, prune]);

  useInterval(prune, 1000);

  /** Answer-me-now on open, rather than waiting out a heartbeat. */
  useEffect(() => {
    if (!bus) return;
    bus.send("ping");
  }, [bus]);
  useInterval(() => bus?.send("ping"), bus ? 4000 : null);

  return { sources, live, connected: sources.length > 0 };
}
