import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requestTranscriptSegment } from "./asr.js";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Qwen3 ASR Base64 adapter", () => {
  it("sends an MP3 data URI and keeps the segment timeline", async () => {
    const dir = await mkdtemp(join(os.tmpdir(), "ding-frame-asr-test-"));
    tempDirs.push(dir);
    const path = join(dir, "segment-000.mp3");
    await writeFile(path, Buffer.from([0x49, 0x44, 0x33, 0x04]));
    let captured;

    const transcript = await requestTranscriptSegment({
      segment: { path, startMs: 0, endMs: 60000 },
      apiKey: "test-key",
      baseUrl: "https://example.com/compatible-mode/v1/",
      model: "qwen3-asr-flash",
      fetchImpl: async (url, options) => {
        captured = { url, options, body: JSON.parse(options.body) };
        return new Response(JSON.stringify({
          choices: [{ message: { content: "  这里是雪豹。 " } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });

    expect(captured.url).toBe("https://example.com/compatible-mode/v1/chat/completions");
    expect(captured.options.headers.Authorization).toBe("Bearer test-key");
    expect(captured.body.model).toBe("qwen3-asr-flash");
    expect(captured.body.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/mpeg;base64,/);
    expect(captured.body.asr_options.enable_itn).toBe(true);
    expect(transcript).toEqual({ startMs: 0, endMs: 60000, text: "这里是雪豹。" });
  });

  it("surfaces the provider error without leaking the API key", async () => {
    const dir = await mkdtemp(join(os.tmpdir(), "ding-frame-asr-test-"));
    tempDirs.push(dir);
    const path = join(dir, "segment-000.mp3");
    await writeFile(path, "audio");

    await expect(requestTranscriptSegment({
      segment: { path, startMs: 0, endMs: 1000 },
      apiKey: "secret-key",
      baseUrl: "https://example.com/v1",
      model: "qwen3-asr-flash",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "免费额度已用完" } }), {
        status: 429,
        headers: { "content-type": "application/json" }
      })
    })).rejects.toThrow("免费额度已用完");
  });
});
