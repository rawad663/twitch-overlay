import { CONFIG } from "@/config/config";
import { NEVER_SHED, TIERS, type AlertType } from "./tiers";

export type AlertEvent = {
  id: number;
  type: AlertType;
  who: string;
  /** pre-escaped HTML — see `esc()` in director/copy */
  html: string;
  prio: number;
  dur: number;
  tier: string | null;
  /** logins already merged into this event, so a second follow joins the first */
  names: string[];
  /** bits accumulated, for the cheer coalescing window */
  bits?: number;
};

/**
 * One serial banner queue. Two alerts must never share the screen — the whole
 * point of the banner is that it is the single loudest thing in the frame.
 *
 * Priority decides who goes next, FIFO within a priority. Over `queueCap` the
 * lowest-priority item is dropped, except that subs / gifts / raids are never
 * shed even when they are the lowest remaining — someone paid for those.
 */
export class Director {
  private q: AlertEvent[] = [];
  private showing: AlertEvent | null = null;
  private lastEnd = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private listeners = new Set<(e: AlertEvent | null) => void>();

  /** Fired when a queued event is mutated in place (a merged follow/cheer). */
  private onSound?: (name: "sub" | "gift" | "massgift" | "raid" | "cheer") => void;

  constructor(onSound?: (name: "sub" | "gift" | "massgift" | "raid" | "cheer") => void) {
    this.onSound = onSound;
  }

  active() {
    return !!this.showing || this.q.length > 0;
  }

  /** Subscribe to "what banner is on screen right now". */
  subscribe(fn: (e: AlertEvent | null) => void) {
    this.listeners.add(fn);
    fn(this.showing);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.showing);
  }

  /** The still-queued event of this type, so a second one can merge into it. */
  pending(type: AlertType): AlertEvent | undefined {
    return this.q.find((e) => e.type === type);
  }

  push(type: AlertType, who: string, html: string, extra?: Partial<AlertEvent>): AlertEvent {
    const t = TIERS[type];
    const evt: AlertEvent = {
      id: this.nextId++,
      type,
      who,
      html,
      prio: t.prio,
      dur: t.dur,
      tier: t.tier,
      names: [],
      ...extra,
    };

    // insert after everything of equal-or-higher priority — FIFO within a tier
    let i = this.q.length;
    while (i > 0 && this.q[i - 1]!.prio < evt.prio) i--;
    this.q.splice(i, 0, evt);

    if (this.q.length > CONFIG.queueCap) this.shed();
    this.pump();
    return evt;
  }

  /** Drop the least important thing we can afford to lose. */
  private shed() {
    let victim = -1;
    let worst = Infinity;
    for (let i = this.q.length - 1; i >= 0; i--) {
      const e = this.q[i]!;
      if (NEVER_SHED.has(e.type)) continue;
      if (e.prio < worst) {
        worst = e.prio;
        victim = i;
      }
    }
    // everything left is paid-for; drop the oldest of those rather than grow
    if (victim === -1) victim = 0;
    this.q.splice(victim, 1);
  }

  private pump() {
    if (this.showing || this.timer) return;
    const wait = Math.max(0, this.lastEnd + CONFIG.alertGap - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.q.shift();
      if (!next) return;
      this.render(next);
    }, wait);
  }

  private render(evt: AlertEvent) {
    this.showing = evt;
    if (evt.type === "sub" || evt.type === "gift" || evt.type === "massgift" || evt.type === "raid") {
      this.onSound?.(evt.type);
    } else if (evt.type === "cheer" || evt.type === "bigcheer") {
      this.onSound?.("cheer");
    }
    this.emit();

    setTimeout(() => {
      this.showing = null;
      this.lastEnd = Date.now();
      this.emit();
      this.pump();
    }, evt.dur);
  }

  /** Re-emit an event that was mutated while still queued or on screen. */
  touch(evt: AlertEvent) {
    if (this.showing?.id === evt.id) this.emit();
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.q = [];
    this.showing = null;
    this.listeners.clear();
  }
}
