import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LabChat } from "./lab";
import { easternDate, labReply, NO_LAB } from "@/config/lab";
import { DEFAULT_SETTINGS } from "@/config/config";
import { mergeSettings } from "@/config/settings";

const auth = { token: "test", clientId: "client" };
let store: Map<string, string>;
let send = vi.fn<(url: string, options: RequestInit) => Promise<unknown>>();
let validate: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
  store = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  let locked = false;
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, fn: (lock: object | null) => Promise<void>) => {
    if (locked) return fn(null);
    locked = true; try { await fn({}); } finally { locked = false; }
  } } });
  validate = { login: "rawad663", client_id: "client", user_id: "123", scopes: ["user:write:chat"] };
  send = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ is_sent: true }] }) }));
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => url.includes("validate") ? Promise.resolve({ ok: true, json: async () => validate }) : send(url, options)));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("expires at Eastern midnight, including summer DST", () => {
  expect(easternDate(new Date("2026-11-20T04:59:59Z"))).toBe("2026-11-19");
  expect(easternDate(new Date("2026-11-20T05:00:00Z"))).toBe("2026-11-20");
  expect(easternDate(new Date("2026-07-20T03:59:59Z"))).toBe("2026-07-19");
  expect(labReply({ labSummary: "Test builds", labDate: "2026-11-18" })).toBe(NO_LAB);
  expect(labReply({ labSummary: "   ", labDate: "2026-11-19" })).toBe(NO_LAB);
});
it("normalizes summaries without clobbering unrelated settings", () => {
  const s = mergeSettings(DEFAULT_SETTINGS, { labSummary: "  test\n builds ", labDate: "2026-11-19" });
  expect(s.labSummary).toBe("test builds"); expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
  expect(mergeSettings(s, { volume: 0.2 }).labSummary).toBe("test builds");
});
it("sends once across two sources, survives reloads and reads fresh settings", async () => {
  const a = new LabChat(auth, "rawad663", vi.fn()); const b = new LabChat(auth, "rawad663", vi.fn());
  await Promise.all([a.start(), b.start()]);
  store.set("rawad-settings", JSON.stringify({ labSummary: "Compare builds", labDate: "2026-11-19" }));
  await Promise.all([a.reply(), b.reply()]); expect(send).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(send.mock.calls[0]![1].body)).message).toBe("Today's lab: Compare builds");
  a.destroy(); const c = new LabChat(auth, "rawad663", vi.fn()); await c.start(); await c.reply(); expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(15000); store.set("rawad-settings", JSON.stringify({ labSummary: "" }));
  await c.reply(); expect(JSON.parse(String(send.mock.calls[1]![1].body)).message).toBe(NO_LAB);
});
it.each(["scope", "account", "client"])("does not send with invalid %s", async kind => {
  if (kind === "scope") validate.scopes = [];
  if (kind === "account") validate.login = "someone_else";
  if (kind === "client") validate.client_id = "other";
  const notice = vi.fn(); const a = new LabChat(auth, "rawad663", notice); await a.start(); await a.reply();
  expect(send).not.toHaveBeenCalled(); expect(notice).toHaveBeenLastCalledWith(expect.stringContaining("authorize"));
});
it("fails closed when storage is blocked", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("blocked"); } });
  const a = new LabChat(auth, "rawad663", vi.fn()); await a.start(); await a.reply(); expect(send).not.toHaveBeenCalled();
});
it("disables sending after expired authorization and never sends after teardown", async () => {
  const a = new LabChat(auth, "rawad663", vi.fn()); await a.start();
  send.mockResolvedValue({ ok: false, status: 401 }); await a.reply(); vi.advanceTimersByTime(15000); await a.reply(); expect(send).toHaveBeenCalledTimes(1);
  a.destroy(); await a.reply(); expect(send).toHaveBeenCalledTimes(1);
});

