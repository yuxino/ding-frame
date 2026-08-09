import { describe, expect, it } from "vitest";
import { createAudioSegmentMetadata, runCommand } from "./video.js";

describe("command runner", () => {
  it("returns stdout from a successful process", async () => {
    const result = await runCommand(process.execPath, ["-e", "process.stdout.write('ready')"]);
    expect(result.stdout).toBe("ready");
  });

  it("surfaces a useful failure message", async () => {
    await expect(runCommand(process.execPath, ["-e", "process.stderr.write('broken'); process.exit(2)"])).rejects.toThrow("broken");
  });
});

describe("audio segment timeline", () => {
  it("caps the last segment at the video duration", () => {
    expect(createAudioSegmentMetadata(
      ["segment-000.mp3", "segment-001.mp3", "segment-002.mp3"],
      125000,
      60
    )).toEqual([
      { filename: "segment-000.mp3", startMs: 0, endMs: 60000 },
      { filename: "segment-001.mp3", startMs: 60000, endMs: 120000 },
      { filename: "segment-002.mp3", startMs: 120000, endMs: 125000 }
    ]);
  });
});
