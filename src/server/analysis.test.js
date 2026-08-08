import { describe, expect, it } from "vitest";
import { config } from "./config.js";
import { analyze } from "./analysis.js";

describe("local analysis", () => {
  it("keeps transcript and frames aligned in a readable result", async () => {
    const result = await analyze({
      title: "测试视频",
      durationMs: 18000,
      frames: [{ filename: "frame-001.jpg", atMs: 0 }],
      transcript: [{ startMs: 0, endMs: 5000, text: "这是第一段。" }],
      framesDir: "/tmp/unused"
    });
    expect(result.title).toBe("测试视频");
    expect(result.transcript[0].text).toBe("这是第一段。");
    expect(result.frames[0].caption).toContain("第一个画面");
    expect(result.highlights[0].atMs).toBe(0);
  });

  it("defaults to the mock provider when no model is configured", () => {
    expect(config.asrProvider).toBe("mock");
    expect(config.analysisProvider).toBe("mock");
  });
});
