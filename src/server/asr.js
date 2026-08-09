import { readFile } from "node:fs/promises";
import { config } from "./config.js";

export async function transcribe({ audioSegments, durationMs }) {
  if (config.asrProvider === "mock") return mockTranscript(durationMs);
  if (config.asrProvider !== "dashscope") throw new Error(`未知的 ASR_PROVIDER：${config.asrProvider}`);
  if (!config.dashscopeApiKey) throw new Error("配置 DASHSCOPE_API_KEY 后才能使用真实听写。");

  const transcript = [];
  for (const segment of audioSegments || []) {
    const line = await requestTranscriptSegment({
      segment,
      apiKey: config.dashscopeApiKey,
      baseUrl: config.dashscopeBaseUrl,
      model: config.dashscopeModel,
      maxBytes: config.asrMaxSegmentBytes,
      timeoutMs: config.dashscopeTimeoutMs
    });
    if (line) transcript.push(line);
  }
  return transcript;
}

function mockTranscript(durationMs) {
  const duration = Math.max(1, durationMs || 30000);
  const snippets = [
    "这是一段临时演示听写，真实配置后会替换成视频里的声音。",
    "盯帧把说话的内容和画面放回同一条时间线上。",
    "你可以从几个关键瞬间开始回看，而不必重新看完整段视频。"
  ];
  return snippets.map((text, index) => {
    const startMs = Math.round((duration / snippets.length) * index);
    const endMs = Math.min(duration, Math.max(startMs, Math.round((duration / snippets.length) * (index + 1) - 300)));
    return { startMs, endMs, text };
  });
}

export async function requestTranscriptSegment({
  segment,
  apiKey,
  baseUrl,
  model,
  maxBytes = 8 * 1024 * 1024,
  timeoutMs = 120000,
  fetchImpl = fetch
}) {
  const audio = await readFile(segment.path);
  if (audio.byteLength > maxBytes) {
    throw new Error(`音频切片超过 ${Math.round(maxBytes / 1024 / 1024)} MB，请缩短 ASR_SEGMENT_SECONDS。`);
  }

  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [{
          type: "input_audio",
          input_audio: { data: `data:audio/mpeg;base64,${audio.toString("base64")}` }
        }]
      }],
      stream: false,
      asr_options: { enable_itn: true }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || body.code || `听写模型请求失败：${response.status}`);
  }

  const content = body.choices?.[0]?.message?.content;
  const text = compactTranscriptText(typeof content === "string"
    ? content
    : content?.map((item) => item?.text || "").join(" ") || "");
  if (!text) return null;
  return { startMs: segment.startMs, endMs: segment.endMs, text };
}

export function compactTranscriptText(value) {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/([啊哦嗯哈诶哎呃唉喔噢呀嘿])\1{2,}/gu, "$1…")
    .replace(/([！!?？。])\1{2,}/gu, "$1");
}
