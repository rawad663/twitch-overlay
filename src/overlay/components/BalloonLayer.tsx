"use client";

import { useEffect, useRef } from "react";
import type { BalloonField } from "../engine/balloons";
import s from "../overlay.module.css";

/** Mounts the balloon canvas. The field outlives this component. */
export function BalloonLayer({ field }: { field: BalloonField }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    field.mount(el);
    return () => field.unmount();
  }, [field]);

  return <canvas ref={ref} className={s.balloons} width={1920} height={1080} aria-hidden />;
}
