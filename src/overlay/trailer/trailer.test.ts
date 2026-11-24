import { describe, expect, it } from "vitest";
import { headlineSize, leftLabel, parseLayer, parseTrigger, trailerDue } from "./trailer";

const qs = (s: string) => new URLSearchParams(s);

describe("parseTrigger", () => {
  it("is off without a scene name", () => {
    expect(parseTrigger(qs("mode=soon"))).toBeNull();
    expect(parseTrigger(qs("mode=soon&trailer=%20"))).toBeNull();
  });

  it("keeps the scene name exactly, spaces included", () => {
    expect(parseTrigger(qs("mode=soon&trailer=Starting%20Soon%20Trailer"))).toEqual({
      scene: "Starting Soon Trailer",
      leadMs: 120000,
    });
  });

  it("clamps a custom lead and ignores junk", () => {
    expect(parseTrigger(qs("trailer=T&lead=90"))?.leadMs).toBe(90000);
    expect(parseTrigger(qs("trailer=T&lead=2"))?.leadMs).toBe(10000);
    expect(parseTrigger(qs("trailer=T&lead=abc"))?.leadMs).toBe(120000);
  });
});

describe("parseLayer", () => {
  it("only answers to mode=trailer", () => {
    expect(parseLayer(qs("mode=soon"))).toBeNull();
    expect(parseLayer(qs(""))).toBeNull();
  });

  it("defaults to the two-minute trailer and its end-card slot", () => {
    expect(parseLayer(qs("mode=trailer"))).toEqual({ leadMs: 120000, cardMs: 113600, chip: true });
  });

  it("never lets the card start after the trailer ends", () => {
    expect(parseLayer(qs("mode=trailer&lead=60&card=100"))?.cardMs).toBe(60000);
  });

  it("can hide the countdown chip", () => {
    expect(parseLayer(qs("mode=TRAILER&chip=0"))?.chip).toBe(false);
  });
});

describe("trailerDue", () => {
  const lead = 120000;

  it("fires on the tick that crosses the lead", () => {
    expect(trailerDue(120080, 119980, lead)).toBe(true);
    expect(trailerDue(120100, 120000, lead)).toBe(true);
  });

  it("does not fire before or after the crossing", () => {
    expect(trailerDue(300000, 299900, lead)).toBe(false);
    expect(trailerDue(119980, 119880, lead)).toBe(false);
  });

  it("does not fire on the first sample of a countdown", () => {
    // a one-minute countdown, or a source shown with under two minutes left
    expect(trailerDue(null, 60000, lead)).toBe(false);
    expect(trailerDue(null, 120000, lead)).toBe(false);
  });

  it("does not fire once the countdown has run out", () => {
    expect(trailerDue(120050, -200, lead)).toBe(false);
  });
});

describe("leftLabel", () => {
  it("reads 2:00 at the start and 0:00 only at the end", () => {
    expect(leftLabel(0, 120000)).toBe("2:00");
    expect(leftLabel(500, 120000)).toBe("2:00");
    expect(leftLabel(1000, 120000)).toBe("1:59");
    expect(leftLabel(119200, 120000)).toBe("0:01");
    expect(leftLabel(120000, 120000)).toBe("0:00");
    expect(leftLabel(999999, 120000)).toBe("0:00");
  });
});

describe("headlineSize", () => {
  it("shrinks as the headline grows", () => {
    const sizes = ["Can I reach endgame?", "Can I beat the Brine King with one death left?", "x".repeat(80), "x".repeat(200)].map(headlineSize);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBe(4);
  });
});
