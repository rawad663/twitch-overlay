import { describe, expect, it } from "vitest";
import { parse, untag } from "./parse";

describe("untag", () => {
  it("unescapes IRCv3 tag values", () => {
    expect(untag("hello\\sworld")).toBe("hello world");
    expect(untag("a\\:b")).toBe("a;b");
    expect(untag("back\\\\slash")).toBe("back\\slash");
  });
});

describe("parse", () => {
  it("reads a plain chat message", () => {
    const m = parse(
      "@badges=;display-name=ExileWick;mod=0 :exilewick!exilewick@exilewick.tmi.twitch.tv PRIVMSG #rawad663 :hello there",
    );
    expect(m).toMatchObject({
      kind: "chat",
      login: "exilewick",
      user: "ExileWick",
      msg: "hello there",
      mod: false,
      bits: 0,
    });
  });

  it("treats a broadcaster badge as mod", () => {
    const m = parse(
      "@badges=broadcaster/1;display-name=Rawad;mod=0 :rawad663!r@r.tmi.twitch.tv PRIVMSG #rawad663 :!afk",
    );
    expect(m).toMatchObject({ mod: true });
  });

  it("treats mod=1 as mod even with no badges", () => {
    const m = parse(
      "@badges=;display-name=Helper;mod=1 :helper!h@h.tmi.twitch.tv PRIVMSG #rawad663 :!maps",
    );
    expect(m).toMatchObject({ mod: true });
  });

  it("reads bits", () => {
    const m = parse(
      "@bits=250;display-name=Wick;mod=0 :wick!w@w.tmi.twitch.tv PRIVMSG #rawad663 :cheer250 nice",
    );
    expect(m).toMatchObject({ kind: "chat", bits: 250 });
  });

  it("falls back to the login when there is no display-name", () => {
    const m = parse("@display-name= :wick!w@w.tmi.twitch.tv PRIVMSG #rawad663 :hi");
    expect(m).toMatchObject({ user: "wick" });
  });

  it("reads a USERNOTICE with no trailing body", () => {
    const m = parse(
      "@msg-id=submysterygift;display-name=Gifter;msg-param-mass-gift-count=20 :tmi.twitch.tv USERNOTICE #rawad663",
    );
    expect(m).toMatchObject({ kind: "notice", id: "submysterygift", user: "Gifter" });
  });

  it("ignores anything that is not chat or a usernotice", () => {
    expect(parse(":tmi.twitch.tv 001 justinfan123 :Welcome")).toBeNull();
    expect(parse("PING :tmi.twitch.tv")).toBeNull();
  });
});
