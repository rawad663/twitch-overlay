"use client";

import type { SupportCard as Card } from "@/bus/types";
import { bodyRuns } from "../cards/library";
import s from "../overlay.module.css";

/**
 * One support card's face. The HUD positions it on the stage; the dock
 * renders the same face as its preview, so what you edit is what goes out.
 *
 * Art is optional everywhere: an image that hasn't resolved (no token for
 * badges, an upload missing on this PC) falls back to the violet orb, and an
 * art-layout card without art simply lets its text run full width.
 */
export function SupportCardFace({
  card,
  urls,
  seconds,
}: {
  card: Card;
  urls: Record<string, string>;
  /** Drives the progress line; 0 hides it (dock preview, paused). */
  seconds: number;
}) {
  const first = card.images[0];
  const firstUrl = first ? urls[first.src] : undefined;
  const art = card.layout === "art" && firstUrl;

  return (
    <div className={`${s.supCard} ${s[`sup_${card.layout}`]} ${art ? "" : s.supNoArt}`}>
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.supArt} src={firstUrl} alt="" style={{ objectPosition: `center ${card.focus}%` }} />
      )}

      {card.layout === "tile" && (
        <div className={s.supFrame}>
          {firstUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstUrl} alt="" />
          ) : (
            <i className={s.supOrb} />
          )}
        </div>
      )}

      <div className={s.supText}>
        {card.kicker && (
          <div className={s.supKicker}>
            <i className={s.labDot} />
            {card.kicker}
          </div>
        )}

        {card.layout === "row" ? (
          <div className={s.supRow}>
            {card.images.map((im, i) => (
              <div className={s.supItem} key={`${im.src}:${i}`}>
                {urls[im.src] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[im.src]} alt="" />
                ) : (
                  <i className={s.supOrb} />
                )}
                {im.label && <span>{im.label}</span>}
              </div>
            ))}
          </div>
        ) : (
          card.title && <div className={s.supTitle}>{card.title}</div>
        )}

        {card.body && (
          <div className={`${s.supBody} ${card.layout === "row" ? s.supCenter : ""}`}>
            {bodyRuns(card.body).map((r, i) => (r.bold ? <b key={i}>{r.text}</b> : <span key={i}>{r.text}</span>))}
          </div>
        )}
        {card.url && card.layout !== "row" && <div className={s.supUrl}>{card.url}</div>}
      </div>

      {seconds > 0 && (
        <div className={s.supBar}>
          <span style={{ animationDuration: `${seconds}s` }} />
        </div>
      )}
    </div>
  );
}

/** The HUD's support card: positioned on the stage, hidden under banners and polls. */
export function SupportCard({
  card,
  urls,
  seconds,
  x,
  y,
  show,
  showKey,
}: {
  card: Card | null;
  urls: Record<string, string>;
  seconds: number;
  x: number;
  y: number;
  show: boolean;
  /** Changes on every rotation so the entry animation replays, even for the same card. */
  showKey: string;
}) {
  return (
    <div className={`${s.support} ${show && card ? s.on : ""}`} style={{ left: x, top: y }} aria-hidden={!show || !card}>
      {card && (
        <div className={s.supIn} key={showKey}>
          <SupportCardFace card={card} urls={urls} seconds={seconds} />
        </div>
      )}
    </div>
  );
}
