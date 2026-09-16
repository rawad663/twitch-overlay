import { CONFIG } from "@/config/config";

export type BalloonGlyph =
  | { kind: "emoji"; text: string }
  | { kind: "emote"; id: string };

export type EmoteSpan = { id: string; start: number; end: number };

export type EmojiHit = { text: string; start: number; end: number };

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const KEYCAP = /\u20E3/;
const FLAG = /^\p{Regional_Indicator}{2}$/u;

/**
 * Twitch `emotes` tag: inclusive UTF-16 indexes into the raw PRIVMSG body
 * (`id:start-end,start-end/id:start-end`). JS strings are UTF-16, so these
 * line up with `String.prototype.slice` — a surrogate-pair emoji occupies
 * two indexes (🔥 is start:end of n:n+1).
 */
export function parseEmotesTag(tag: string): EmoteSpan[] {
  if (!tag) return [];
  const spans: EmoteSpan[] = [];
  for (const part of tag.split("/")) {
    const colon = part.indexOf(":");
    if (colon < 1) continue;
    const id = part.slice(0, colon);
    for (const range of part.slice(colon + 1).split(",")) {
      const dash = range.indexOf("-");
      if (dash < 0) continue;
      const start = Number(range.slice(0, dash));
      const end = Number(range.slice(dash + 1));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
      spans.push({ id, start, end });
    }
  }
  return spans;
}

function isEmojiGrapheme(g: string): boolean {
  return KEYCAP.test(g) || PICTOGRAPHIC.test(g) || FLAG.test(g);
}

/**
 * Walk graphemes so ZWJ families, flags, and skin tones stay one balloon.
 * Indexes are UTF-16 (inclusive), matching Twitch's emote tag.
 */
export function unicodeEmojis(text: string): EmojiHit[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const out: EmojiHit[] = [];
    let utf16 = 0;
    for (const { segment } of seg.segment(text)) {
      const start = utf16;
      utf16 += segment.length;
      if (isEmojiGrapheme(segment)) {
        out.push({ text: segment, start, end: utf16 - 1 });
      }
    }
    return out;
  }
  return unicodeEmojisFallback(text);
}

/** When `Intl.Segmenter` is missing (older CEF), approximate grapheme splits. */
function unicodeEmojisFallback(text: string): EmojiHit[] {
  const re =
    /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji})(?:\uFE0F|\p{Emoji_Modifier})?)*|[\d#*]\uFE0F?\u20E3)/gu;
  const out: EmojiHit[] = [];
  for (const m of text.matchAll(re)) {
    const g = m[0];
    const start = m.index ?? 0;
    if (!isEmojiGrapheme(g)) continue;
    out.push({ text: g, start, end: start + g.length - 1 });
  }
  return out;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start <= b.end && a.end >= b.start;
}

/**
 * Twitch emotes first (from the tag), then unicode emoji whose range does
 * not sit inside an emote span — otherwise Kappa-as-text would double-count.
 * `body` must be the untrimmed PRIVMSG: trim() would shift UTF-16 indexes.
 */
export function extractBalloons(
  body: string,
  emotesTag = "",
  cap = CONFIG.balloonPerMessage,
): BalloonGlyph[] {
  const out: BalloonGlyph[] = [];
  const spans = parseEmotesTag(emotesTag);
  for (const s of spans) {
    if (out.length >= cap) return out;
    out.push({ kind: "emote", id: s.id });
  }
  for (const e of unicodeEmojis(body)) {
    if (out.length >= cap) break;
    if (spans.some((s) => overlaps(e, s))) continue;
    out.push({ kind: "emoji", text: e.text });
  }
  return out;
}

/**
 * Twemoji 72×72 filenames are hex codepoints joined by `-`, without VS16
 * (U+FE0F): 🔥 → 1f525, ❤️ → 2764.
 */
export function twemojiName(emoji: string): string {
  const parts: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f) continue;
    parts.push(cp.toString(16));
  }
  return parts.join("-");
}
