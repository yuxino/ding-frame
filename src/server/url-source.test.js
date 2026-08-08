import { describe, expect, it } from "vitest";
import { headersForVideoUrl, isDouyinHost } from "./url-source.js";

describe("video URL source headers", () => {
  it("adds browser headers required by Douyin CDN redirects", () => {
    const headers = headersForVideoUrl("https://www.douyin.com/aweme/v1/play/?video_id=test");
    expect(headers.referer).toBe("https://www.douyin.com/");
    expect(headers.origin).toBe("https://www.douyin.com");
    expect(headers.accept).toContain("video/mp4");
  });

  it("does not send a Douyin referrer to unrelated video hosts", () => {
    const headers = headersForVideoUrl("https://cdn.example.com/video.mp4");
    expect(headers.referer).toBeUndefined();
    expect(isDouyinHost("cdn.example.com")).toBe(false);
  });
});
