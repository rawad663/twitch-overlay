import { afterEach, expect, it, vi } from "vitest";
import { fetchShoutout } from "./helix";

const auth = { token: "t", clientId: "c" };
const json = (data: unknown) => Promise.resolve({ ok: true, json: async () => ({ data }) });
afterEach(() => vi.unstubAllGlobals());

function stub(recent: unknown[], all: unknown[] = []) {
  const f = vi.fn((url: string) => {
    if (url.includes("users?")) return json([{ id: "42", login: "friend", display_name: "Friend" }]);
    if (url.includes("channels?")) return json([{ game_name: "Path of Exile 2" }]);
    if (url.includes("started_at=")) return json(recent);
    return json(all);
  });
  vi.stubGlobal("fetch", f);
  return f;
}

it("plays their most-viewed clip of the last 30 days", async () => {
  stub([{ id: "low", title: "meh", duration: 10, view_count: 3 }, { id: "top", title: "The play", duration: 22.4, view_count: 900 }]);
  const so = await fetchShoutout(auth, "friend", Date.parse("2026-11-25T00:00:00Z"));
  expect(so).toEqual({ login: "friend", name: "Friend", game: "Path of Exile 2", clip: { slug: "top", title: "The play", duration: 22 } });
});

it("falls back to all-time when nothing is recent, and to no clip at all", async () => {
  stub([], [{ id: "old", title: "Classic", duration: 30, view_count: 5 }]);
  expect((await fetchShoutout(auth, "friend"))?.clip?.slug).toBe("old");
  stub([], []);
  expect((await fetchShoutout(auth, "friend"))?.clip).toBeNull();
});

it("is null for a channel that doesn't exist", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([])));
  expect(await fetchShoutout(auth, "nobody")).toBeNull();
});
