import { describe, expect, it } from "vitest";
import { localAnalysis, normalizeVisionModelResult, selectRepresentativeFrames } from "./analysis.js";

describe("local analysis", () => {
  it("keeps transcript and frames aligned in a readable result", async () => {
    const result = localAnalysis({
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

  it("keeps a zero-configuration fallback available", () => {
    const result = localAnalysis({
      title: "无声视频",
      durationMs: 1000,
      frames: [],
      transcript: []
    });
    expect(result.summary).toContain("声音与画面");
    expect(result.frames).toEqual([]);
  });
});

describe("vision model result", () => {
  it("samples frames across the whole video while preserving original indexes", () => {
    const frames = Array.from({ length: 12 }, (_, index) => ({ filename: `frame-${index + 1}.jpg`, atMs: index * 6000 }));
    expect(selectRepresentativeFrames(frames, 6).map(({ index, frame }) => [index, frame.atMs])).toEqual([
      [0, 0], [2, 12000], [4, 24000], [7, 42000], [9, 54000], [11, 66000]
    ]);
  });

  it("accepts fenced JSON and normalizes title, highlights, tags, and frame captions", () => {
    const result = normalizeVisionModelResult({
      raw: `\`\`\`json
        {"title":"雪豹","summary":"丁真在自然场景中讲述雪豹。","tags":[{"label":"雪豹","category":"主体","atMs":"9000"},{"label":"雪豹","category":"主题","atMs":0},{"label":"户外","category":"场景","atMs":-2}],"highlights":[{"atMs":"9000","title":"雪豹出现","detail":"画面和人声在这里交汇。"}],"frameCaptions":[{"index":0,"caption":"山野中的人物"}],"hasSubtitles":true}
      \`\`\``,
      fallbackTitle: "input.mp4",
      durationMs: 8000,
      frames: [{ filename: "frame-001.jpg", atMs: 0 }],
      transcript: [{ startMs: 0, endMs: 8000, text: "雪豹" }]
    });

    expect(result.title).toBe("雪豹");
    expect(result.summary).toContain("丁真");
    expect(result.highlights[0].atMs).toBe(8000);
    expect(result.tags).toEqual([
      { label: "雪豹", category: "主体", atMs: 8000 },
      { label: "户外", category: "场景", atMs: 0 }
    ]);
    expect(result.frames[0].caption).toBe("山野中的人物");
    expect(result.hasSubtitles).toBe(true);
  });

  it("rejects a successful response that contains no JSON object", () => {
    expect(() => normalizeVisionModelResult({
      raw: "我看完了，但没有按格式返回。",
      fallbackTitle: "测试视频",
      durationMs: 1000,
      frames: [],
      transcript: []
    })).toThrow("有效 JSON");
  });
});
