import { describe, expect, it } from "vitest";
import { fallbackChapters, localAnalysis, normalizeChapters, normalizeVisionModelResult, selectRepresentativeFrames } from "./analysis.js";

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
    // 章节覆盖整个视频：第一段从 0 开始，末段到视频末尾
    expect(result.chapters[0].startMs).toBe(0);
    expect(result.chapters[result.chapters.length - 1].endMs).toBe(18000);
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
    expect(result.chapters.length).toBeGreaterThanOrEqual(3);
  });

  it("outputs English copy when the analysis language is English", () => {
    const result = localAnalysis({
      title: "sample.mp4",
      durationMs: 18000,
      frames: [{ filename: "frame-001.jpg", atMs: 0 }],
      transcript: [{ startMs: 0, endMs: 5000, text: "hello" }],
      language: "en"
    });
    expect(result.summary).toContain("This video's story");
    expect(result.frames[0].caption).toContain("first shot");
    expect(result.tags[0].label).toBe("Short video");
    expect(result.chapters[0].title).toContain("Opening");
    expect(result.title).toBe("sample.mp4");
  });
});

describe("vision model result", () => {
  it("samples frames across the whole video while preserving original indexes", () => {
    const frames = Array.from({ length: 12 }, (_, index) => ({ filename: `frame-${index + 1}.jpg`, atMs: index * 6000 }));
    expect(selectRepresentativeFrames(frames, 6).map(({ index, frame }) => [index, frame.atMs])).toEqual([
      [0, 0], [2, 12000], [4, 24000], [7, 42000], [9, 54000], [11, 66000]
    ]);
  });

  it("accepts fenced JSON and normalizes title, chapters, tags, and frame captions", () => {
    const result = normalizeVisionModelResult({
      raw: `\`\`\`json
        {"title":"雪豹","summary":"丁真在自然场景中讲述雪豹。","tags":[{"label":"雪豹","category":"主体","atMs":"9000"},{"label":"雪豹","category":"主题","atMs":0},{"label":"户外","category":"场景","atMs":-2}],"chapters":[{"startMs":0,"endMs":4000,"title":"开场","summary":"开场讲述了雪豹的栖息环境。"},{"startMs":4000,"endMs":8000,"title":"正片","summary":"丁真在自然场景中讲述雪豹的故事。"}],"frameCaptions":[{"index":0,"caption":"山野中的人物"}],"hasSubtitles":true}
      \`\`\``,
      fallbackTitle: "input.mp4",
      durationMs: 8000,
      frames: [{ filename: "frame-001.jpg", atMs: 0 }],
      transcript: [{ startMs: 0, endMs: 8000, text: "雪豹" }]
    });

    expect(result.title).toBe("雪豹");
    expect(result.summary).toContain("丁真");
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]).toMatchObject({ startMs: 0, endMs: 4000, title: "开场" });
    expect(result.chapters[1].summary).toContain("丁真");
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

  it("uses English fallback copy when the analysis language is English", () => {
    const result = normalizeVisionModelResult({
      raw: `{"title":"","chapters":[],"tags":[],"frameCaptions":[]}`,
      fallbackTitle: "input.mp4",
      durationMs: 8000,
      frames: [{ filename: "frame-001.jpg", atMs: 0 }],
      transcript: [{ startMs: 0, endMs: 8000, text: "hello" }],
      language: "en"
    });
    expect(result.summary).toBe("The vision model returned no summary.");
    expect(result.frames[0].caption).toBe("Visual slice 1");
    // 模型没返回章节时退回按听写切分的兜底章节
    expect(result.chapters.length).toBeGreaterThanOrEqual(1);
    expect(result.chapters[0].title).toContain("Opening");
  });
});

describe("fallback chapters", () => {
  it("splits the transcript into three time-ordered chapters that cover the whole video", () => {
    const chapters = fallbackChapters(
      [
        { startMs: 0, endMs: 3000, text: "开头内容" },
        { startMs: 4000, endMs: 8000, text: "中间内容" },
        { startMs: 9000, endMs: 12000, text: "结尾内容" }
      ],
      12000
    );
    expect(chapters).toHaveLength(3);
    expect(chapters[0].startMs).toBe(0);
    expect(chapters[2].endMs).toBe(12000);
    expect(chapters.map((chapter) => chapter.title)).toEqual(["开头", "主体内容", "结尾"]);
    expect(chapters[0].summary).toContain("开头内容");
  });

  it("produces usable chapters even without a transcript", () => {
    const chapters = fallbackChapters([], 60000, "en");
    expect(chapters).toHaveLength(3);
    expect(chapters[0].title).toBe("Opening");
    expect(chapters[2].summary.length).toBeGreaterThan(0);
  });
});

describe("normalize chapters", () => {
  it("clamps out-of-range times, sorts, and deduplicates", () => {
    const chapters = normalizeChapters(
      [
        { startMs: 6000, endMs: 60000, title: "乱序", summary: "a" },
        { startMs: 0, endMs: 3000, title: "开头", summary: "b" },
        { startMs: -100, endMs: 4000, title: "越界", summary: "c" },
        { startMs: 0, endMs: 3000, title: "重复", summary: "d" }
      ],
      8000,
      []
    );
    expect(chapters.map((chapter) => chapter.startMs)).toEqual([0, 0, 6000]);
    expect(chapters[1].endMs).toBe(4000); // -100 被 clamp 到 0
    expect(chapters[2].endMs).toBe(8000); // 60000 被 clamp 到视频时长
    expect(chapters.filter((chapter) => chapter.title === "重复")).toHaveLength(0);
  });

  it("falls back to transcript chapters when the model returns none", () => {
    const chapters = normalizeChapters([], 10000, [{ startMs: 0, endMs: 5000, text: "内容" }]);
    expect(chapters.length).toBeGreaterThanOrEqual(3);
  });
});
