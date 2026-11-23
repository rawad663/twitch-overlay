import type { TotalsState } from "@/bus/types";

export type Auth = { token: string; clientId: string };

export function helix(auth: Auth, path: string, init?: RequestInit) {
  return fetch("https://api.twitch.tv/helix/" + path, {
    ...init,
    headers: {
      "Client-Id": auth.clientId,
      Authorization: "Bearer " + auth.token,
      ...(init?.headers ?? {}),
    },
  });
}

export type TotalResult = { state: TotalsState; total?: number };

/** Every totals endpoint answers the same shape, so one reader covers both. */
export async function fetchTotal(auth: Auth, path: string): Promise<TotalResult> {
  try {
    const r = await helix(auth, path);
    if (r.status === 401) return { state: "expired" };
    if (r.status === 403) return { state: "noscope" };
    if (!r.ok) return { state: "error" };
    const j = (await r.json()) as { total?: unknown };
    if (typeof j.total !== "number") return { state: "error" };
    return { state: "ok", total: j.total };
  } catch {
    return { state: "error" };
  }
}

export type ClipMeta = {
  slug: string;
  title: string;
  creator: string;
  duration: number;
  thumb: string;
};

/** Look up a clip by slug so the card knows how long to stay up. */
export async function fetchClip(auth: Auth, slug: string): Promise<ClipMeta | null> {
  try {
    const r = await helix(auth, "clips?id=" + encodeURIComponent(slug));
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: Array<{
        id?: string;
        title?: string;
        creator_name?: string;
        duration?: number;
        thumbnail_url?: string;
      }>;
    };
    const c = j.data?.[0];
    if (!c) return null;
    const duration = Number(c.duration);
    return {
      slug: c.id ?? slug,
      title: String(c.title ?? slug).trim().slice(0, 80) || slug,
      creator: String(c.creator_name ?? "").trim().slice(0, 32),
      duration: Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration)) : 30,
      thumb: String(c.thumbnail_url ?? ""),
    };
  } catch {
    return null;
  }
}

/** Resolve the channel login to a user id, which every other call needs. */
export async function resolveUserId(auth: Auth, login: string): Promise<string | null> {
  try {
    const r = await helix(auth, "users?login=" + encodeURIComponent(login));
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: Array<{ id?: string }> };
    return j.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export type SubBadge = { version: string; title: string; url: string };

/**
 * The channel's own subscriber badges (Wanderer / Stargazer / Fatekeeper and
 * their tenure steps). Version "0" is the tier 1 base, "2000" and "3000" the
 * tier 2 and tier 3 bases. Needs no scope — any valid token reads them.
 */
export async function fetchSubBadges(auth: Auth, login: string): Promise<SubBadge[]> {
  try {
    const id = await resolveUserId(auth, login);
    if (!id) return [];
    const r = await helix(auth, "chat/badges?broadcaster_id=" + encodeURIComponent(id));
    if (!r.ok) return [];
    const j = (await r.json()) as {
      data?: Array<{
        set_id?: string;
        versions?: Array<{ id?: string; title?: string; image_url_4x?: string; image_url_2x?: string }>;
      }>;
    };
    const set = j.data?.find((d) => d.set_id === "subscriber");
    return (set?.versions ?? [])
      .map((v) => ({
        version: String(v.id ?? ""),
        title: String(v.title ?? "").slice(0, 40),
        url: String(v.image_url_4x ?? v.image_url_2x ?? ""),
      }))
      .filter((b) => /^\d{1,5}$/.test(b.version) && b.url.startsWith("https://"))
      .sort((a, b) => Number(a.version) - Number(b.version));
  } catch {
    return [];
  }
}
