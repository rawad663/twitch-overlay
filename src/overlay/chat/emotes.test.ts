import { describe, expect, it } from "vitest";
import {
  extractBalloons,
  parseEmotesTag,
  twemojiName,
  unicodeEmojis,
} from "./emotes";

describe("parseEmotesTag", () => {
  it("reads two spans that share an id", () => {
    expect(parseEmotesTag("25:0-4,12-16")).toEqual([
      { id: "25", start: 0, end: 4 },
      { id: "25", start: 12, end: 16 },
    ]);
  });

  it("reads two ids", () => {
    expect(parseEmotesTag("25:0-4/1902:6-10")).toEqual([
      { id: "25", start: 0, end: 4 },
      { id: "1902", start: 6, end: 10 },
    ]);
  });

  it("returns nothing for junk or empty tags", () => {
    expect(parseEmotesTag("")).toEqual([]);
    expect(parseEmotesTag("junk")).toEqual([]);
    expect(parseEmotesTag("::::")).toEqual([]);
  });
});

describe("unicodeEmojis", () => {
  it("finds fire at its UTF-16 indexes (surrogate pair)", () => {
    expect(unicodeEmojis("nice 🔥 drop")).toEqual([{ text: "🔥", start: 5, end: 6 }]);
  });

  it("keeps a ZWJ family as one grapheme", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(unicodeEmojis(family)).toHaveLength(1);
    expect(unicodeEmojis(family)[0]!.text).toBe(family);
  });

  it("keeps a flag as one grapheme", () => {
    expect(unicodeEmojis("🇨🇦")).toHaveLength(1);
    expect(unicodeEmojis("🇨🇦")[0]!.text).toBe("🇨🇦");
  });

  it("ignores letters", () => {
    expect(unicodeEmojis("hello world")).toEqual([]);
  });
});

describe("extractBalloons", () => {
  it("emits a unicode glyph", () => {
    expect(extractBalloons("gg 😂")).toEqual([{ kind: "emoji", text: "😂" }]);
  });

  it("emits Kappa and Keepo from the tag", () => {
    expect(extractBalloons("Kappa Keepo", "25:0-4/1902:6-10")).toEqual([
      { kind: "emote", id: "25" },
      { kind: "emote", id: "1902" },
    ]);
  });

  it("emits the emote then fire, without double-counting Kappa", () => {
    expect(extractBalloons("Kappa 🔥", "25:0-4")).toEqual([
      { kind: "emote", id: "25" },
      { kind: "emoji", text: "🔥" },
    ]);
  });

  it("caps a pile of fires", () => {
    expect(extractBalloons("🔥".repeat(20), "", 3)).toHaveLength(3);
  });

  it("uses raw UTF-16 indexes, so leading spaces still extract", () => {
    expect(extractBalloons(" Kappa", "25:2-6")).toEqual([{ kind: "emote", id: "25" }]);
  });
});

describe("twemojiName", () => {
  it("drops VS16 so filenames match Twemoji 72×72", () => {
    expect(twemojiName("🔥")).toBe("1f525");
    expect(twemojiName("❤️")).toBe("2764");
  });
});
