"use client";

import { useEffect, useRef, useState } from "react";
import type { CardImage, SupportCard } from "@/bus/types";
import type { Auth } from "../twitch/helix";
import { fetchSubBadges, type SubBadge } from "../twitch/helix";
import { CONFIG } from "@/config/config";
import { libUrl } from "./library";

/**
 * Uploaded card images live in IndexedDB, not localStorage: a few images
 * would blow the ~5 MB localStorage budget the rest of the product shares.
 * OBS docks and sources share one origin and one profile, so the HUD reads
 * what the dock wrote. Clearing OBS's browser cache wipes them — the dock's
 * backup covers that.
 */
const DB = "rawad-cards";
const STORE = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function putImage(id: string, blob: Blob): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(blob, id));
    return true;
  } catch {
    return false;
  }
}

export async function getImage(id: string): Promise<Blob | null> {
  try {
    const v = await tx<unknown>("readonly", (s) => s.get(id));
    return v instanceof Blob ? v : null;
  } catch {
    return null;
  }
}

export async function listImageIds(): Promise<string[]> {
  try {
    return (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())).map(String);
  } catch {
    return [];
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* a leftover image costs a few KB; never worth failing a save over */
  }
}

/** Uploads are shrunk before they're stored: a card never shows art wider than ~190px. */
export async function shrinkImage(file: Blob, max = 480): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", 0.86),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob | null> {
  if (!/^data:image\/(webp|png|jpeg|gif);base64,/.test(url)) return null;
  try {
    return await (await fetch(url)).blob();
  } catch {
    return null;
  }
}

/* The badge list is the same for every card and every source on this token,
   so it's fetched once per token rather than once per render. */
const badgeCache = new Map<string, Promise<SubBadge[]>>();
export function subBadges(auth: Auth): Promise<SubBadge[]> {
  if (!auth.token || !auth.clientId) return Promise.resolve([]);
  const key = `${auth.clientId}:${auth.token}`;
  let p = badgeCache.get(key);
  if (!p) {
    p = fetchSubBadges(auth, CONFIG.channel).then((list) => {
      if (!list.length) badgeCache.delete(key); // retry next time rather than caching a failure
      return list;
    });
    badgeCache.set(key, p);
  }
  return p;
}

export function cardSrcs(cards: readonly SupportCard[]): string[] {
  return [...new Set(cards.flatMap((c) => c.images.map((i: CardImage) => i.src)))].sort();
}

/**
 * Resolve every `src` the cards use to something an <img> can load. A src
 * that can't be resolved (no token for badges, an upload missing on this PC)
 * is simply absent from the map — the card falls back to its placeholder orb.
 */
export function useCardImageUrls(srcs: readonly string[], auth: Auth, rev = 0): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const objectUrls = useRef(new Map<string, string>());
  const key = srcs.join("|");

  useEffect(() => {
    let live = true;
    const wanted = key ? key.split("|") : [];
    void (async () => {
      const out: Record<string, string> = {};
      const badges = wanted.some((s) => s.startsWith("twitch:sub:")) ? await subBadges(auth) : [];
      for (const src of wanted) {
        if (src.startsWith("lib:")) out[src] = libUrl(src.slice(4));
        else if (src.startsWith("https://")) out[src] = src;
        else if (src.startsWith("twitch:sub:")) {
          const b = badges.find((x) => x.version === src.slice(11));
          if (b) out[src] = b.url;
        } else if (src.startsWith("up:")) {
          const id = src.slice(3);
          let url = objectUrls.current.get(id);
          if (!url) {
            const blob = await getImage(id);
            if (!blob) continue;
            url = URL.createObjectURL(blob);
            objectUrls.current.set(id, url);
          }
          out[src] = url;
        }
      }
      if (!live) return;
      // release uploads no card points at any more
      for (const [id, url] of objectUrls.current) {
        if (!wanted.includes(`up:${id}`)) {
          URL.revokeObjectURL(url);
          objectUrls.current.delete(id);
        }
      }
      setUrls(out);
    })();
    return () => {
      live = false;
    };
  }, [key, auth.token, auth.clientId, rev]); // eslint-disable-line react-hooks/exhaustive-deps -- auth is read by value; key stands in for srcs

  useEffect(() => {
    const map = objectUrls.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  return urls;
}
