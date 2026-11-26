import { CONFIG } from "@/config/config";
import { extractBalloons, type BalloonGlyph } from "./emotes";

export type ChatMessage = {
  kind: "chat";
  /** Twitch's message id — identical in every source, so it keys cross-source claims and threaded replies */
  id: string;
  bits: number;
  login: string;
  user: string;
  msg: string;
  mod: boolean;
  glyphs: BalloonGlyph[];
};

export type NoticeMessage = {
  kind: "notice";
  id: string;
  user: string;
  tags: Record<string, string>;
};

export type ParsedMessage = ChatMessage | NoticeMessage;

/** IRCv3 tag values escape a few characters; undo that. */
const UNTAG: Record<string, string> = { s: " ", ":": ";", r: "\r", n: "\n", "\\": "\\" };

export function untag(v: string): string {
  return String(v).replace(/\\(.)/g, (_, c: string) => UNTAG[c] ?? c);
}

/* Chatterino / 7TV append U+E0000 (some clients a zero-width char) so a
   repeated line slips past Twitch's duplicate filter. Left in, a second
   `!lab` stopped matching. Only the command text is cleaned; emote offsets
   still index the raw body. */
const INVISIBLE = /[\u{E0000}͏​-‍⁠﻿]/gu;

export function parse(raw: string): ParsedMessage | null {
  const tags: Record<string, string> = {};
  let rest = raw;

  if (rest[0] === "@") {
    const sp = rest.indexOf(" ");
    for (const kv of rest.slice(1, sp).split(";")) {
      const i = kv.indexOf("=");
      tags[kv.slice(0, i)] = untag(kv.slice(i + 1));
    }
    rest = rest.slice(sp + 1);
  }

  // USERNOTICE comes from tmi.twitch.tv and often carries no trailing body
  if (/^:tmi\.twitch\.tv USERNOTICE #/.test(rest)) {
    return {
      kind: "notice",
      id: tags["msg-id"] ?? "",
      user: tags["display-name"] || tags["login"] || "someone",
      tags,
    };
  }

  const m = rest.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :([\s\S]*)$/);
  if (!m) return null;

  const badges = tags["badges"] ?? "";
  // Twitch emote indexes are UTF-16 offsets into this untrimmed body.
  const body = m[2]!.replace(/[\u0001\r\n]/g, "");
  return {
    kind: "chat",
    id: tags["id"] ?? "",
    bits: parseInt(tags["bits"] ?? "", 10) || 0,
    login: m[1]!,
    user: tags["display-name"] || m[1]!,
    msg: body.replace(INVISIBLE, "").trim(),
    mod: tags["mod"] === "1" || /broadcaster|moderator/.test(badges),
    glyphs: extractBalloons(body, tags["emotes"] ?? "", CONFIG.balloonPerMessage),
  };
}
