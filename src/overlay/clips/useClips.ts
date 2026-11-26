"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipEntry, ClipPlays, ClipSnapshot, CommandOutcome } from "@/bus/types";
import { readJSON, writeJSON } from "@/bus/storage";
import { CONFIG } from "@/config/config";
import { useLatest } from "@/bus/useBus";
import { loadLibrary, loadPlays, normalizeClips, persistLibrary, persistPlays, playCounts } from "./library";
import { claimOnce, formatLeft } from "../claim";
import { clipBlock, pickClip } from "./select";

export type Shoutout = { login: string; name: string; game: string };

export type PlayingClip = {
  slug: string;
  title: string;
  user: string;
  startedAt: number;
  until: number;
  /** set for !so: the card says who to go check out instead of who asked */
  shoutout?: Shoutout;
};

export type ClipOpts = {
  canShow: boolean;
  visible: boolean;
  bannerActive: boolean;
  pollOpen: boolean;
  clipsEnabled: boolean;
  /**
   * Claim straight away. A source that might be on air but can't prove it
   * (a scene source OBS never confirmed visible) waits first, so the one that
   * is actually on screen wins the claim.
   */
  preferred: boolean;
  /** Over gameplay the HUD plays clips for mods and the broadcaster only — a clip's audio talks over the stream. */
  modsOnly: boolean;
  /** 0 = allowed (and started), else ms left */
  cooldown: (name: string, login: string, seconds: number) => number;
};

/** How long a non-preferred source waits before trying to claim. */
const DEFER_MS = 400;

/** Channel-wide limits, shared so a clip on the HUD also holds the away scene. */
const LIMITS_KEY = "rawad-clip-limits";
type Limits = { lastAt: number; hour: number[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hideMs(duration: number) {
  const padded = Math.max(1, duration) + CONFIG.clipPadSeconds;
  return Math.min(padded, CONFIG.clipMaxSeconds) * 1000;
}

/**
 * Clip rotation, mounted by every source. `canShow` picks the one that plays:
 * the HUD over gameplay, the away / chill scene while it is up. The HUD also
 * answers `clip.resolve`, since it is the source with the token.
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

  /* The library's duration is a 30s guess until Helix resolves it; the video
     element knows the real one, so the cap timer follows it. */
  const retime = useCallback((seconds: number) => {
    setPlaying((cur) => (cur ? { ...cur, until: cur.startedAt + hideMs(seconds) } : cur));
  }, []);

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
    if (!opts.visible || !opts.canShow) setPlaying(null);
  }, [opts.visible, opts.canShow]);

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

  /** Shared limits, falling back to this source's own when storage is blocked. */
  const limits = useCallback((): Limits => {
    const shared = readJSON<Limits>(LIMITS_KEY);
    return {
      lastAt: Math.max(shared?.lastAt ?? 0, lastGlobalAt.current),
      hour: [...(shared?.hour ?? []), ...hourlyAt.current],
    };
  }, []);

  /**
   * Every source hears the same !clip (and the same dock button), so the play
   * is claimed on the message id and only the winner plays. This is what stops
   * the HUD and the away scene from both playing one request.
   */
  const claim = useCallback(
    async (id: string, enforceLimits: boolean): Promise<"won" | "lost" | "cooldown"> => {
      if (!optsRef.current.preferred) await sleep(DEFER_MS);
      let why: "lost" | "cooldown" = "lost";
      const won = await claimOnce(`clip:${id || Math.random().toString(36)}`, () => {
        const now = Date.now();
        const lim = limits();
        if (enforceLimits && now - lim.lastAt < CONFIG.clipCooldown * 1000) {
          why = "cooldown";
          return false;
        }
        const hour = [...new Set(lim.hour)].filter((t) => now - t < 3_600_000);
        writeJSON(LIMITS_KEY, { lastAt: now, hour: [...hour, now] });
        return true;
      });
      return won ? "won" : why;
    },
    [optsRef, limits],
  );

  const request = useCallback(
    async (user: string, login: string, isMod: boolean, msgId: string): Promise<CommandOutcome> => {
      const o = optsRef.current;
      const enabled = libraryRef.current.filter((c) => c.enabled);
      const lim = limits();
      const blocked = clipBlock({
        canShow: o.canShow,
        visible: o.visible,
        playing: !!playingRef.current,
        bannerActive: o.bannerActive,
        pollOpen: o.pollOpen,
        clipsEnabled: o.clipsEnabled,
        librarySize: enabled.length,
        now: Date.now(),
        lastGlobalAt: lim.lastAt,
        hourlyAt: [...new Set(lim.hour)],
        clipCooldown: CONFIG.clipCooldown,
        clipHourlyCap: CONFIG.clipHourlyCap,
      });
      /* The source that owns clips right now has the final word: when it
         refuses, it claims the request so a deferred source that can't prove
         it's hidden doesn't play it behind the HUD's back. */
      const refuse = (out: CommandOutcome) => {
        if (o.canShow && o.visible && o.preferred && msgId) void claimOnce(`clip:${msgId}`);
        return out;
      };
      if (blocked) return o.canShow && o.visible ? refuse(blocked) : blocked;
      if (o.modsOnly && !isMod) {
        return refuse({ cmd: "clip", ok: false, text: "over gameplay, !clip is for mods and Rawad — anyone can on the away / lounge scene" });
      }
      if (!isMod) {
        const left = o.cooldown("clip", login, CONFIG.clipUserCooldown);
        if (left) return refuse({ cmd: "clip", ok: false, text: `cooling down for ${user} — ${formatLeft(left)} left`, leftMs: left });
      }
      const entry = pickClip(libraryRef.current, playsRef.current, lastSlug.current);
      if (!entry) return refuse({ cmd: "clip", ok: false, text: "no playable clip in the library" });
      const got = await claim(msgId, true);
      if (got === "lost") return { cmd: "clip", ok: true, text: "another source handled it" };
      if (got === "cooldown") return { cmd: "clip", ok: false, text: "another request just played a clip" };
      // the claim may have waited: don't start a card on a source that went away meanwhile
      if (!optsRef.current.canShow || !optsRef.current.visible) {
        return { cmd: "clip", ok: false, text: "source went off air while claiming" };
      }
      playEntry(entry, user);
      return { cmd: "clip", ok: true, text: `playing “${entry.title}”` };
    },
    [optsRef, libraryRef, playsRef, playingRef, playEntry, limits, claim],
  );

  const playNow = useCallback(
    async (slug: string | undefined, user: string, msgId: string) => {
      if (!optsRef.current.canShow || !optsRef.current.visible) return;
      const list = libraryRef.current;
      const entry = slug ? (list.find((c) => c.slug === slug) ?? null) : pickClip(list, playsRef.current, lastSlug.current);
      if (!entry) return;
      if ((await claim(msgId, false)) !== "won") return;
      playEntry(entry, user);
    },
    [optsRef, libraryRef, playsRef, playEntry, claim],
  );

  /** !so: the broadcaster's call, so it cuts in over whatever is up and skips the !clip limits and play counts. */
  const playShoutout = useCallback((clip: { slug: string; title: string; duration: number }, so: Shoutout) => {
    const now = Date.now();
    setPlaying({
      slug: clip.slug,
      title: clip.title,
      user: so.name,
      startedAt: now,
      until: now + hideMs(clip.duration),
      shoutout: so,
    });
  }, []);

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
    playShoutout,
    stop,
    retime,
    clipPlays,
    snapshot,
    clipsOn,
  };
}
