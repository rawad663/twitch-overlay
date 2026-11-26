"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "@/bus/useBus";
import { CLIP_PIP } from "@/design/stage";
import type { PlayingClip } from "../clips/useClips";
import { fetchClipVideo } from "../twitch/clipVideo";
import s from "../overlay.module.css";

const FADE_MS = 400;

/**
 * 16:9 card: over the moon on scene sources, under the lab card on the HUD.
 * A bare <video> with no controls rather than Twitch's embed — see
 * `twitch/clipVideo.ts` for why. Title is React text: clip titles are
 * viewer-written and never go near dangerouslySetInnerHTML.
 *
 * `onEnd` fires when the clip finishes or can't be fetched; the hook's own
 * `until` timer stays as the hard cap.
 */
export function ClipPlayer({
  clip,
  where,
  onEnd,
  onDuration,
}: {
  clip: PlayingClip | null;
  where: keyof typeof CLIP_PIP;
  onEnd: () => void;
  onDuration: (seconds: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [barSeconds, setBarSeconds] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const onEndRef = useLatest(onEnd);
  const finish = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onEndRef.current(), FADE_MS);
  }, [onEndRef]);

  useEffect(() => {
    if (!clip) return;
    const ac = new AbortController();
    void fetchClipVideo(clip.slug, ac.signal).then((url) => {
      if (ac.signal.aborted) return;
      if (url) setSrc(url);
      else finish();
    });
    return () => ac.abort();
  }, [clip, finish]);

  useEffect(() => {
    if (!clip) return;
    const fadeAt = Math.max(0, clip.until - Date.now() - FADE_MS);
    const fade = setTimeout(() => setLeaving(true), fadeAt);
    return () => clearTimeout(fade);
  }, [clip]);

  if (!clip) return null;

  const rect = CLIP_PIP[where];
  const fallbackSeconds = Math.max(1, (clip.until - clip.startedAt) / 1000);

  const start = () => {
    const v = video.current;
    if (!v) return;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setBarSeconds(v.duration);
      onDuration(v.duration);
    }
    // OBS's CEF allows unmuted autoplay; a normal browser tab may not. Muted
    // beats a frozen first frame there.
    v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => finish());
    });
  };

  return (
    <div
      className={`${s.clip} ${leaving ? s.clipLeaving : ""}`}
      style={{ left: rect[0], top: rect[1], width: rect[2], height: rect[3] }}
    >
      <div className={s.clipChip}>
        {clip.shoutout ? (
          <>
            <div className={s.clipTitle}>Go check out {clip.shoutout.name}</div>
            <div className={s.clipBy}>
              twitch.tv/{clip.shoutout.login}
              {clip.shoutout.game ? ` · ${clip.shoutout.game}` : ""}
            </div>
          </>
        ) : (
          <>
            <div className={s.clipTitle}>{clip.title}</div>
            <div className={s.clipBy}>requested by {clip.user}</div>
          </>
        )}
      </div>
      <div className={s.clipFrame}>
        {src && (
          <video
            ref={video}
            src={src}
            playsInline
            preload="auto"
            disablePictureInPicture
            onLoadedMetadata={start}
            onPlaying={() => setRunning(true)}
            onEnded={() => finish()}
            onError={() => finish()}
          />
        )}
        <div className={s.clipBar}>
          <i
            style={{
              animationDuration: `${barSeconds ?? fallbackSeconds}s`,
              animationPlayState: running ? "running" : "paused",
            }}
          />
        </div>
      </div>
    </div>
  );
}
