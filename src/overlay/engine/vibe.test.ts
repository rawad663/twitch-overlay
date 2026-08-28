import { describe, expect, it } from "vitest";
import { VIBES, Vibe, type VibeMood } from "./vibe";

const EMBER: [number, number, number] = [232, 163, 61];

/**
 * Ember is reserved for gains — subs, gifts, raids, big cheers, completed
 * goals. A background mood must never borrow it, or the one colour that means
 * "someone just paid" stops meaning anything.
 */
describe("the ember reservation", () => {
  it("no mood uses ember for any channel", () => {
    for (const [name, v] of Object.entries(VIBES)) {
      for (const key of ["top", "mid", "glow"] as const) {
        const c = v[key];
        const near =
          Math.abs(c[0] - EMBER[0]) < 30 &&
          Math.abs(c[1] - EMBER[1]) < 30 &&
          Math.abs(c[2] - EMBER[2]) < 30;
        expect(near, `${name}.${key} is too close to ember`).toBe(false);
      }
    }
  });

  it("every mood stays in the violet→rune family (blue dominant)", () => {
    for (const [name, v] of Object.entries(VIBES)) {
      for (const key of ["top", "mid", "glow"] as const) {
        const [r, , b] = v[key];
        expect(b, `${name}.${key} should be blue-dominant`).toBeGreaterThan(r);
      }
    }
  });
});

describe("Vibe", () => {
  it("counts one hit per mood per message, however many times a word repeats", () => {
    const a = new Vibe();
    a.note("lol lol lol lol lol");
    const b = new Vibe();
    b.note("lol");
    a.decay();
    b.decay();
    expect(a.mood).toBe(b.mood);
  });

  it("takes on a mood once it clears the floor", () => {
    const v = new Vibe();
    for (let i = 0; i < 5; i++) v.note("pog");
    v.decay();
    expect(v.mood).toBe<VibeMood>("hype");
  });

  it("decays back to calm during a lull", () => {
    const v = new Vibe();
    for (let i = 0; i < 5; i++) v.note("pog");
    v.decay();
    expect(v.mood).toBe("hype");
    for (let i = 0; i < 20; i++) v.decay();
    expect(v.mood).toBe("calm");
  });

  it("ignores words it does not know", () => {
    const v = new Vibe();
    v.note("a perfectly ordinary sentence about maps");
    v.decay();
    expect(v.mood).toBe("calm");
  });

  it("seeds straight from the target on the very first frame", () => {
    // a scene that opened calm should already look calm, not fade in from nowhere
    const v = new Vibe();
    expect(v.step([], 25).top[0]).toBe(VIBES.calm.top[0]);
  });

  it("eases between moods rather than cutting", () => {
    const v = new Vibe();
    v.step([], 25); // seeded at calm
    for (let i = 0; i < 5; i++) v.note("pog");
    v.decay();

    const afterOne = v.step([], 25).top[0]!;
    // one frame must move toward hype without arriving — a hard swap reads as a bug
    expect(afterOne).toBeGreaterThan(VIBES.calm.top[0]);
    expect(afterOne).toBeLessThan(VIBES.hype.top[0]);

    for (let i = 0; i < 900; i++) v.step([], 25);
    expect(v.cur!.top[0]).toBeCloseTo(VIBES.hype.top[0], 0);
  });

  it("reads energy off the shared beats window", () => {
    const v = new Vibe();
    const now = Date.now();
    const beats = [now, now - 1000, now - 2000, now - 90_000]; // one is too old
    v.step(beats, 6);
    expect(v.energy).toBeCloseTo(3 / 6, 5);
  });

  it("caps energy at 1", () => {
    const v = new Vibe();
    const now = Date.now();
    v.step(Array.from({ length: 100 }, () => now), 25);
    expect(v.energy).toBe(1);
  });

  it("restore reseeds colour from the saved mood on the next frame", () => {
    const v = new Vibe();
    for (let i = 0; i < 5; i++) v.note("pog");
    v.decay();
    const rec = v.dump();
    const b = new Vibe();
    b.restore(rec);
    expect(b.mood).toBe("hype");
    expect(b.cur).toBeNull();
    expect(b.step([], 25).top[0]).toBe(VIBES.hype.top[0]);
  });
});
