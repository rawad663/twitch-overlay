"use client";

import { useSyncExternalStore } from "react";
import { CONFIG } from "@/config/config";

export type OverlayMode = "hud" | "afk" | "brb" | "soon" | "scene" | "chill";

export type OverlayParams = {
  mode: OverlayMode;
  /** afk/brb/soon/scene/chill — chill included, and that inheritance is load-bearing */
  scene: boolean;
  chill: boolean;
  guide: boolean;
  demo: boolean;
  inOBS: boolean;
  token: string;
  clientId: string;
  muted: boolean;
  /** null when ?volume= was absent, so saved settings still win */
  volume: number | null;
  minutes: number | null;
};

const SCENE_MODES = new Set(["afk", "brb", "soon", "scene", "chill"]);

export function parseParams(search: string, inOBS: boolean): OverlayParams {
  const qs = new URLSearchParams(search);
  const raw = (qs.get("mode") ?? "").toLowerCase();
  const mode = (SCENE_MODES.has(raw) ? raw : "hud") as OverlayMode;

  const volRaw = qs.get("volume");
  let volume: number | null = null;
  if (volRaw !== null) {
    const v = parseFloat(volRaw);
    if (!Number.isNaN(v)) volume = Math.max(0, Math.min(1, v));
  }

  const minRaw = qs.get("min");
  const min = minRaw === null ? null : parseInt(minRaw, 10);

  return {
    mode,
    scene: SCENE_MODES.has(mode),
    chill: mode === "chill",
    guide: qs.get("guide") === "1",
    // Outside OBS, show a backdrop and fake traffic so it can be previewed.
    demo: qs.get("demo") === "1" || (!inOBS && qs.get("live") !== "1"),
    inOBS,
    // Secrets never live in the repo — the token rides in the OBS source URL.
    token: qs.get("token") ?? "",
    clientId: qs.get("client_id") ?? CONFIG.clientId,
    muted: qs.get("mute") === "1",
    volume,
    minutes: min !== null && !Number.isNaN(min) ? Math.max(1, Math.min(180, min)) : null,
  };
}

/* The URL never changes under us — an OBS source reloads rather than
   navigating — so the store never notifies and the snapshot is memoised. */
const noop = () => () => {};
let cached: OverlayParams | null = null;

function snapshot(): OverlayParams {
  cached ??= parseParams(window.location.search, !!window.obsstudio);
  return cached;
}

/**
 * Reads the URL rather than going through `useSearchParams`. Every param is
 * client-only anyway, and this keeps the statically exported HTML free of a
 * prerender bailout — the page ships as one file that reads its own URL.
 *
 * `useSyncExternalStore` is what makes that safe: the server snapshot is null,
 * so there is no hydration mismatch and no cascading render on mount. Null also
 * doubles as the "don't start anything yet" signal for the sockets and timers
 * downstream.
 */
export function useOverlayParams(): OverlayParams | null {
  return useSyncExternalStore(noop, snapshot, () => null);
}
