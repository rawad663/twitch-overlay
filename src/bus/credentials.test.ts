import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CREDENTIALS_KEY, clearCredentials, credentialsSnapshot, effectiveCredentials, parseCredentials, saveCredentials, subscribeCredentials } from "./credentials";

const legacy = { token: "old-url-token", clientId: "old-client" };
const saved = { token: "saved-token", clientId: "saved-client" };
let storage: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("uses legacy URL credentials until a valid shared pair is saved", () => {
  expect(effectiveCredentials(credentialsSnapshot(), legacy)).toEqual(legacy);
  expect(saveCredentials(saved)).toBe(true);
  expect(effectiveCredentials(credentialsSnapshot(), legacy)).toEqual(saved);
  expect([...storage.keys()]).toEqual([CREDENTIALS_KEY]);
});

it("disconnects instead of reviving an expired URL token when removed", () => {
  saveCredentials(saved);
  expect(clearCredentials()).toBe(true);
  expect(effectiveCredentials(credentialsSnapshot(), legacy)).toEqual({ token: "", clientId: "" });
  expect(credentialsSnapshot()).not.toContain(saved.token);
});

it.each(["broken", "null", "[]", '{"token":"x"}', '{"token":"x","clientId":""}', '{"token":42,"clientId":"x"}'])("ignores malformed storage: %s", (raw) => {
  expect(parseCredentials(raw)).toBeNull();
  expect(effectiveCredentials(raw, legacy)).toEqual(legacy);
});

it("reports blocked storage without notifying or claiming a successful save", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
  const changed = vi.fn();
  const stop = subscribeCredentials(changed);
  expect(saveCredentials(saved)).toBe(false);
  expect(clearCredentials()).toBe(false);
  expect(credentialsSnapshot()).toBe("");
  expect(changed).not.toHaveBeenCalled();
  stop();
});

it("notifies the saving page and polls for changes when OBS omits storage events", async () => {
  const changed = vi.fn();
  const stop = subscribeCredentials(changed);
  saveCredentials(saved);
  expect(changed).toHaveBeenCalledOnce();
  storage.set(CREDENTIALS_KEY, JSON.stringify({ token: "replacement", clientId: "client" }));
  await vi.advanceTimersByTimeAsync(500);
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(changed).toHaveBeenCalledTimes(2);
});
