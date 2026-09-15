import { describe, expect, it } from "vitest";
import { CLIP_LIBRARY_CAP, normalizeClips, parseClipSlug } from "./library";

describe("parseClipSlug", () => {
  const slug = "HelpfulEntertainingOrcaPogChamp";

  it("reads clips.twitch.tv/<slug>", () => {
    expect(parseClipSlug(`https://clips.twitch.tv/${slug}`)).toBe(slug);
    expect(parseClipSlug(`clips.twitch.tv/${slug}`)).toBe(slug);
  });

  it("reads the embed URL's clip query", () => {
    expect(parseClipSlug(`https://clips.twitch.tv/embed?clip=${slug}&parent=localhost`)).toBe(slug);
  });

  it("reads twitch.tv/<chan>/clip/<slug> with query junk", () => {
    expect(parseClipSlug(`https://www.twitch.tv/rawad663/clip/${slug}?filter=clips&range=7d`)).toBe(
      slug,
    );
  });

  it("reads m.twitch.tv/clip/<slug>", () => {
    expect(parseClipSlug(`https://m.twitch.tv/clip/${slug}`)).toBe(slug);
  });

  it("accepts a bare slug", () => {
    expect(parseClipSlug(slug)).toBe(slug);
    expect(parseClipSlug("AwkwardHelplessKangarooSwiftrage")).toBe(
      "AwkwardHelplessKangarooSwiftrage",
    );
  });

  it("accepts hyphens in a slug", () => {
    expect(parseClipSlug("This-is-a-clip")).toBe("This-is-a-clip");
  });

  it("rejects junk", () => {
    expect(parseClipSlug("")).toBeNull();
    expect(parseClipSlug("https://example.com/clip/nope")).toBeNull();
    expect(parseClipSlug("not a slug!!")).toBeNull();
    expect(parseClipSlug("https://twitch.tv/rawad663")).toBeNull();
  });
});

describe("normalizeClips", () => {
  it("de-duplicates by slug and drops junk", () => {
    const out = normalizeClips([
      { slug: "Aaa", title: "First", enabled: true, duration: 12, addedAt: 1 },
      { slug: "Aaa", title: "Dup" },
      { slug: "!!!", title: "bad" },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.slug).toBe("Aaa");
    expect(out[0]?.title).toBe("First");
    expect(out[0]?.duration).toBe(12);
  });

  it("reads the persisted { v, clips } envelope", () => {
    const out = normalizeClips({
      v: 1,
      clips: [{ slug: "One", title: "Hi", enabled: false, duration: 8, addedAt: 2 }],
    });
    expect(out).toEqual([
      expect.objectContaining({ slug: "One", title: "Hi", enabled: false, duration: 8 }),
    ]);
  });

  it("caps the library", () => {
    const raw = Array.from({ length: CLIP_LIBRARY_CAP + 10 }, (_, i) => ({
      slug: `Clip${i}`,
      title: `Clip ${i}`,
    }));
    expect(normalizeClips(raw)).toHaveLength(CLIP_LIBRARY_CAP);
  });

  it("falls back to an empty list for junk", () => {
    expect(normalizeClips(null)).toEqual([]);
    expect(normalizeClips("nope")).toEqual([]);
  });
});
