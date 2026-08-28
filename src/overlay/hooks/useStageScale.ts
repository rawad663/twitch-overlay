"use client";

import { useEffect, useState } from "react";
import { stageTransform } from "@/design/stage";

/**
 * Scale the fixed 1920x1080 stage to whatever size the OBS browser source
 * actually is, and centre it horizontally.
 */
export function useStageScale() {
  const [style, setStyle] = useState<{ transform: string; left: string }>({
    transform: "scale(1)",
    left: "0px",
  });

  useEffect(() => {
    const fit = () => {
      const { scale, left } = stageTransform(window.innerWidth, window.innerHeight);
      setStyle({ transform: `scale(${scale})`, left: `${left}px` });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return style;
}
