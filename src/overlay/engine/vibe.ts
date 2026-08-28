/**
 * Chill ambience.
 *
 * The chill scene has no countdown and no game to react to, so the background
 * has to carry the room. Two inputs, both already paid for:
 *
 *   energy — how fast chat is moving, read straight off the `beats` array the
 *            moon already maintains
 *   mood   — a decaying keyword tally over recent messages
 *
 * Words are counted and discarded, never drawn. Nothing a viewer types reaches
 * the screen, so this adds no moderation surface.
 *
 * Every mood stays inside the violet→rune ramp. `--ember` is reserved for
 * gains, so a mood can never borrow it — the moods separate on depth, motion
 * and twinkle instead of hue. `calm` is a byte-for-byte match of the away
 * scene's backdrop, so an idle chill scene looks exactly like the sky always has.
 */

export type VibeMood = "calm" | "cozy" | "funny" | "hype";

export type VibeRecord = {
  scores: Record<Exclude<VibeMood, "calm">, number>;
  mood: VibeMood;
};

export type VibeState = {
  top: [number, number, number];
  mid: [number, number, number];
  glow: [number, number, number];
  drift: number;
  twinkle: number;
};

export const VIBES: Record<VibeMood, VibeState> = {
  calm: { top: [26, 16, 48], mid: [11, 7, 24], glow: [122, 47, 242], drift: 0.75, twinkle: 0.85 },
  cozy: { top: [42, 20, 62], mid: [16, 9, 30], glow: [138, 74, 224], drift: 0.95, twinkle: 1.0 },
  funny: { top: [52, 28, 84], mid: [18, 10, 36], glow: [169, 123, 255], drift: 1.2, twinkle: 1.75 },
  hype: { top: [62, 26, 112], mid: [20, 8, 44], glow: [169, 123, 255], drift: 1.7, twinkle: 1.3 },
};

/**
 * `calm` carries no words on purpose — it's the floor everything decays back
 * down to, not something chat has to ask for.
 */
const VIBE_WORDS: Record<Exclude<VibeMood, "calm">, string> = {
  hype: "pog poggers pogchamp letsgo lesgo hype insane sheesh clutch gg ez fire goat huge yooo noway wow omg cracked w",
  funny: "lol lmao lmfao kekw omegalul lul haha hahaha ahaha xd dead crying icant deceased",
  cozy: "chill cozy comfy vibe vibes vibing relax calm nice cute love wholesome gm gn hi hello hey heya sleepy tea coffee",
};

const VIBE_LOOKUP = new Map<string, VibeMood>();
for (const mood of Object.keys(VIBE_WORDS) as Array<Exclude<VibeMood, "calm">>) {
  for (const w of VIBE_WORDS[mood].split(" ")) VIBE_LOOKUP.set(w, mood);
}

export class Vibe {
  private scores: Record<Exclude<VibeMood, "calm">, number> = { cozy: 0, funny: 0, hype: 0 };
  mood: VibeMood = "calm";
  /** eased colour state, seeded on the first frame */
  cur: VibeState | null = null;
  energy = 0;

  /**
   * One message in. Counts at most one hit per mood per message, so a wall of
   * "LOL LOL LOL" from one person doesn't outweigh the room.
   */
  note(msg: string) {
    const seen = new Set<VibeMood>();
    for (const w of String(msg).toLowerCase().split(/[^a-z]+/)) {
      const mood = w ? VIBE_LOOKUP.get(w) : undefined;
      if (mood) seen.add(mood);
    }
    for (const m of seen) {
      if (m !== "calm") this.scores[m] += 1;
    }
  }

  dump(): VibeRecord {
    return { scores: { ...this.scores }, mood: this.mood };
  }

  /**
   * Rehydrate from a session snapshot. `cur` stays null so the next frame
   * seeds from this mood instead of easing in from a different source's mid-blend.
   */
  restore(rec: VibeRecord) {
    this.scores.cozy = rec.scores.cozy;
    this.scores.funny = rec.scores.funny;
    this.scores.hype = rec.scores.hype;
    this.mood = rec.mood;
    this.cur = null;
  }

  /** Time-based, so the mood fades on its own during a lull. */
  decay() {
    let best: VibeMood | null = null;
    let bestVal = 0.9; // a mood has to clear the floor to take over
    for (const m of Object.keys(this.scores) as Array<Exclude<VibeMood, "calm">>) {
      this.scores[m] *= 0.72;
      if (this.scores[m] > bestVal) {
        bestVal = this.scores[m];
        best = m;
      }
    }
    this.mood = best ?? "calm";
  }

  private target(): VibeState {
    return VIBES[this.mood] ?? VIBES.calm;
  }

  /**
   * Eased every frame so the room drifts between moods instead of cutting
   * between them — a hard swap reads as a bug on stream.
   */
  step(beats: number[], fullMoonMessages: number): VibeState {
    const t = this.target();
    if (!this.cur) {
      this.cur = {
        top: [...t.top],
        mid: [...t.mid],
        glow: [...t.glow],
        drift: t.drift,
        twinkle: t.twinkle,
      };
    }
    const k = 0.018;
    const ease = (a: number, b: number) => a + (b - a) * k;

    for (const key of ["top", "mid", "glow"] as const) {
      for (let i = 0; i < 3; i++) {
        this.cur[key][i] = ease(this.cur[key][i]!, t[key][i]!);
      }
    }
    this.cur.drift = ease(this.cur.drift, t.drift);
    this.cur.twinkle = ease(this.cur.twinkle, t.twinkle);

    const now = Date.now();
    const live = beats.filter((b) => now - b < 60000).length;
    this.energy = Math.min(1, live / Math.max(1, fullMoonMessages));
    return this.cur;
  }

  rgb(key: "top" | "mid" | "glow", alpha: number): string {
    const c = this.cur ? this.cur[key] : VIBES.calm[key];
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
  }
}
