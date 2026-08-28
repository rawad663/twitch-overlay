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
