export type ChatMessage = {
  kind: "chat";
  bits: number;
  login: string;
  user: string;
  msg: string;
  mod: boolean;
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
  return {
    kind: "chat",
    bits: parseInt(tags["bits"] ?? "", 10) || 0,
    login: m[1]!,
    user: tags["display-name"] || m[1]!,
    msg: m[2]!.replace(/[\r\n]/g, "").trim(),
    mod: tags["mod"] === "1" || /broadcaster|moderator/.test(badges),
  };
}
