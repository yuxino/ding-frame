import { describe, expect, it } from "vitest";
import { groupTranscriptByMinute } from "./transcript.js";

describe("minute transcript timeline", () => {
  it("merges dense ASR lines into one subtitle block per minute", () => {
    const result = groupTranscriptByMinute([
      { startMs: 1_000, endMs: 12_000, text: "第一句。" },
      { startMs: 34_000, endMs: 52_000, text: "第二句。" },
      { startMs: 61_000, endMs: 84_000, text: "第三句。" }
    ], 84_000);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      minute: 0,
      startMs: 0,
      endMs: 60_000,
      text: "第一句。 第二句。",
      speakerLabel: "人声"
    });
    expect(result[1]).toMatchObject({
      minute: 1,
      startMs: 60_000,
      endMs: 84_000,
      text: "第三句。"
    });
  });

  it("uses real speaker ids when a diarization provider supplies them", () => {
    const [group] = groupTranscriptByMinute([
      { startMs: 0, endMs: 4_000, text: "你好。", speaker: 0 },
      { startMs: 6_000, endMs: 9_000, text: "你好。", speaker: 1 }
    ], 10_000);

    expect(group.speakerLabel).toBe("2 位说话人");
  });

  it("keeps a cue that crosses the boundary inside its minute ruler", () => {
    const [group] = groupTranscriptByMinute([
      { startMs: 41_000, endMs: 83_000, text: "跨分钟的一句。" }
    ], 125_000);

    expect(group).toMatchObject({ startMs: 0, endMs: 60_000 });
  });
});
