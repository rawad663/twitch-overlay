"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardLibrary, CardSnapshot, Settings, SupportCard } from "@/bus/types";
import { loadCardLibrary, normalizeCardLibrary, persistCardLibrary } from "./library";
import { cardContext, cardEligible, nextCardId } from "./rotation";

type Showing = {
  id: string | null;
  until: number;
  /** bumps on every rotation so the entry animation replays */
  n: number;
  /** "Show" from the dock: up for one full turn even if its schedule says no */
  forced: boolean;
};

/**
 * HUD-side rotation. Ticks on the overlay's existing one-second clock rather
 * than a timer of its own, so a card change can lag by at most a second.
 */
export function useSupportCards(settings: Settings, now: Date) {
  const [library, setLibrary] = useState<CardLibrary>(loadCardLibrary);
  const [showing, setShowing] = useState<Showing>({ id: null, until: 0, n: 0, forced: false });

  const ctx = cardContext(settings, now);
  const ctxKey = `${ctx.date}:${ctx.weekday}:${ctx.lab}`;
  const eligible = useMemo(
    () => library.cards.filter((c) => cardEligible(c, ctx)),
    // ctx is rebuilt every second; its key only changes when the answer can
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.cards, ctxKey],
  );

  const replace = useCallback((raw: CardLibrary) => {
    const next = normalizeCardLibrary(raw);
    persistCardLibrary(next);
    setLibrary(next);
  }, []);

  const t = now.getTime();
  useEffect(() => {
    if (!library.on) return;
    setShowing((cur) => {
      const card = cur.id ? library.cards.find((c) => c.id === cur.id) : undefined;
      const stillValid = !!card && (cur.forced ? true : eligible.some((c) => c.id === cur.id));
      if (stillValid && (library.paused || t < cur.until)) return cur;
      const id = nextCardId(eligible, stillValid ? cur.id : null);
      if (id === null && cur.id === null) return cur;
      // a lone card just stays up rather than replaying its entrance every turn
      if (id === cur.id && stillValid) return { ...cur, until: t + library.seconds * 1000, forced: false };
      return { id, until: t + library.seconds * 1000, n: cur.n + 1, forced: false };
    });
  }, [t, library, eligible]);

  const show = useCallback(
    (id: string) => {
      if (!library.cards.some((c) => c.id === id)) return;
      setShowing((cur) => ({ id, until: Date.now() + library.seconds * 1000, n: cur.n + 1, forced: true }));
    },
    [library],
  );

  const next = useCallback(() => {
    setShowing((cur) => ({
      id: nextCardId(eligible, cur.id),
      until: Date.now() + library.seconds * 1000,
      n: cur.n + 1,
      forced: false,
    }));
  }, [eligible, library.seconds]);

  const card: SupportCard | null = (library.on && library.cards.find((c) => c.id === showing.id)) || null;

  const snapshot = useCallback(
    (hidden: boolean): CardSnapshot =>
      card ? { id: card.id, until: library.paused ? 0 : showing.until, eligible: eligible.length, hidden } : null,
    [card, library.paused, showing.until, eligible.length],
  );

  return { library, card, showKey: `${showing.id}:${showing.n}`, replace, show, next, snapshot };
}
