"use client";

import { useCallback, useRef } from "react";

/**
 * Per-viewer, per-command cooldown ledgers. Keeps one person from holding the
 * whole sky hostage with !wave.
 */
export function useCooldowns() {
  const logs = useRef(new Map<string, Map<string, number>>());

  /** 0 if the command is allowed right now (and starts the cooldown), else ms left. */
  const cooldown = useCallback((name: string, login: string, seconds: number) => {
    let log = logs.current.get(name);
    if (!log) {
      log = new Map();
      logs.current.set(name, log);
    }
    const now = Date.now();
    const last = log.get(login) ?? 0;
    const left = seconds * 1000 - (now - last);
    if (left > 0) return left;
    log.set(login, now);
    return 0;
  }, []);

  return { cooldown };
}
