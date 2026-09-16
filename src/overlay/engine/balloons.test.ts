import { describe, expect, it } from "vitest";
import { CONFIG } from "@/config/config";
import { BalloonField } from "./balloons";
import type { BalloonGlyph } from "../chat/emotes";

const fire: BalloonGlyph = { kind: "emoji", text: "🔥" };

describe("BalloonField", () => {
  it("spawns one particle per glyph", () => {
    const f = new BalloonField();
    f.spawn([fire]);
    expect(f.balloons).toHaveLength(1);
    expect(f.balloons[0]!.glyph).toEqual(fire);
  });

  it("spawns near the bottom, rising, with a life in CONFIG range", () => {
    const f = new BalloonField();
    f.spawn([fire]);
    const b = f.balloons[0]!;
    expect(b.y).toBeGreaterThan(800);
    expect(b.vy).toBeLessThan(0);
    expect(b.max).toBeGreaterThanOrEqual(CONFIG.balloonMinLife);
    expect(b.max).toBeLessThanOrEqual(CONFIG.balloonMaxLife);
  });

  it("caps a dump at balloonPerMessage", () => {
    const f = new BalloonField();
    f.spawn(Array.from({ length: 20 }, () => fire));
    expect(f.balloons).toHaveLength(CONFIG.balloonPerMessage);
  });

  it("drops the oldest once the field hits balloonMax", () => {
    const f = new BalloonField();
    for (let i = 0; i < CONFIG.balloonMax + 10; i++) f.spawn([fire]);
    expect(f.balloons).toHaveLength(CONFIG.balloonMax);
  });

  it("ignores an empty spawn", () => {
    const f = new BalloonField();
    f.spawn([]);
    expect(f.balloons).toHaveLength(0);
  });
});
