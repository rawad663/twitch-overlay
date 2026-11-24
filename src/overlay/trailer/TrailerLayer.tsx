"use client";

import { useCallback, useEffect, useState } from "react";
import { Montserrat } from "next/font/google";
import { SETTINGS_KEY, type Settings } from "@/bus/types";
import { useInterval } from "@/bus/useBus";
import { DEFAULT_SETTINGS } from "@/config/config";
import { easternDate, labActive } from "@/config/lab";
import { loadSettings } from "@/config/settings";
import { useStageScale } from "../hooks/useStageScale";
import { headlineSize, leftLabel, type TrailerLayerParams } from "./trailer";
import s from "./trailer.module.css";

/* The trailer video is set in Montserrat, and this card sits on its last
   frames, so it borrows that face instead of the overlay's own. Not preloaded:
   the HUD and the away scenes share this route and never draw it. */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

const KIND: Record<Settings["labKind"], string> = { "": "Lab night", play: "Play lab", dev: "Dev lab" };

/** One showing of the source: OBS showing it again starts a new one. */
type Run = { start: number; settings: Settings };

/** Outside OBS there is no saved lab, and an empty frame can't be previewed. */
function demoLab(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    labKind: "dev",
    labDate: easternDate(),
    labTitle: "Is 0.5 really six nerfs for every four buffs?",
    labSummary: "Chat calls buff or nerf, line by line, and we check the Patch Ledger by hand.",
  };
}

/**
 * `?mode=trailer` — a transparent source layered over the trailer's Media
 * Source. It keeps its own clock from the moment OBS shows it, because the
 * scene cut that shows it is the same one that restarts the video: no state has
 * to cross from the starting-soon source, and cutting to the scene by hand
 * works exactly the same.
 */
export function TrailerLayer({ params, demo }: { params: TrailerLayerParams; demo: boolean }) {
  const stageStyle = useStageScale();
  // A fresh load counts as a showing, the same rule the away scenes use. This
  // only ever mounts in the browser, so the initializers may read the clock
  // and storage.
  const [run, setRun] = useState<Run | null>(() => ({ start: Date.now(), settings: loadSettings(DEFAULT_SETTINGS) }));
  const [now, setNow] = useState(() => Date.now());

  const begin = useCallback(() => {
    const t = Date.now();
    setRun({ start: t, settings: loadSettings(DEFAULT_SETTINGS) });
    setNow(t);
  }, []);

  useEffect(() => {
    const onVisible = (e: Event) => {
      const detail = (e as CustomEvent<{ visible?: boolean }>).detail;
      if (detail && detail.visible === false) setRun(null);
      else begin();
    };
    // The dock can save tonight's lab while the trailer is already running.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SETTINGS_KEY) return;
      setRun((r) => (r ? { ...r, settings: loadSettings(DEFAULT_SETTINGS) } : r));
    };
    window.addEventListener("obsSourceVisibleChanged", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("obsSourceVisibleChanged", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [begin]);

  useInterval(() => setNow(Date.now()), run ? 200 : null);

  let body: React.ReactNode = null;
  if (run) {
    const elapsed = Math.max(0, now - run.start);
    const live = labActive(run.settings, new Date(now));
    const lab = live ? run.settings : demo ? demoLab() : null;
    const left = leftLabel(elapsed, params.leadMs);
    const over = elapsed >= params.leadMs;

    if (lab && elapsed >= params.cardMs) {
      const title = lab.labTitle.trim();
      const summary = lab.labSummary.trim();
      const headline = title || summary;
      body = (
        <div className={s.card} key={run.start}>
          <div className={s.brand}>
            Rawad<b>663</b>
          </div>
          <div className={s.kicker}>
            <b>Tonight</b> · {KIND[lab.labKind]}
          </div>
          <div className={s.headline} style={{ fontSize: headlineSize(headline) }}>
            {headline}
          </div>
          {title && summary && <div className={s.summary}>{summary}</div>}
          <div className={s.rule} />
          <div className={s.foot}>
            {over ? (
              <>
                Here <b>we go</b>
              </>
            ) : (
              <>
                Live in <b className={s.num}>{left}</b>
              </>
            )}
          </div>
        </div>
      );
    } else if (params.chip && !over) {
      body = (
        <div className={s.chip}>
          Live in <b className={s.num}>{left}</b>
        </div>
      );
    }
  }

  return (
    <div className={`${s.root} ${montserrat.variable}`}>
      <div className={s.stage} style={stageStyle}>
        {body}
      </div>
    </div>
  );
}
