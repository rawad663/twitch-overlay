"use client";

import { useCallback, useRef } from "react";

/**
 * Per-viewer, per-command cooldown ledgers. Keeps one person from holding the
 * whole sky hostage with !wave.
 */
export function useCooldowns() {
  const logs = useRef(new Map<string, Map<string, number>>());

  /** true if the command is allowed right now (and starts the cooldown). */
  const cooldown = useCallback((name: string, login: string, seconds: number) => {
    let log = logs.current.get(name);
    if (!log) {
      log = new Map();
      logs.current.set(name, log);
    }
    const now = Date.now();
    const last = log.get(login) ?? 0;
    if (now - last < seconds * 1000) return false;
    log.set(login, now);
    return true;
  }, []);

  /** The panel shouldn't be rate-limited by a viewer's ledger. */
  const clear = useCallback((name: string, login: string) => {
    logs.current.get(name)?.delete(login);
  }, []);

  return { cooldown, clear };
}
