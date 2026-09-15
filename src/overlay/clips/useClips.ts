"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipEntry, ClipPlays, ClipSnapshot } from "@/bus/types";
import { CONFIG } from "@/config/config";
import { useLatest } from "@/bus/useBus";
import { loadLibrary, loadPlays, normalizeClips, persistLibrary, persistPlays, playCounts } from "./library";
import { clipAllowed, pickClip } from "./select";

export type PlayingClip = {
  slug: string;
  title: string;
  user: string;
  startedAt: number;
  until: number;
};

export type ClipOpts = {
  scene: boolean;
  visible: boolean;
  bannerActive: boolean;
  pollOpen: boolean;
  clipsEnabled: boolean;
  cooldown: (name: string, login: string, seconds: number) => boolean;
};

function hideMs(duration: number) {
  const padded = Math.max(1, duration) + CONFIG.clipPadSeconds;
  return Math.min(padded, CONFIG.clipMaxSeconds) * 1000;
}

/**
 * Scene-side clip rotation. The HUD mounts this too so it can hold the
 * library and answer `clip.resolve`, but `request` / `playNow` no-op there.
 */
export function useClips(opts: ClipOpts) {
  const [library, setLibrary] = useState<ClipEntry[]>(loadLibrary);
  const [plays, setPlays] = useState<ClipPlays>(loadPlays);
  const [playing, setPlaying] = useState<PlayingClip | null>(null);

  const lastSlug = useRef<string | null>(null);
  const lastGlobalAt = useRef(0);
  const hourlyAt = useRef<number[]>([]);
  const playingRef = useLatest(playing);

  const optsRef = useLatest(opts);
  const libraryRef = useLatest(library);
  const playsRef = useLatest(plays);

  const stop = useCallback(() => setPlaying(null), []);

  useEffect(() => {
    if (!playing) return;
    const ms = Math.max(0, playing.until - Date.now());
    const t = setTimeout(() => setPlaying(null), ms);
    return () => clearTimeout(t);
  }, [playing]);

  useEffect(() => {
    if (!opts.clipsEnabled) setPlaying(null);
  }, [opts.clipsEnabled]);

  useEffect(() => {
    if (!opts.visible) setPlaying(null);
  }, [opts.visible]);

  const playEntry = useCallback((entry: ClipEntry, user: string) => {
    const now = Date.now();
    lastSlug.current = entry.slug;
    lastGlobalAt.current = now;
    hourlyAt.current = hourlyAt.current.filter((t) => now - t < 3_600_000);
    hourlyAt.current.push(now);

    setPlays((prev) => {
      const next: ClipPlays = {
        ...prev,
        [entry.slug]: { count: (prev[entry.slug]?.count ?? 0) + 1, lastAt: now },
      };
      persistPlays(next);
      return next;
    });

    setPlaying({
      slug: entry.slug,
      title: entry.title,
      user,
      startedAt: now,
      until: now + hideMs(entry.duration),
    });
  }, []);

  const request = useCallback(
    (user: string, login: string, isMod: boolean) => {
      const o = optsRef.current;
      const enabled = libraryRef.current.filter((c) => c.enabled);
      if (
        !clipAllowed({
          scene: o.scene,
          visible: o.visible,
          playing: !!playingRef.current,
          bannerActive: o.bannerActive,
          pollOpen: o.pollOpen,
          clipsEnabled: o.clipsEnabled,
          librarySize: enabled.length,
          now: Date.now(),
          lastGlobalAt: lastGlobalAt.current,
          hourlyAt: hourlyAt.current,
          clipCooldown: CONFIG.clipCooldown,
          clipHourlyCap: CONFIG.clipHourlyCap,
        })
      ) {
        return;
      }
      if (!isMod && !o.cooldown("clip", login, CONFIG.clipUserCooldown)) return;
      const entry = pickClip(libraryRef.current, playsRef.current, lastSlug.current);
      if (!entry) return;
      playEntry(entry, user);
    },
    [optsRef, libraryRef, playsRef, playingRef, playEntry],
  );

  const playNow = useCallback(
    (slug: string | undefined, user: string) => {
      if (!optsRef.current.scene) return;
      const list = libraryRef.current;
      const entry = slug ? (list.find((c) => c.slug === slug) ?? null) : pickClip(list, playsRef.current, lastSlug.current);
      if (!entry) return;
      playEntry(entry, user);
    },
    [optsRef, libraryRef, playsRef, playEntry],
  );

  const replace = useCallback((clips: ClipEntry[]) => {
    const next = normalizeClips(clips);
    persistLibrary(next);
    setLibrary(next);
  }, []);

  const snapshot: ClipSnapshot = playing ? { slug: playing.slug, until: playing.until } : null;
  const clipsOn = opts.clipsEnabled && library.some((c) => c.enabled);
  const clipPlays = useMemo(() => playCounts(plays), [plays]);

  return {
    library,
    replace,
    playing,
    request,
    playNow,
    stop,
    clipPlays,
    snapshot,
    clipsOn,
  };
}
