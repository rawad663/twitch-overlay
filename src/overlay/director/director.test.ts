import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Director } from "./director";
import { CONFIG } from "@/config/config";

describe("Director", () => {
  let d: Director;

  beforeEach(() => {
    vi.useFakeTimers();
    d = new Director();
  });
  afterEach(() => {
    d.destroy();
    vi.useRealTimers();
  });

  /** Drain the queue, collecting the order banners actually reached the screen. */
  function drain(): string[] {
    const seen: string[] = [];
    const off = d.subscribe((e) => {
      if (e) seen.push(e.who);
    });
    vi.advanceTimersByTime(120_000);
    off();
    return seen;
  }

  it("shows a higher priority first, whatever the arrival order", () => {
    d.push("follow", "follow", "");
    d.push("raid", "raid", "");
    d.push("cheer", "cheer", "");
    expect(drain()).toEqual(["raid", "cheer", "follow"]);
  });

  it("keeps FIFO within one priority", () => {
    d.push("follow", "first", "");
    d.push("follow", "second", "");
    d.push("follow", "third", "");
    expect(drain()).toEqual(["first", "second", "third"]);
  });

  it("never sheds something someone paid for", () => {
    // fill past the cap with paid events, then pile on cheap ones
    for (let i = 0; i < CONFIG.queueCap; i++) d.push("sub", `sub${i}`, "");
    for (let i = 0; i < 20; i++) d.push("follow", `follow${i}`, "");

    const seen = drain();
    const subs = seen.filter((w) => w.startsWith("sub"));
    expect(subs).toHaveLength(CONFIG.queueCap);
  });

  it("drops the cheapest thing when the queue overflows", () => {
    d.push("system", "system", "");
    for (let i = 0; i < CONFIG.queueCap; i++) d.push("raid", `raid${i}`, "");
    expect(drain()).not.toContain("system");
  });

  it("reports active while anything is queued, not only while animating", () => {
    expect(d.active()).toBe(false);
    d.push("follow", "who", "");
    expect(d.active()).toBe(true);
  });

  it("exposes a still-queued event so a second one can merge into it", () => {
    d.push("raid", "raid", ""); // holds the screen
    const f = d.push("follow", "follow", "");
    expect(d.pending("follow")).toBe(f);
  });

  it("plays a sound for gains and stays silent for follows", () => {
    const sound = vi.fn();
    const s = new Director(sound);
    s.push("follow", "f", "");
    vi.advanceTimersByTime(10_000);
    expect(sound).not.toHaveBeenCalled();

    s.push("sub", "s", "");
    vi.advanceTimersByTime(10_000);
    expect(sound).toHaveBeenCalledWith("sub");
    s.destroy();
  });

  it("leaves a gap between banners so two never blur together", () => {
    d.push("follow", "a", "");
    d.push("follow", "b", "");
    const at: number[] = [];
    const off = d.subscribe((e) => {
      if (e) at.push(Date.now());
    });
    vi.advanceTimersByTime(60_000);
    off();
    expect(at).toHaveLength(2);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(CONFIG.alertGap);
  });
});
