/**
 * Every alert sound is synthesised with Web Audio. No files: an OBS browser
 * source with a cold cache would otherwise miss the first alert of a stream
 * while it fetched an mp3, and the repo stays text-only.
 *
 * Follows, welcomes, small cheers and system notices are deliberately silent —
 * they happen often enough that a sound would become noise.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  vol: number;
  muted: boolean;

  constructor(volume = 0.5, muted = false) {
    this.vol = volume;
    this.muted = muted;
  }

  /** Apply the dock's current sound settings. */
  configure(volume: number, muted: boolean) {
    this.vol = volume;
    this.muted = muted;
  }

  /** Browsers refuse to start audio without a gesture; call this from one. */
  ready() {
    if (this.muted) return null;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private bell(ctx: AudioContext, freq: number, at: number, dur: number, gain: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * this.vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** The low swell under the loud events — raids and mass gifts. */
  private swell(ctx: AudioContext, at: number, dur: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(220, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.18 * this.vol, at + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  play(name: "sub" | "gift" | "massgift" | "raid" | "cheer") {
    if (this.muted) return;
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;

    switch (name) {
      case "sub":
        this.bell(ctx, 523.25, t, 0.5, 0.3);
        this.bell(ctx, 783.99, t + 0.09, 0.6, 0.26);
        break;
      case "gift":
        this.bell(ctx, 587.33, t, 0.42, 0.28);
        this.bell(ctx, 880.0, t + 0.08, 0.5, 0.24);
        break;
      case "massgift":
        this.swell(ctx, t, 0.9);
        this.bell(ctx, 523.25, t + 0.1, 0.5, 0.28);
        this.bell(ctx, 659.25, t + 0.2, 0.5, 0.26);
        this.bell(ctx, 783.99, t + 0.3, 0.7, 0.26);
        break;
      case "raid":
        this.swell(ctx, t, 1.1);
        this.bell(ctx, 392.0, t + 0.12, 0.55, 0.3);
        this.bell(ctx, 587.33, t + 0.26, 0.55, 0.28);
        this.bell(ctx, 880.0, t + 0.4, 0.8, 0.3);
        break;
      case "cheer":
        this.bell(ctx, 987.77, t, 0.3, 0.2);
        break;
    }
  }
}
