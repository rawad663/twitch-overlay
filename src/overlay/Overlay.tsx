"use client";

import { useOverlayParams } from "./hooks/useMode";
import { OverlayApp } from "./OverlayApp";

/**
 * The overlay reads its own URL after mount, so the statically exported HTML
 * is one file that behaves differently per `?mode=`. Nothing starts until the
 * params are known — that's what the null render is for.
 */
export function Overlay() {
  const params = useOverlayParams();
  if (!params) return null;
  return <OverlayApp params={params} />;
}
