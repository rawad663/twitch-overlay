"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneStatus } from "../engine/types";
import { commandsFor, promptsFor } from "../engine/prompts";
import s from "../overlay.module.css";

/** The rotating prompt, crossfaded so nothing ever pops. */
function Prompt({
  mode,
  chill,
  hushed,
  clipsOn,
}: {
  mode: string;
  chill: boolean;
  hushed: boolean;
  clipsOn: boolean;
}) {
  const prompts = promptsFor(mode, chill, clipsOn);
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setOut(true);
      setTimeout(() => {
        setI((n) => (n + 1) % prompts.length);
        setOut(false);
      }, 500);
    }, 9000);
    return () => clearInterval(id);
  }, [prompts.length]);

  return (
    <div className={`${s.scPrompt} ${chill ? s.chillPrompt : ""} ${hushed ? s.hushed : ""}`}>
      <div className={s.scPromptLabel}>While you wait</div>
      <div
        className={`${s.scPromptText} ${out ? s.out : ""}`}
        dangerouslySetInnerHTML={{ __html: prompts[i % prompts.length] ?? "" }}
      />
    </div>
  );
}

/**
 * The scene's DOM layer — everything that is not the canvas. The engine drives
 * it through a throttled status snapshot, so this re-renders a few times a
 * second rather than sixty.
 */
export function SceneLayer({
  status,
  mode,
  chill,
  guideOn,
  clipsOn,
  clipPlaying,
  onCanvas,
}: {
  status: SceneStatus;
  mode: string;
  chill: boolean;
  guideOn: boolean;
  clipsOn: boolean;
  clipPlaying: boolean;
  onCanvas: (el: HTMLCanvasElement | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    onCanvas(ref.current);
    return () => onCanvas(null);
  }, [onCanvas]);

  return (
    <div className={s.scene}>
      <canvas ref={ref} className={s.sky} width={1920} height={1080} />
      <div className={s.layer}>
        {!chill && (
          <>
            <div className={s.scStatus}>
              <div className={s.scKicker}>{status.kicker}</div>
              <div className={s.scTitle}>{status.title}</div>
              <div className={`${s.scTimer} ${s.num} ${status.over ? s.over : ""}`}>
                {status.timer}
              </div>
              <div className={s.scSub}>{status.sub}</div>
            </div>

            <div className={s.scGoals}>
              {status.goals.map((g) => (
                <div key={g.label} className={`${s.goal} ${g.done ? s.done : ""}`}>
                  <div className={s.goalRow}>
                    <span>{g.label}</span>
                    <b className={s.num}>
                      {g.value} / {g.target}
                    </b>
                  </div>
                  <div className={s.bar}>
                    <i style={{ width: `${Math.min(100, (g.value / Math.max(1, g.target)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <Prompt mode={mode} chill={chill} hushed={(chill && guideOn) || clipPlaying} clipsOn={clipsOn} />

        {chill && (
          <div className={`${s.scGuide} ${guideOn ? s.on : ""}`}>
            <div className={s.scGuideLabel}>Chat commands</div>
            <div className={s.scGuideList}>
              {commandsFor(clipsOn).map((c) => (
                <div key={c.c} className={s.cmd}>
                  <span className={s.c}>{c.c}</span>
                  <span className={s.d}>{c.d}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
