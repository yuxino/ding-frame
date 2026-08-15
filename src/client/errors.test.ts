import { describe, expect, it } from "vitest";
import { translateServerError } from "./errors.js";

describe("translateServerError", () => {
  it("passes Chinese messages through unchanged in Chinese mode", () => {
    expect(translateServerError("视频太大了，第一版最多支持 500 MB。", "zh")).toBe("视频太大了，第一版最多支持 500 MB。");
  });

  it("maps known server errors to English", () => {
    expect(translateServerError("视频太大了，第一版最多支持 500 MB。", "en")).toBe("Video is too large. Reduce the file size or pick a shorter video.");
    expect(translateServerError("这个文件里没有视频画面，请换一个带画面的视频。", "en")).toBe("This file has no video track. Please choose a video with visuals.");
    expect(translateServerError("这次分析已经消失了。", "en")).toBe("This analysis is no longer available.");
  });

  it("falls back to a generic English message for unknown errors", () => {
    expect(translateServerError("某种未收录的错误", "en")).toBe("Something went wrong. Please try again.");
  });

  it("returns an empty string for empty input", () => {
    expect(translateServerError("", "en")).toBe("");
    expect(translateServerError(undefined, "en")).toBe("");
    expect(translateServerError(null, "en")).toBe("");
  });
});
