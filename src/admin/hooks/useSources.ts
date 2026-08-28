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

function newest(sources: readonly Source[]): Source {
  return sources.reduce((a, b) => (b.at >= a.at ? b : a));
}

/** The away OBS source — chill no-ops those commands and the HUD has no Scene. */
function ownsAway(s: Source) {
  return s.role === "scene" && s.mode !== "chill";
}

function pickAwaySource(sources: readonly Source[]): Source | undefined {
  const scenes = sources.filter(ownsAway);
  if (!scenes.length) return undefined;
  const active = scenes.filter((s) => s.away.state !== "idle");
  return newest(active.length ? active : scenes);
}

function sameLive(a: HelloPayload | null, b: HelloPayload | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.away === b.away &&
    a.totals === b.totals &&
    a.tally === b.tally &&
    a.poll === b.poll &&
    a.settings === b.settings &&
    a.irc === b.irc &&
    a.eventsub === b.eventsub &&
    a.clientId === b.clientId &&
    a.token === b.token &&
    a.demo === b.demo &&
    a.build === b.build &&
    a.role === b.role &&
    a.mode === b.mode
  );
}

/**
 * One dock snapshot from every source that's still saying hello.
 *
 * Each OBS browser source heartbeats on its own. The HUD never mounts a Scene,
 * so it always reports `away.state: "idle"`; chill no-ops away commands and
 * stays `"chill"`. Taking the newest hello as live made the Away readout
 * flicker between those and the real BRB/AFK on the away scene — the overlay
 * itself never flickered, because each source keeps its own state.
 *
 * HUD is the authority on totals (scenes don't poll Helix). The non-chill
 * scene is the authority on away. Everything else prefers the HUD when it's
 * alive, otherwise the newest source.
 */
export function composeLive(sources: readonly Source[]): HelloPayload | null {
  if (!sources.length) return null;

  const hud = sources.find((s) => s.role === "hud");
  const awaySrc = pickAwaySource(sources);
  const base = hud ?? newest(sources);
  const { at: _at, ...payload } = base;

  return {
    ...payload,
    away: awaySrc?.away ?? payload.away,
    totals: hud?.totals ?? payload.totals,
  };
}

/**
 * Tracks which overlay sources are alive from their 2s `hello` heartbeat, and
 * keeps a snapshot of the newest live state each one reported.
 */
export function useSources(bus: Bus | null) {
  const map = useRef(new Map<string, Source>());
  const [sources, setSources] = useState<Source[]>([]);
  const [live, setLive] = useState<HelloPayload | null>(null);

  const refresh = useCallback(() => {
    const now = Date.now();
    for (const [k, v] of map.current) {
      if (now - v.at > STALE) map.current.delete(k);
    }
    const list = [...map.current.values()].sort((a, b) =>
      (a.role + a.mode).localeCompare(b.role + b.mode),
    );
    setSources((prev) => (sameList(prev, list) ? prev : list));
    setLive((prev) => {
      const next = composeLive(list);
      return sameLive(prev, next) ? prev : next;
    });
  }, []);

  useEffect(() => {
    if (!bus) return;
    return bus.on("hello", (payload, msg) => {
      map.current.set(msg.from, { ...payload, at: Date.now() });
      refresh();
    });
  }, [bus, refresh]);

  useInterval(refresh, 1000);

  /** Answer-me-now on open, rather than waiting out a heartbeat. */
  useEffect(() => {
    if (!bus) return;
    bus.send("ping");
  }, [bus]);
  useInterval(() => bus?.send("ping"), bus ? 4000 : null);

  return { sources, live, connected: sources.length > 0 };
}
