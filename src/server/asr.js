import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import OSS from "ali-oss";
import { config } from "./config.js";

export async function transcribe({ audioPath, durationMs }) {
  if (config.asrProvider === "mock") return mockTranscript(durationMs);
  if (config.asrProvider !== "dashscope") throw new Error(`未知的 ASR_PROVIDER：${config.asrProvider}`);
  return transcribeWithDashScope(audioPath);
}

function mockTranscript(durationMs) {
  const duration = Math.max(1, durationMs || 30000);
  const snippets = [
    "这是一段临时演示听写，真实配置后会替换成视频里的声音。",
    "帧间把说话的内容和画面放回同一条时间线上。",
    "你可以从几个关键瞬间开始回看，而不必重新看完整段视频。"
  ];
  return snippets.map((text, index) => {
    const startMs = Math.round((duration / snippets.length) * index);
    const endMs = Math.min(duration, Math.max(startMs, Math.round((duration / snippets.length) * (index + 1) - 300)));
    return { startMs, endMs, text };
  });
}

async function transcribeWithDashScope(audioPath) {
  const client = new OSS({
    region: config.ossRegion,
    bucket: config.ossBucket,
    accessKeyId: config.ossAccessKeyId,
    accessKeySecret: config.ossAccessKeySecret,
    secure: true
  });
  const key = `${config.ossPrefix}/${randomUUID()}.wav`;
  await client.put(key, createReadStream(audioPath));
  try {
    const audioUrl = client.signatureUrl(key, { expires: 600 });
    const baseUrl = config.dashscopeWorkspaceId ? `https://${config.dashscopeWorkspaceId}.cn-beijing.maas.aliyuncs.com` : "https://dashscope.aliyuncs.com";
    const task = await requestJson(`${baseUrl}/api/v1/services/audio/asr/transcription`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.dashscopeApiKey}`, "content-type": "application/json", "X-DashScope-Async": "enable" },
      body: JSON.stringify({ model: config.dashscopeModel, input: { file_urls: [audioUrl] }, parameters: { channel_id: [0], language_hints: ["zh", "en"], timestamp_alignment_enabled: true } })
    });
    const taskId = task.output?.task_id;
    if (!taskId) throw new Error("Paraformer 没有返回任务编号。");
    const deadline = Date.now() + config.dashscopeTimeoutMs;
    while (Date.now() < deadline) {
      await wait(config.dashscopePollIntervalMs);
      const status = await requestJson(`${baseUrl}/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${config.dashscopeApiKey}` } });
      const output = status.output || {};
      if (output.task_status === "SUCCEEDED") {
        const result = output.results?.find((item) => item.subtask_status === "SUCCEEDED");
        if (!result?.transcription_url) throw new Error("Paraformer 完成了，但没有找到听写结果。");
        return normalizeTranscript(await requestJson(result.transcription_url));
      }
      if (["FAILED", "CANCELED"].includes(output.task_status)) throw new Error(output.message || "Paraformer 处理失败。");
    }
    throw new Error("Paraformer 等待超时，请稍后重试。");
  } finally {
    await client.delete(key).catch(() => undefined);
  }
}

function normalizeTranscript(payload) {
  const sentences = payload.transcripts?.flatMap((transcript) => transcript.sentences || []) || [];
  if (sentences.length) return sentences.map((sentence) => ({ startMs: sentence.begin_time || 0, endMs: sentence.end_time || sentence.begin_time || 0, text: sentence.text || "" })).filter((item) => item.text);
  const text = payload.transcripts?.map((item) => item.text || "").filter(Boolean).join(" ") || "没有识别到清晰的人声。";
  return [{ startMs: 0, endMs: 0, text }];
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.code || `请求失败：${response.status}`);
  return body;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
