import type { Credentials } from "@/bus/credentials";

type Result = { ok: true; auth: Credentials; subs: boolean } | { ok: false; error: string };

export async function validateToken(value: string, channel: string): Promise<Result> {
  const token = value.trim().replace(/^oauth:/i, "");
  if (!token || /\s|[?&#/]/.test(token)) {
    return { ok: false, error: "Paste the access token only, not an overlay URL." };
  }
  try {
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) return { ok: false, error: "This token has expired or was revoked. Authorize Twitch again." };
    if (!response.ok) return { ok: false, error: "Twitch could not validate the token. Try again shortly." };
    const data = await response.json() as { client_id?: string; login?: string; user_id?: string; scopes?: string[]; expires_in?: number };
    if (!data.client_id || !data.user_id || data.login?.toLowerCase() !== channel.toLowerCase()) {
      return { ok: false, error: `Authorize while signed in as ${channel}, then copy the new token.` };
    }
    if (data.expires_in === 0) return { ok: false, error: "This token has expired. Authorize Twitch again." };
    if (!Array.isArray(data.scopes) || !data.scopes.includes("moderator:read:followers")) {
      return { ok: false, error: "This token is missing follower access. Use the Authorize URL below to get a new one." };
    }
    return { ok: true, auth: { token, clientId: data.client_id }, subs: data.scopes.includes("channel:read:subscriptions") };
  } catch {
    return { ok: false, error: "Could not reach Twitch. Check your connection and try again." };
  }
}
