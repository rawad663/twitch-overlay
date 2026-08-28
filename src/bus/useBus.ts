"use client";

import { useEffect, useRef, useState } from "react";
import { Bus } from "./bus";
import type { BusPayloads, BusRole, BusType } from "./types";

/**
 * Creates one Bus for the lifetime of the component and tears it down on
 * unmount. StrictMode's double-mount is handled by `destroy()` — the second
 * mount builds a fresh bus rather than stacking a second poll interval.
 *
 * Returns null until mounted (and on the server) because the transports are
 * browser-only; every consumer must tolerate that, which doubles as the
 * "don't start talking yet" signal.
 */
export function useBus(role?: BusRole): Bus | null {
  const [bus, setBus] = useState<Bus | null>(null);

  useEffect(() => {
    const b = new Bus(role).init();
    setBus(b);
    return () => {
      b.destroy();
      setBus(null);
    };
  }, [role]);

  return bus;
}

/**
 * Subscribe to one message type for as long as the component lives.
 *
 * The handler is re-read on every delivery through a state-held box, so a
 * caller can pass an inline arrow without resubscribing on each render.
 */
export function useBusHandler<T extends BusType>(
  bus: Bus | null,
  type: T,
  fn: (payload: BusPayloads[T]) => void,
) {
  const latest = useLatest(fn);
  useEffect(() => {
    if (!bus) return;
    return bus.on(type, (payload) => latest.current(payload));
  }, [bus, type, latest]);
}

/** Run `fn` on an interval, without the interval restarting when `fn` changes. */
export function useInterval(fn: () => void, ms: number | null) {
  const latest = useLatest(fn);
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => latest.current(), ms);
    return () => clearInterval(id);
  }, [ms, latest]);
}

/**
 * Keeps a ref pointing at the newest callback. The write happens in an effect,
 * not during render, so a long-lived subscription can call the current version
 * without resubscribing every time its closure changes.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
