import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { claimOnce, formatLeft } from "./claim";

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  // a real queue, like Web Locks: callbacks run one at a time
  let chain: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_n: string, fn: () => unknown) => (chain = chain.then(fn)) } });
});
afterEach(() => vi.unstubAllGlobals());

it("lets exactly one source claim a message id", async () => {
  const results = await Promise.all([claimOnce("clip:1"), claimOnce("clip:1"), claimOnce("clip:1")]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await claimOnce("clip:2")).toBe(true);
});

it("does not record a claim the check refused", async () => {
  expect(await claimOnce("x", () => false)).toBe(false);
  expect(await claimOnce("x")).toBe(true);
});

it("formats time left for chat", () => {
  expect(formatLeft(42_000)).toBe("42s");
  expect(formatLeft(102_000)).toBe("1:42");
  expect(formatLeft(10)).toBe("1s");
});
