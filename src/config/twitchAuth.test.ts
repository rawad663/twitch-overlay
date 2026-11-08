import { afterEach, expect, it, vi } from "vitest";
import { authorizeUrl } from "./twitchAuth";

afterEach(() => vi.unstubAllGlobals());

it.each([
  "https://rawad663.github.io/twitch-overlay/admin/",
  "https://rawad663.github.io/twitch-overlay/admin.html",
  "http://localhost:3000/twitch-overlay/admin/",
])("uses the registered callback when the dock is at %s", (href) => {
  vi.stubGlobal("window", { location: new URL(href) });
  const url = new URL(authorizeUrl(" public-client-id "));
  expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
  expect(url.searchParams.get("redirect_uri")).toBe("https://rawad663.github.io/twitch-overlay/");
  expect(url.searchParams.get("client_id")).toBe("public-client-id");
  expect(url.searchParams.get("response_type")).toBe("token");
  expect(url.searchParams.get("scope")?.split(" ")).toEqual([
    "moderator:read:followers", "channel:read:subscriptions",
  ]);
  expect(url.href).not.toContain("rawad-overlay.html");
});
