/**
 * Every localStorage touch in the product goes through here. OBS docks and
 * sources can have storage blocked outright (and `file://` always does), so a
 * throw must never take a render down with it.
 */

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readString(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Does storage work at all? The admin panel's first diagnostic. */
export function storageProbe(): boolean {
  try {
    const k = "rawad-diag-probe";
    localStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}

/** Every `rawad-*` key currently present — tells the dock whether storage is shared. */
export function rawadKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("rawad-")) keys.push(k);
    }
  } catch {
    /* blocked — caller sees an empty list, which is the right signal */
  }
  return keys;
}
