import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateToken } from "./validateToken";

const valid = { user_id: "user", login: "rawad663", client_id: "validated-client", expires_in: 3600, scopes: ["moderator:read:followers", "channel:read:subscriptions"] };
const request = vi.fn();
beforeEach(() => {
  request.mockReset().mockResolvedValue(new Response(JSON.stringify(valid)));
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

it("gets the matching client ID from Twitch and sends the token only in a header", async () => {
  expect(await validateToken(" oauth:example-token ", "rawad663")).toEqual({
    ok: true, auth: { token: "example-token", clientId: "validated-client" }, subs: true,
  });
  expect(request.mock.calls[0]![0]).toBe("https://id.twitch.tv/oauth2/validate");
  expect(request.mock.calls[0]![1].headers).toEqual({ Authorization: "OAuth example-token" });
});

it.each([
  { ...valid, login: "someone_else" },
  { ...valid, scopes: [] },
  { ...valid, expires_in: 0 },
  { client_id: "app-token" },
])("rejects tokens unusable for this channel", async (data) => {
  request.mockResolvedValue(new Response(JSON.stringify(data)));
  expect((await validateToken("secret", "rawad663")).ok).toBe(false);
});

it("allows follower access while identifying missing subscription scope", async () => {
  request.mockResolvedValue(new Response(JSON.stringify({ ...valid, scopes: ["moderator:read:followers"] })));
  expect(await validateToken("secret", "rawad663")).toMatchObject({ ok: true, subs: false });
});

it("rejects expired tokens and never includes their value in error text", async () => {
  request.mockResolvedValue(new Response(null, { status: 401 }));
  const result = await validateToken("secret", "rawad663");
  expect(result).toEqual({ ok: false, error: expect.stringContaining("expired") });
  expect(JSON.stringify(result)).not.toContain("secret");
});

it("handles connection failures without changing any credentials", async () => {
  request.mockRejectedValue(Error("network"));
  expect(await validateToken("secret", "rawad663")).toEqual({ ok: false, error: expect.stringContaining("Could not reach Twitch") });
});

it("does not send accidentally pasted URLs to Twitch as credentials", async () => {
  expect((await validateToken("https://example.com/?token=secret", "rawad663")).ok).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
