import { readString, writeJSON } from "./storage";

export const CREDENTIALS_KEY = "rawad-twitch-auth";
const CHANGE_EVENT = "rawad-auth-changed";
export type Credentials = { token: string; clientId: string };

export function credentialsSnapshot(): string {
  return readString(CREDENTIALS_KEY);
}

export function parseCredentials(raw: string): Credentials | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const auth = value as Partial<Credentials>;
    if (typeof auth.token !== "string" || typeof auth.clientId !== "string") return null;
    // An empty pair is an intentional disconnect, overriding legacy URL tokens.
    if (!!auth.token !== !!auth.clientId) return null;
    return { token: auth.token, clientId: auth.clientId };
  } catch { return null; }
}

export function effectiveCredentials(raw: string, legacy: Credentials): Credentials {
  return parseCredentials(raw) ?? legacy;
}

export function saveCredentials(auth: Credentials): boolean {
  const ok = writeJSON(CREDENTIALS_KEY, auth);
  if (ok && typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  return ok;
}

export function clearCredentials(): boolean {
  return saveCredentials({ token: "", clientId: "" });
}

/** Never put credentials on the control bus, including its diagnostic history.
 * Sources read shared storage themselves; polling covers OBS's missing events.
 */
export function subscribeCredentials(changed: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CREDENTIALS_KEY || event.key === null) changed();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, changed);
  const poll = setInterval(changed, 500);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, changed);
    clearInterval(poll);
  };
}
