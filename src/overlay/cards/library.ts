import {
  CARDS_KEY,
  type CardImage,
  type CardLayout,
  type CardLibrary,
  type CardWhen,
  type SupportCard,
} from "@/bus/types";
import { readJSON, writeJSON } from "@/bus/storage";
import { HUD_LANES, STAGE_H, STAGE_W } from "@/design/stage";

/**
 * Text limits the dock enforces so a card can never overflow its 320×176 box
 * on stream. The title gets two lines at 22px, the body two at 14.5px.
 */
export const CARD_LIMITS = {
  kicker: 22,
  title: 36,
  body: 80,
  url: 40,
  label: 14,
  images: 3,
  cards: 12,
} as const;

export const CARD_W = HUD_LANES.support[2];
export const CARD_H = HUD_LANES.support[3];
export const CARD_SECONDS = { min: 15, max: 300, fallback: 50 } as const;

/** Art shipped in public/cards/. The dock's picker lists these first. */
export const LIBRARY_ART: ReadonlyArray<{ name: string; label: string; file: string }> = [
  { name: "renly", label: "Renly at the forge", file: "renly.webp" },
  { name: "lachlann", label: "Lachlann", file: "lachlann.webp" },
  { name: "una", label: "Una's lute", file: "una.webp" },
  { name: "crown", label: "Crown", file: "crown.svg" },
  { name: "orb", label: "Violet orb", file: "orb.svg" },
];

const LAYOUTS: readonly CardLayout[] = ["tile", "art", "row"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Only the four source kinds a card understands survive. Anything else —
 * `javascript:`, `data:`, plain http — is dropped rather than rendered.
 */
export function validImageSrc(src: unknown): string {
  const s = String(src ?? "").trim();
  if (/^lib:[a-z0-9-]{1,32}$/.test(s)) return LIBRARY_ART.some((a) => `lib:${a.name}` === s) ? s : "";
  if (/^up:[a-z0-9]{6,32}$/.test(s)) return s;
  if (/^twitch:sub:\d{1,5}$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]{4,500}$/i.test(s)) return s;
  return "";
}

function asImages(raw: unknown): CardImage[] {
  if (!Array.isArray(raw)) return [];
  const out: CardImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = validImageSrc((item as CardImage).src);
    if (!src) continue;
    out.push({ src, label: clean((item as CardImage).label, CARD_LIMITS.label) });
    if (out.length >= CARD_LIMITS.images) break;
  }
  return out;
}

function asWhen(raw: unknown): CardWhen {
  const w = (raw && typeof raw === "object" ? raw : {}) as Partial<CardWhen>;
  const labs = w.labs === "any" || w.labs === "play" || w.labs === "dev" ? w.labs : "";
  const days = Array.isArray(w.days)
    ? [...new Set(w.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  return {
    labs,
    days,
    from: typeof w.from === "string" && DATE.test(w.from) ? w.from : "",
    until: typeof w.until === "string" && DATE.test(w.until) ? w.until : "",
  };
}

export function newCardId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function asCard(raw: unknown): SupportCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<SupportCard>;
  const id = /^[a-z0-9]{4,16}$/.test(String(c.id ?? "")) ? String(c.id) : newCardId();
  const focus = Number(c.focus);
  return {
    id,
    enabled: c.enabled !== false,
    layout: LAYOUTS.includes(c.layout as CardLayout) ? (c.layout as CardLayout) : "tile",
    kicker: clean(c.kicker, CARD_LIMITS.kicker),
    title: clean(c.title, CARD_LIMITS.title),
    body: clean(c.body, CARD_LIMITS.body),
    url: clean(c.url, CARD_LIMITS.url),
    images: asImages(c.images),
    focus: Number.isFinite(focus) ? Math.max(0, Math.min(100, Math.round(focus))) : 30,
    when: asWhen(c.when),
  };
}

export function blankCard(): SupportCard {
  return {
    id: newCardId(),
    enabled: true,
    layout: "tile",
    kicker: "",
    title: "New card",
    body: "",
    url: "",
    images: [],
    focus: 30,
    when: { labs: "", days: [], from: "", until: "" },
  };
}

/** The starting set, written on first load. Every one can be edited or removed in the dock. */
export const DEFAULT_CARDS: SupportCard[] = [
  {
    id: "builddoc",
    enabled: true,
    layout: "art",
    kicker: "Build Doctor · Wed",
    title: "Subs skip the queue",
    body: "Drop your build in chat. I fix it live, **subs** first.",
    url: "",
    images: [{ src: "lib:renly", label: "" }],
    focus: 22,
    when: { labs: "dev", days: [], from: "2026-12-16", until: "" },
  },
  {
    id: "prime",
    enabled: true,
    layout: "tile",
    kicker: "Free with Prime",
    title: "Got Prime? Your free sub works here",
    body: "Costs you nothing. Re-claim it every month.",
    url: "",
    images: [{ src: "lib:crown", label: "" }],
    focus: 30,
    when: { labs: "", days: [], from: "", until: "" },
  },
  {
    id: "badges",
    enabled: true,
    layout: "row",
    kicker: "Sub badges",
    title: "",
    body: "Your badge grows the longer you stay.",
    url: "",
    images: [
      { src: "twitch:sub:0", label: "Wanderer" },
      { src: "twitch:sub:2000", label: "Stargazer" },
      { src: "twitch:sub:3000", label: "Fatekeeper" },
    ],
    focus: 30,
    when: { labs: "", days: [], from: "", until: "" },
  },
  {
    id: "drops",
    // off until GGG's 1.0 reward is confirmed and its image is uploaded
    enabled: false,
    layout: "tile",
    kicker: "Launch run · Dec 11–22",
    title: "2 subs here earn GGG's reward",
    body: "New or gifted, any tier.",
    url: "pathofexile.com/twitchdrops",
    images: [{ src: "lib:orb", label: "" }],
    focus: 30,
    when: { labs: "", days: [], from: "2026-12-11", until: "2026-12-22" },
  },
];

export const DEFAULT_LIBRARY: CardLibrary = {
  v: 1,
  on: true,
  paused: false,
  seconds: CARD_SECONDS.fallback,
  x: HUD_LANES.support[0],
  y: HUD_LANES.support[1],
  cards: DEFAULT_CARDS,
};

/** Clean a library from storage or the wire. Junk falls back to defaults field by field. */
export function normalizeCardLibrary(raw: unknown): CardLibrary {
  if (!raw || typeof raw !== "object") return DEFAULT_LIBRARY;
  const l = raw as Partial<CardLibrary>;
  const seconds = Number(l.seconds);
  // 384,694 was the first default, saved before the camera's real spot was
  // known; follow the new default rather than strand the card there
  const oldDefault = l.x === 384 && l.y === 694;
  const x = oldDefault ? DEFAULT_LIBRARY.x : Number(l.x);
  const y = oldDefault ? DEFAULT_LIBRARY.y : Number(l.y);
  const cards: SupportCard[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(l.cards) ? l.cards : []) {
    const card = asCard(item);
    if (!card) continue;
    if (seen.has(card.id)) card.id = newCardId();
    seen.add(card.id);
    cards.push(card);
    if (cards.length >= CARD_LIMITS.cards) break;
  }
  return {
    v: 1,
    on: l.on !== false,
    paused: l.paused === true,
    seconds: Number.isFinite(seconds)
      ? Math.max(CARD_SECONDS.min, Math.min(CARD_SECONDS.max, Math.round(seconds)))
      : CARD_SECONDS.fallback,
    x: Number.isFinite(x) ? Math.max(0, Math.min(STAGE_W - CARD_W, Math.round(x))) : DEFAULT_LIBRARY.x,
    y: Number.isFinite(y) ? Math.max(0, Math.min(STAGE_H - CARD_H, Math.round(y))) : DEFAULT_LIBRARY.y,
    cards: Array.isArray(l.cards) ? cards : DEFAULT_CARDS,
  };
}

export function loadCardLibrary(): CardLibrary {
  return normalizeCardLibrary(readJSON<CardLibrary>(CARDS_KEY));
}

export function persistCardLibrary(lib: CardLibrary): boolean {
  return writeJSON(CARDS_KEY, normalizeCardLibrary(lib));
}

/** Split `**bold**` into runs. The only markup a card body has, and it never becomes HTML. */
export function bodyRuns(body: string): Array<{ text: string; bold: boolean }> {
  return body
    .split("**")
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((r) => r.text);
}

/** Every uploaded image a library still points at — anything else in IndexedDB is garbage. */
export function uploadIds(lib: CardLibrary): Set<string> {
  const ids = new Set<string>();
  for (const c of lib.cards) for (const im of c.images) if (im.src.startsWith("up:")) ids.add(im.src.slice(3));
  return ids;
}

/** Public URL of a shipped library image. */
export function libUrl(name: string): string {
  const art = LIBRARY_ART.find((a) => a.name === name);
  return art ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cards/${art.file}` : "";
}
