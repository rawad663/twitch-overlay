"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bus } from "@/bus/bus";
import type { BusPayloads, BusType, ClipEntry, ClipSnapshot } from "@/bus/types";
import { loadLibrary, parseClipSlug, persistLibrary } from "@/overlay/clips/library";
import s from "../admin.module.css";
import { Button, Hint, Section } from "./ui";

function fmtDuration(n: number) {
  const sec = Math.max(1, Math.round(n));
  return `${sec}s`;
}

export function Clips({
  enabled,
  onEnabled,
  plays,
  clip,
  bus,
  send,
  disabled,
}: {
  enabled: boolean;
  onEnabled: (on: boolean) => void;
  plays: Record<string, number> | undefined;
  clip: ClipSnapshot | undefined;
  bus: Bus | null;
  send: <T extends BusType>(type: T, payload: BusPayloads[T], label: string) => void;
  disabled: boolean;
}) {
  const [library, setLibrary] = useState<ClipEntry[]>(loadLibrary);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");

  const push = useCallback(
    (next: ClipEntry[]) => {
      setLibrary(next);
      persistLibrary(next);
      bus?.send("clips", { clips: next });
    },
    [bus],
  );

  useEffect(() => {
    if (!bus) return;
    const loaded = loadLibrary();
    if (loaded.length) bus.send("clips", { clips: loaded });
  }, [bus]);

  useEffect(() => {
    if (!bus) return;
    return bus.on("clip.meta", (p) => {
      setLibrary((cur) => {
        const next = cur.map((c) =>
          c.slug === p.slug
            ? {
                ...c,
                title: p.title || c.title,
                creator: p.creator,
                duration: p.duration || c.duration,
                thumb: p.thumb || c.thumb,
                unresolved: undefined,
              }
            : c,
        );
        persistLibrary(next);
        bus.send("clips", { clips: next });
        return next;
      });
    });
  }, [bus]);

  const add = () => {
    const slug = parseClipSlug(draft);
    if (!slug) {
      setHint("Could not read that clip link.");
      return;
    }
    if (library.some((c) => c.slug === slug)) {
      setHint("Already in the rotation.");
      return;
    }
    const entry: ClipEntry = {
      slug,
      title: slug,
      creator: "",
      duration: 30,
      thumb: "",
      enabled: true,
      addedAt: Date.now(),
      unresolved: true,
    };
    push([...library, entry]);
    bus?.send("clip.resolve", { slug });
    setDraft("");
    setHint("Resolving title and length…");
  };

  const toggle = (slug: string, on: boolean) => {
    push(library.map((c) => (c.slug === slug ? { ...c, enabled: on } : c)));
  };

  const remove = (slug: string) => {
    push(library.filter((c) => c.slug !== slug));
  };

  const enabledCount = library.filter((c) => c.enabled).length;
  const playing = !!clip;

  return (
    <Section title="Clips" disabled={disabled}>
      <div className={s.row2}>
        <Button variant={enabled ? "ghost" : "warn"} onClick={() => onEnabled(!enabled)}>
          {enabled ? "Rotation on" : "Rotation off"}
        </Button>
        <Button variant="ghost" onClick={() => send("clip.play", {}, "Play clip")} disabled={!enabledCount}>
          Play now
        </Button>
        <Button variant="ghost" onClick={() => send("clip.stop", {}, "Stop clip")} disabled={!playing}>
          Stop
        </Button>
      </div>

      <div className={s.row2} style={{ marginTop: 10 }}>
        <input
          className={s.input}
          value={draft}
          placeholder="Paste a Twitch clip link…"
          aria-label="Twitch clip URL"
          onChange={(e) => {
            setDraft(e.target.value);
            setHint("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {hint ? <div style={{ marginTop: 8 }}><Hint>{hint}</Hint></div> : null}

      <div style={{ marginTop: 8 }}>
        <Hint>
          {playing
            ? `Playing now — ${clip.slug}`
            : enabled && enabledCount
              ? `${enabledCount} in rotation · chat types !clip`
              : enabled
                ? "Add a clip so !clip has something to play."
                : "Rotation is off. !clip is ignored."}
        </Hint>
      </div>

      <div style={{ marginTop: 8 }}>
        {library.length === 0 ? (
          <div className={s.empty}>No clips yet.</div>
        ) : (
          library.map((c) => (
            <div className={s.clipRow} key={c.slug}>
              {c.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={s.clipThumb} src={c.thumb} alt="" />
              ) : (
                <div className={s.clipThumb} />
              )}
              <div className={s.clipInfo}>
                <div className={s.clipTitle}>{c.title}</div>
                <div className={s.clipMeta}>
                  {c.unresolved ? "resolving…" : fmtDuration(c.duration)}
                  {c.creator ? ` · ${c.creator}` : ""}
                  {` · ${plays?.[c.slug] ?? 0} plays`}
                </div>
                <div className={s.clipTools}>
                  <label className={s.clipToggle}>
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) => toggle(c.slug, e.target.checked)}
                    />
                    In rotation
                  </label>
                  <Button variant="ghost" onClick={() => send("clip.play", { slug: c.slug }, "Play clip")}>
                    Play
                  </Button>
                  <Button variant="remove" onClick={() => remove(c.slug)} aria-label={`Remove ${c.title}`}>
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Section>
  );
}
