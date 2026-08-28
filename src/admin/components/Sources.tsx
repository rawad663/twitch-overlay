"use client";

import s from "../admin.module.css";
import type { Source } from "../hooks/useSources";
import { Hint, Section } from "./ui";

export function ConnBanner({ count }: { count: number }) {
  const ok = count > 0;
  return (
    <div className={`${s.conn} ${ok ? s.connOk : s.connBad}`}>
      <b>{ok ? "Connected" : "Not connected"}</b>
      <span>
        {ok
          ? `${count} overlay source${count > 1 ? "s are" : " is"} responding.`
          : "Looking for overlay sources…"}
      </span>
    </div>
  );
}

function dotClass(irc: string) {
  if (irc === "live") return s.dot;
  if (irc === "off") return `${s.dot} ${s.dotOff}`;
  return `${s.dot} ${s.dotWarn}`;
}

export function Sources({ sources }: { sources: Source[] }) {
  return (
    <Section title="Sources">
      <div>
        {sources.length === 0 ? (
          <div className={s.empty}>None responding.</div>
        ) : (
          sources.map((v, i) => {
            const meta = [`IRC ${v.irc}`, v.token ? `EventSub ${v.eventsub}` : "no token"];
            if (v.demo) meta.push("demo");
            return (
              <div className={s.src} key={`${v.role}-${v.mode}-${i}`}>
                <span className={dotClass(v.irc)} />
                <span className={s.who}>{v.role === "scene" ? `Scene · ${v.mode}` : "HUD"}</span>
                <span className={s.meta}>{meta.join("  ·  ")}</span>
              </div>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Hint>
          This panel only reaches the overlay when opened as an OBS{" "}
          <strong>Custom Browser Dock</strong> — a normal browser tab is a different browser and
          shares no storage with OBS. For phone or remote control, use the <code>!brb</code> /{" "}
          <code>!afk</code> / <code>!soon</code> chat commands.
        </Hint>
      </div>
    </Section>
  );
}
