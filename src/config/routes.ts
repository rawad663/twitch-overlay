/**
 * The overlay and panel used to be two .html files next to each other, so the
 * dock derived one URL from the other with a filename regex. They're routes
 * now, which means the OAuth redirect target is an explicit constant — and it
 * must match the redirect URI registered on the Twitch app exactly.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Absolute URL of the overlay route — the registered OAuth redirect target. */
export function OVERLAY_URL(): string {
  if (typeof window === "undefined") return BASE + "/";
  return `${window.location.origin}${BASE}/`;
}

/** Absolute URL of the admin dock. */
export function ADMIN_URL(): string {
  if (typeof window === "undefined") return BASE + "/admin/";
  return `${window.location.origin}${BASE}/admin/`;
}
