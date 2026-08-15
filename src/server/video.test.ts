import { describe, expect, it } from "vitest";
import { createAudioSegmentMetadata, parseShowinfoTimes, runCommand } from "./video.js";

describe("command runner", () => {
  it("returns stdout from a successful process", async () => {
    const result = await runCommand(process.execPath, ["-e", "process.stdout.write('ready')"]);
    expect(result.stdout).toBe("ready");
  });

  it("surfaces a useful failure message", async () => {
    await expect(runCommand(process.execPath, ["-e", "process.stderr.write('broken'); process.exit(2)"])).rejects.toThrow("broken");
  });

  it("aborts a running process when the signal fires", async () => {
    const controller = new AbortController();
    const run = runCommand(process.execPath, ["-e", "setTimeout(() => process.exit(0), 30_000)"], controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  }, 10_000);
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

describe("parseShowinfoTimes", () => {
  it("extracts pts_time from showinfo lines in order", () => {
    const stderr = [
      "[Parsed_showinfo_1 @ 0x0] config in time_base: 1/10240",
      "[Parsed_showinfo_1 @ 0x0] n:   0 pts: 2048 pts_time:0.2       duration:0.1",
      "[Parsed_showinfo_1 @ 0x0] n:   1 pts: 4096 pts_time:0.4       duration:0.1",
      "[Parsed_showinfo_1 @ 0x0] n:   2 pts: 6144 pts_time:0.6       duration:0.1"
    ].join("\n");
    expect(parseShowinfoTimes(stderr)).toEqual([0.2, 0.4, 0.6]);
  });

  it("ignores non-showinfo log lines", () => {
    const stderr = [
      "[info] frame=  100 fps= 30 q=28.0 size= 100kB time=00:00:03.33",
      "[Parsed_showinfo_1 @ 0x0] n:   0 pts: 1024 pts_time:0.1       duration:0.1"
    ].join("\n");
    expect(parseShowinfoTimes(stderr)).toEqual([0.1]);
  });

  it("returns an empty array when there are no showinfo lines", () => {
    expect(parseShowinfoTimes("")).toEqual([]);
    expect(parseShowinfoTimes("nothing here")).toEqual([]);
  });
});
