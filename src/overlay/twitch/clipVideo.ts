/**
 * Direct MP4 for a clip, via the GraphQL endpoint twitch.tv itself uses.
 *
 * Why not the official embed: Path of Exile is a mature-rated game, so Twitch
 * puts a content-classification label on every clip from the channel, and the
 * embed player refuses to autoplay labelled content — it sits on a play button
 * until someone clicks. It also has no way to hide its controls. A bare
 * <video> has neither problem.
 *
 * This is NOT a public API. The client id is twitch.tv's own web client, the
 * same one every clip-shoutout widget uses, and the persisted-query hash is
 * whatever the site ships. Either can change without notice; when it does
 * this returns null and the player ends the card instead of showing a dead
 * frame. Rawad chose this over hosting downloaded clip files (2026-11-25).
 */

const GQL_URL = "https://gql.twitch.tv/gql";
const WEB_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const CLIP_TOKEN_HASH = "36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11";

/** The pip is 644px wide, so anything past 720p is bandwidth for nothing. */
const TARGET_HEIGHT = 720;

type Quality = { quality?: string; sourceURL?: string };
type ClipTokenResponse = {
  data?: {
    clip?: {
      playbackAccessToken?: { signature?: string; value?: string } | null;
      videoQualities?: Quality[] | null;
    } | null;
  };
};

/** Pick a rendition and sign it. Pure, so it is testable without the network. */
export function clipVideoUrl(res: unknown): string | null {
  const clip = (res as ClipTokenResponse | null)?.data?.clip;
  const sig = clip?.playbackAccessToken?.signature;
  const token = clip?.playbackAccessToken?.value;
  const list = (clip?.videoQualities ?? []).filter((q): q is Required<Quality> => !!q?.sourceURL && !!q.quality);
  if (!sig || !token || !list.length) return null;

  const height = (q: Quality) => parseInt(q.quality ?? "", 10) || 0;
  // smallest rendition at or above the target, else the biggest there is
  const atLeast = list.filter((q) => height(q) >= TARGET_HEIGHT).sort((a, b) => height(a) - height(b));
  const pick = atLeast[0] ?? [...list].sort((a, b) => height(b) - height(a))[0]!;

  const sep = pick.sourceURL.includes("?") ? "&" : "?";
  return `${pick.sourceURL}${sep}sig=${encodeURIComponent(sig)}&token=${encodeURIComponent(token)}`;
}

export async function fetchClipVideo(slug: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch(GQL_URL, {
      method: "POST",
      signal,
      headers: { "Client-ID": WEB_CLIENT_ID, "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        operationName: "VideoAccessToken_Clip",
        variables: { slug },
        extensions: { persistedQuery: { version: 1, sha256Hash: CLIP_TOKEN_HASH } },
      }),
    });
    if (!r.ok) return null;
    return clipVideoUrl(await r.json());
  } catch {
    return null;
  }
}
