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
  const expired = sources.some((v) => !v.demo && v.eventsub === "expired");
  const failed = sources.some((v) => !v.demo && v.eventsub === "error");
  const notices = [...new Set(sources.filter((v) => !v.demo)
    .flatMap((v) => [v.followNotice, v.twitchNotice]).filter(Boolean))];
  return (
    <Section title="Sources">
      {(expired || failed) && (
        <div className={s.sourceWarning} role="status">
          <strong>⚠ {expired ? "Twitch authorization expired" : "Twitch follow alerts unavailable"}</strong>
          <p>
            Live follow alerts are not working on the affected sources, even if chat is connected.
            {expired && " Go to Milestones below to authorize Twitch again, then paste and save the new token once for all sources."}
          </p>
          {notices.map((notice) => <p key={notice}>{notice}</p>)}
        </div>
      )}
      <div>
        {sources.length === 0 ? (
          <div className={s.empty}>None responding.</div>
        ) : (
          sources.map((v, i) => {
            const unhealthy = !v.demo && (v.eventsub === "expired" || v.eventsub === "error");
            return (
              <div className={s.src} key={`${v.role}-${v.mode}-${i}`}>
                <span className={unhealthy ? `${s.dot} ${s.dotBad}` : dotClass(v.irc)} />
                <span className={s.who}>{v.role === "scene" ? `Scene · ${v.mode}` : "HUD"}</span>
                <span className={`${s.meta} ${s.sourceMeta}`}>
                  <span>IRC {v.irc}</span>
                  <span className={unhealthy ? s.sourceError : undefined}>
                    {unhealthy && "⚠ "}EventSub {v.eventsub}{v.eventsub === "live" && " · shared"}
                  </span>
                  {v.demo && <span>demo</span>}
                </span>
              </div>
            );
          })
        )}
      </div>
      {!expired && !failed && (notices.length > 0 || sources.some((v) => !v.demo && v.eventsub !== "live")) && (
        <div className={s.verdict} style={{ marginTop: 10 }}>
          {notices.map((notice) => <p key={notice}>{notice}</p>)}
          One loaded, authorized source connects to Twitch and shares follows with all other sources.
          Test alerts bypass Twitch. Use Milestones to authorize if no source has a valid token.
        </div>
      )}
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
