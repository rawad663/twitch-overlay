"use client";

import { useEffect, useState } from "react";
import { CLIP_PIP } from "@/design/stage";
import type { PlayingClip } from "../clips/useClips";
import s from "../overlay.module.css";

const FADE_MS = 400;

function embedSrc(slug: string) {
  const parent = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const params = new URLSearchParams({
    clip: slug,
    parent,
    autoplay: "true",
    muted: "false",
  });
  return `https://clips.twitch.tv/embed?${params}`;
}

/**
 * 16:9 card centred on the moon. Title is React text — clip titles are
 * viewer-written and never go near dangerouslySetInnerHTML.
 */
export function ClipPlayer({ clip, chill }: { clip: PlayingClip | null; chill: boolean }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!clip) return;
    const fadeAt = Math.max(0, clip.until - Date.now() - FADE_MS);
    const fade = setTimeout(() => setLeaving(true), fadeAt);
    return () => clearTimeout(fade);
  }, [clip]);

  if (!clip) return null;

  const rect = chill ? CLIP_PIP.chill : CLIP_PIP.away;
  const duration = Math.max(1, (clip.until - clip.startedAt) / 1000);

  return (
    <div
      className={`${s.clip} ${leaving ? s.clipLeaving : ""}`}
      style={{ left: rect[0], top: rect[1], width: rect[2], height: rect[3] }}
    >
      <div className={s.clipChip}>
        <div className={s.clipTitle}>{clip.title}</div>
        <div className={s.clipBy}>requested by {clip.user}</div>
      </div>
      <div className={s.clipFrame}>
        <iframe
          src={embedSrc(clip.slug)}
          title={clip.title}
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
        <div className={s.clipBar}>
          <i style={{ animationDuration: `${duration}s` }} />
        </div>
      </div>
    </div>
  );
}
