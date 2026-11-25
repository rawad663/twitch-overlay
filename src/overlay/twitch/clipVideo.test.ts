import { describe, expect, it } from "vitest";
import { clipVideoUrl } from "./clipVideo";

const res = (qualities: Array<{ quality: string; sourceURL: string }>, token = { signature: "s1g", value: '{"a":1}' }) => ({
  data: { clip: { playbackAccessToken: token, videoQualities: qualities } },
});

describe("clipVideoUrl", () => {
  it("picks the smallest rendition at or above 720p and signs it", () => {
    const url = clipVideoUrl(
      res([
        { quality: "1440", sourceURL: "https://cdn/1440.mp4" },
        { quality: "1080", sourceURL: "https://cdn/1080.mp4" },
        { quality: "720", sourceURL: "https://cdn/720.mp4" },
        { quality: "360", sourceURL: "https://cdn/360.mp4" },
      ]),
    );
    expect(url).toBe("https://cdn/720.mp4?sig=s1g&token=%7B%22a%22%3A1%7D");
  });

  it("falls back to the biggest when nothing reaches 720p", () => {
    const url = clipVideoUrl(
      res([
        { quality: "360", sourceURL: "https://cdn/360.mp4" },
        { quality: "480", sourceURL: "https://cdn/480.mp4" },
      ]),
    );
    expect(url?.startsWith("https://cdn/480.mp4?")).toBe(true);
  });

  it("returns null for a missing clip, token or rendition", () => {
    expect(clipVideoUrl(null)).toBeNull();
    expect(clipVideoUrl({ data: { clip: null } })).toBeNull();
    expect(clipVideoUrl(res([]))).toBeNull();
    expect(clipVideoUrl(res([{ quality: "720", sourceURL: "https://cdn/720.mp4" }], { signature: "", value: "" }))).toBeNull();
  });
});
