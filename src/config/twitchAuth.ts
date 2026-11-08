// Twitch requires an exact registered callback, even when the dock is previewed
// on another origin. This is independent of the page used to open the dock.
export const TWITCH_REDIRECT_URL = "https://rawad663.github.io/twitch-overlay/";

export function authorizeUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId.trim() || "YOUR_CLIENT_ID",
    redirect_uri: TWITCH_REDIRECT_URL,
    response_type: "token",
    scope: "moderator:read:followers channel:read:subscriptions",
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}
