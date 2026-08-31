import type { AwayState } from "@/bus/types";
import { CONFIG } from "@/config/config";
import { MOON, cameraCircle, keepOut, type Rect } from "@/design/stage";
import { Vibe } from "./vibe";
import type { SessionLedger } from "./session";
import type { Bloom, Dust, Mote, SceneStatus, Shot, Star } from "./types";
import { drawFrame } from "./draw";

export type SceneOptions = {
  chill: boolean;
  mode: string;
  demo: boolean;
  /** initial countdown from ?min=, re-read on every OBS show */
  minutes: number | null;
  /** the moon's `beats` array — shared, not copied */
  beats: number[];
  /** night's sky from a previous source; stars are re-placed for this layout */
  session?: SessionLedger;
  onStatus: (s: SceneStatus) => void;
};

const STATUS_HZ = 250;

/**
 * The starfield. Owns its own rAF loop and all particle state — React never
 * re-renders per frame, it only receives a status snapshot a few times a
 * second for the headline and goal bars.
 */
export class Scene {
  state: AwayState;
  until = 0;
  since = Date.now();
  follows = 0;
  subs = 0;
  messages = 0;

  stars = new Map<string, Star>();
  recent: string[] = [];
  shots: Shot[] = [];
  blooms: Bloom[] = [];
  dust: Array<Dust & { tw: number; sp: number }> = [];
  motes: Array<Mote & { tw: number; off: number }> = [];

  vibe: Vibe;
  moonFull = false;
  guideOn = false;
  afkReason = "";

  readonly chill: boolean;
  readonly demo: boolean;
  /** the moon's beat timestamps — shared with the HUD, never copied */
  readonly beats: number[];
  readonly moonX: number;
  readonly moonY: number;
  readonly moonR: number;
  private blocked: readonly Rect[];

  private ctx: CanvasRenderingContext2D | null = null;
  private raf: number | null = null;
  private paused = false;
  private destroyed = false;
  private lastStatus = 0;
  private guideTimer: ReturnType<typeof setTimeout> | null = null;
  private bc: BroadcastChannel | null = null;
  private opts: SceneOptions;

  constructor(opts: SceneOptions) {
    this.opts = opts;
    this.chill = opts.chill;
    this.demo = opts.demo;
    this.beats = opts.beats;
    this.vibe = opts.session?.vibe ?? new Vibe();

    this.state = opts.chill
      ? "chill"
      : opts.mode === "afk"
        ? "afk"
        : opts.mode === "brb"
          ? "brb"
          : opts.mode === "soon"
            ? "soon"
            : "idle";

    const moon = opts.chill ? MOON.chill : MOON.away;
    this.moonX = moon.x;
    this.moonY = moon.y;
    this.moonR = moon.r;

    /* Away modes: the HUD source is layered on top, so nothing of ours may
       land in its lanes — plus our own text blocks. Chill: no HUD is layered,
       so the only keep-outs are the camera frame and our own copy. */
    this.blocked = opts.chill
      ? keepOut(true)
      : [
          ...keepOut(false),
          [150, 240, 860, 320], // our own status block
          [150, 860, 500, 170], // our own goal bars
          [1140, 880, 670, 130], // our own prompt
        ];
  }

  /* ── geometry ── */

  free(x: number, y: number): boolean {
    // keep clear of the moon (and its glow) as well as every text block
    const dx = x - this.moonX;
    const dy = y - this.moonY;
    const clear = this.moonR + 60;
    if (dx * dx + dy * dy < clear * clear) return false;
    if (x < 60 || x > 1880 || y < 50 || y > 1040) return false;
    return !this.blocked.some(
      ([bx, by, bw, bh]) =>
        x > bx - 40 && x < bx + bw + 40 && y > by - 30 && y < by + bh + 30,
    );
  }

  /** Stable per-name placement, so someone's star is always in the same spot. */
  place(login: string): { x: number; y: number } | null {
    let h = 2166136261;
    for (let i = 0; i < login.length; i++) {
      h ^= login.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let a = 0; a < 40; a++) {
      const s1 = Math.imul(h ^ (a * 0x9e3779b9), 2654435761) >>> 0;
      const s2 = Math.imul(s1 ^ 0x85ebca6b, 2246822519) >>> 0;
      const x = 60 + (s1 % 1820);
      const y = 50 + (s2 % 990);
      if (this.free(x, y)) return { x, y };
    }
    return null; // sky's full in the usable region — skip this one
  }

  /* ── inputs ── */

  chat(login: string, name: string) {
    this.messages++;
    const now = Date.now();
    let st = this.stars.get(login);
    if (!st) {
      const pos = this.place(login);
      if (!pos) return;
      st = { x: pos.x, y: pos.y, name, born: now, last: now, bright: 0 };
      this.stars.set(login, st);
      if (this.stars.size > CONFIG.maxStars) {
        // evict whoever has been quiet longest
        let oldest: string | null = null;
        let oldestAt = Infinity;
        for (const [k, v] of this.stars) {
          if (v.last < oldestAt) {
            oldestAt = v.last;
            oldest = k;
          }
        }
        if (oldest) this.stars.delete(oldest);
      }
    }
    st.name = name;
    st.last = now;
    st.bright = 1;
    this.recent = [login, ...this.recent.filter((l) => l !== login)].slice(
      0,
      CONFIG.constellation,
    );
  }

  /**
   * Rebuild the sky from a session snapshot. Positions are computed for this
   * mode's keep-outs — a star that fit the HUD-less chill camera hole may not
   * fit the away layout, and vice versa.
   */
  hydrate(ledger: SessionLedger) {
    this.stars.clear();
    for (const rec of ledger.stars.values()) {
      const pos = this.place(rec.login);
      if (!pos) continue;
      this.stars.set(rec.login, {
        x: pos.x,
        y: pos.y,
        name: rec.name,
        born: rec.born,
        last: rec.last,
        bright: rec.bright,
      });
    }
    this.recent = ledger.recent.filter((l) => this.stars.has(l)).slice(0, CONFIG.constellation);
    if (this.chill) this.vibe.restore(ledger.vibe.dump());
  }

  private comet(name: string, ember: boolean) {
    this.shots.push({
      x: -160,
      y: 120 + Math.random() * 520,
      vx: 5.4 + Math.random() * 1.6,
      vy: 0.9 + Math.random() * 0.7,
      life: 0,
      max: 460,
      name: String(name || "someone"),
      ember,
    });
    if (this.shots.length > 6) this.shots.shift();
  }

  /** Called from the alert functions so a real follow/sub crosses the sky. */
  note(type: string, name: string) {
    if (type === "follow") this.follows++;
    else if (type === "sub" || type === "gift") this.subs++;
    else if (type === "massgift") this.subs += 5;
    // ember is a gain — a follow is not one
    this.comet(name, type !== "follow");
    this.pushStatus(true);
  }

  /**
   * Chat effects, chill only. `note()` already owns the comet system for real
   * follows and subs; a wave is the same object with no gains attached, so it
   * stays violet.
   */
  wave(name: string) {
    this.comet(name, false);
  }

  /**
   * A bloom lands on the viewer's own star, so !heart is how you find yourself
   * in the sky. No star means the sky was full when they first spoke — nothing
   * to bloom on, so skip.
   */
  bloom(login: string) {
    const st = this.stars.get(login);
    if (!st) return;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.283 + Math.random() * 0.4;
      const sp = 0.9 + Math.random() * 1.5;
      this.blooms.push({
        x: st.x,
        y: st.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: 70 + Math.random() * 30,
      });
    }
    st.bright = 1;
    st.last = Date.now();
    if (this.blooms.length > 260) this.blooms.splice(0, 60);
  }

  /* ── away state ──
     Chill is its own OBS source you toggle, and its layout has no room for a
     countdown — so away commands reaching this source no-op rather than
     half-rendering a BRB screen over the camera. */

  brb(minutes?: string | number) {
    if (this.chill) return;
    const m = Math.max(1, Math.min(180, parseInt(String(minutes ?? ""), 10) || CONFIG.brbMinutes));
    this.state = "brb";
    this.since = Date.now();
    this.until = Date.now() + m * 60000;
    this.reset();
    this.share();
  }

  soon(minutes?: string | number) {
    if (this.chill) return;
    const m = Math.max(1, Math.min(180, parseInt(String(minutes ?? ""), 10) || CONFIG.brbMinutes));
    this.state = "soon";
    this.since = Date.now();
    this.until = Date.now() + m * 60000;
    this.reset();
    this.share();
  }

  afk() {
    if (this.chill) return;
    this.state = "afk";
    this.since = Date.now();
    this.until = 0;
    this.reset();
    this.share();
  }

  setAfkReason(reason: string) {
    const next = reason.trim();
    if (next === this.afkReason) return;
    this.afkReason = next;
    this.pushStatus(true);
  }

  back() {
    if (this.chill) return;
    this.state = "back";
    this.until = 0;
    this.share();
  }

  /** Restart the current mode with the same duration. */
  again() {
    if (this.chill) return;
    const mins = Math.round((this.until - this.since) / 60000);
    if (this.state === "afk") this.afk();
    else if (this.state === "soon") this.soon(mins);
    else this.brb(mins);
  }

  reset() {
    this.follows = this.subs = this.messages = 0;
    this.moonFull = false;
    this.pushStatus(true);
  }

  private share() {
    try {
      this.bc?.postMessage({ state: this.state, until: this.until, since: this.since });
    } catch {
      /* channel closed */
    }
    this.pushStatus(true);
  }

  /* ── the loop ── */

  mount(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");

    // ambient dust — seeded once, drifts forever
    for (let i = 0; i < 130; i++) {
      this.dust.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        r: 0.6 + Math.random() * 1.5,
        a: 0.12 + Math.random() * 0.3,
        vx: 0,
        vy: 0,
        tw: Math.random() * 6.283,
        sp: 0.004 + Math.random() * 0.012,
      });
    }

    if (this.chill) {
      for (let i = 0; i < 5; i++) {
        this.motes.push({
          a: Math.random() * 6.283,
          sp: 0.0016 + Math.random() * 0.0022,
          r: 1.4 + Math.random() * 1.6,
          size: 0,
          tw: Math.random() * 6.283,
          off: Math.random() * 16,
        });
      }
      this.showGuide();
    }

    try {
      this.bc = new BroadcastChannel("rawad-away");
      this.bc.onmessage = (e) => {
        const d = e.data as { state?: AwayState; until?: number; since?: number };
        // a chill source must never adopt a countdown, and a stale message
        // must never rewind a fresher local state
        if (this.chill || !d || typeof d.since !== "number" || d.since < this.since) return;
        this.state = d.state ?? this.state;
        this.until = d.until ?? 0;
        this.since = d.since;
        this.pushStatus(true);
      };
    } catch {
      /* no BroadcastChannel — the bus still carries away commands */
    }

    if (this.opts.session) this.hydrate(this.opts.session);

    // Arm the mode we booted in. `setVisible(true)` is exactly the right entry
    // point: it's the same path OBS takes when the source is shown, so a fresh
    // load and a re-show produce an identical fresh timer.
    this.setVisible(true);
  }

  /**
   * OBS hide/show. Showing the source always starts a fresh timer, which makes
   * hide/show a one-click reset from OBS alone.
   */
  setVisible(v: boolean) {
    if (v) {
      const min = this.opts.minutes;
      if (this.opts.mode === "brb") this.brb(min ?? undefined);
      else if (this.opts.mode === "soon") this.soon(min ?? undefined);
      else if (this.opts.mode === "afk") this.afk();
      else if (this.chill) this.showGuide(); // replay the intro on entry
      this.paused = false;
      this.start();
    } else {
      this.paused = true; // hidden OBS sources keep running otherwise
    }
  }

  /**
   * Viewers can't use commands they've never seen, so the full list leads on
   * entry and then gets out of the way — the rotating line carries it from
   * there. Re-armed by setVisible().
   */
  showGuide() {
    if (!this.chill) return;
    if (this.guideTimer) clearTimeout(this.guideTimer);
    this.guideOn = true;
    this.pushStatus(true);
    this.guideTimer = setTimeout(
      () => {
        this.guideOn = false;
        this.pushStatus(true);
      },
      Math.max(3, CONFIG.guideSeconds) * 1000,
    );
  }

  private start() {
    if (this.raf === null && !this.destroyed) {
      this.raf = requestAnimationFrame(() => this.frame());
    }
  }

  private frame() {
    this.raf = null;
    if (this.paused || this.destroyed) return;
    this.draw();
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private draw() {
    if (!this.ctx) return;
    drawFrame(this.ctx, this, Date.now());
    this.pushStatus(false);
  }

  /** Snapshot for React. Throttled hard — this is not a per-frame channel. */
  private pushStatus(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastStatus < STATUS_HZ) return;
    this.lastStatus = now;
    this.opts.onStatus(this.status(now));
  }

  goalDefs() {
    return [
      { label: "New souls", value: this.follows, target: CONFIG.goalFollows },
      { label: "Oaths sworn", value: this.subs, target: CONFIG.goalSubs },
      { label: "Messages", value: this.messages, target: CONFIG.goalMessages },
    ];
  }

  status(now = Date.now()): SceneStatus {
    const goals = this.goalDefs().map((g) => ({ ...g, done: g.value >= g.target }));
    const base = { state: this.state, goals };

    if (this.chill) {
      return { ...base, kicker: "", title: "", timer: "", sub: "", over: false };
    }
    if (this.state === "back") {
      return {
        ...base,
        kicker: "The vigil ends",
        title: "Back now",
        timer: "",
        sub: "Thanks for keeping the sky lit",
        over: false,
      };
    }

    const fmt = (ms: number) => {
      const s = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
    };

    if (this.state === "brb" || this.state === "soon") {
      const left = this.until - now;
      const soon = this.state === "soon";
      if (left > 0) {
        return {
          ...base,
          kicker: soon ? "The sky is waking" : "The moon keeps watch",
          title: soon ? "Starting soon" : "Be right back",
          timer: fmt(left),
          sub: soon
            ? "Talk, !fate, follow — light the moon before we drop"
            : "Chat raises the moon while I'm gone",
          over: false,
        };
      }
      // never sit on 00:00 — overrunning should still look deliberate
      return {
        ...base,
        kicker: soon ? "The sky is waking" : "The moon keeps watch",
        title: soon ? "Starting soon" : "Be right back",
        timer: "any moment now…",
        sub: soon ? "Keep the sky loud — we're close" : "Keep the sky busy a little longer",
        over: true,
      };
    }

    if (this.state === "afk") {
      return {
        ...base,
        kicker: this.afkReason || "Away — the moon keeps watch",
        title: "AFK",
        timer: fmt(now - this.since),
        sub: "Back when the sky says so",
        over: false,
      };
    }

    return { ...base, kicker: "", title: "", timer: "", sub: "", over: false };
  }

  /** Live chat rate over the same 60s window the moon reads. */
  liveBeats(now = Date.now()) {
    return this.beats.filter((b) => now - b < 60000).length;
  }

  energy(now = Date.now()) {
    return Math.min(1, this.liveBeats(now) / Math.max(1, CONFIG.fullMoonMessages));
  }

  cam() {
    return cameraCircle(CONFIG.camera);
  }

  destroy() {
    this.destroyed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.guideTimer) clearTimeout(this.guideTimer);
    try {
      this.bc?.close();
    } catch {
      /* already gone */
    }
    this.bc = null;
    this.ctx = null;
  }
}
