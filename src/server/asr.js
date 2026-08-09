import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { registerTempAudio, removeTempAudio } from "./temp-audio.js";
import { extractFullAudio } from "./video.js";

// 字幕级听写走同步 Fun-ASR-Flash（base64 直传，无需公网地址），
// 返回词级时间戳后按标点/停顿聚合为字幕行。
// 说话人分离走异步 Fun-ASR（需要 PUBLIC_BASE_URL 提供公网音频地址），
// 整段音频一次性交给模型，返回每句的 speaker_id。
const syncAsrModel = "fun-asr-flash-2026-06-15";
const asyncAsrModel = "fun-asr";

export async function transcribe({
  audioSegments,
  durationMs,
  fetchImpl = fetch,
  provider = config.asrProvider,
  apiKey = config.dashscopeApiKey,
  baseUrl = config.dashscopeBaseUrl,
  model = config.dashscopeModel,
  maxBytes = config.asrMaxSegmentBytes,
  timeoutMs = config.dashscopeTimeoutMs
}) {
  if (provider === "mock") return mockTranscript(durationMs);
  if (provider !== "dashscope") throw new Error(`未知的 ASR_PROVIDER：${provider}`);
  if (!apiKey) throw new Error("配置 DASHSCOPE_API_KEY 后才能使用真实听写。");

  const transcript = [];
  for (const segment of audioSegments || []) {
    const lines = await requestSegmentSubtitle({
      segment,
      apiKey,
      baseUrl,
      model,
      maxBytes,
      timeoutMs,
      fetchImpl
    });
    for (const line of lines) {
      transcript.push({
        ...line,
        startMs: line.startMs + segment.startMs,
        endMs: line.endMs + segment.startMs
      });
    }
  }
  return transcript;
}

export async function transcribeFullAudio({ inputPath, durationMs, audioDir, publicBaseUrl }) {
  if (config.asrProvider !== "dashscope") throw new Error(`未知的 ASR_PROVIDER：${config.asrProvider}`);
  if (!config.dashscopeApiKey) throw new Error("配置 DASHSCOPE_API_KEY 后才能使用真实听写。");
  if (!publicBaseUrl) throw new Error("说话人分离需要配置 PUBLIC_BASE_URL（服务的公网地址）。");

  const audioPath = join(audioDir, `diarization-${randomUUID()}.mp3`);
  await extractFullAudio(inputPath, audioPath);
  const token = registerTempAudio(audioPath);
  const fileUrl = `${publicBaseUrl}/api/temp/${token}`;
  try {
    const taskId = await submitAsrTask({
      fileUrl,
      apiKey: config.dashscopeApiKey,
      baseUrl: config.dashscopeBaseUrl,
      model: asyncAsrModel,
      timeoutMs: config.dashscopeTimeoutMs,
      fetchImpl
    });
    const task = await pollAsrTask({
      taskId,
      apiKey: config.dashscopeApiKey,
      baseUrl: config.dashscopeBaseUrl,
      timeoutMs: Math.max(120_000, config.dashscopeTimeoutMs * 3)
    });
    return await parseDiarizationTask(task, { apiKey: config.dashscopeApiKey, timeoutMs: config.dashscopeTimeoutMs });
  } finally {
    removeTempAudio(token);
    await rm(audioPath, { force: true }).catch(() => undefined);
  }
}

// 把词级时间戳聚合成字幕行：遇到句号/问号/感叹号，或停顿超过 1.5 秒，
// 或单行超过 8 秒就换行，保证每行是能直接回看的一小段。
export function groupWordsToSubtitles(words, options = {}) {
  const { maxLineMs = 8000, minGapMs = 1500, minLineMs = 1200 } = options;
  const lines = [];
  let buffer = [];
  let startMs = null;
  let endMs = null;
  let lastWasTerminal = false;

  const flush = () => {
    if (!buffer.length) return;
    const text = buffer
      .map((word) => String(word.text || ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push({ startMs: startMs ?? 0, endMs: endMs ?? startMs ?? 0, text });
    buffer = [];
    startMs = null;
    endMs = null;
    lastWasTerminal = false;
  };

  for (const word of words) {
    const begin = Number(word.begin_time) || 0;
    const end = Number(word.end_time) || begin;
    const punctuation = String(word.punctuation || "");
    const isTerminal = /[.!?。！？…]/.test(punctuation);
    if (buffer.length) {
      const gap = begin - (endMs ?? begin);
      const lineMs = end - (startMs ?? begin);
      if ((lastWasTerminal && lineMs >= minLineMs) || gap > minGapMs || lineMs > maxLineMs) flush();
    }
    buffer.push(word);
    if (startMs === null) startMs = begin;
    endMs = end;
    lastWasTerminal = isTerminal;
  }
  flush();
  return lines;
}

// 同步 Fun-ASR-Flash：一次请求返回整段音频的词级时间戳（相对于切片起点）。
export async function requestSegmentSubtitle({
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
  const response = await fetchImpl(`${nativeBaseUrl(baseUrl)}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "X-DashScope-SSE": "disable"
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [{
          role: "user",
          content: [{
            type: "input_audio",
            input_audio: { data: `data:audio/mpeg;base64,${audio.toString("base64")}` }
          }]
        }]
      },
      parameters: { format: "mp3", sample_rate: "16000" }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.output?.message || body.message || body.code || `听写模型请求失败：${response.status}`;
    // 这一整段没有可识别的人声（纯音乐/静音等），跳过而不是中断整个任务
    if (/ASR_RESPONSE_HAVE_NO_WORDS/.test(String(message))) return [];
    throw new Error(message);
  }
  const sentence = body.output?.output?.sentence || body.output?.sentence;
  const words = Array.isArray(sentence?.words) ? sentence.words : [];
  const text = compactTranscriptText(sentence?.text || "");
  if (!words.length) {
    if (!text) return [];
    return [{ startMs: segment.startMs, endMs: segment.endMs, text }];
  }
  return groupWordsToSubtitles(words);
}

async function submitAsrTask({ fileUrl, apiKey, baseUrl, model, timeoutMs, fetchImpl = fetch }) {
  const response = await fetchImpl(`${nativeBaseUrl(baseUrl)}/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: JSON.stringify({
      model,
      input: { file_urls: [fileUrl] },
      parameters: { channel_id: [0], diarization_enabled: true }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.output?.message || body.message || body.code || `听写任务提交失败：${response.status}`);
  }
  const taskId = body.output?.task_id;
  if (!taskId) throw new Error("听写任务没有返回任务编号。");
  return taskId;
}

async function pollAsrTask({ taskId, apiKey, baseUrl, timeoutMs, intervalMs = 2500, fetchImpl = fetch }) {
  const endpoint = `${nativeBaseUrl(baseUrl)}/tasks/${taskId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(30_000)
    });
    const body = await response.json().catch(() => ({}));
    const status = body.output?.task_status;
    if (status === "SUCCEEDED") return body;
    if (status === "FAILED") throw new Error(`听写任务失败：${body.output?.message || "未知原因"}`);
    await sleep(intervalMs);
  }
  throw new Error("听写任务超时，请稍后重试。");
}

export async function parseDiarizationTask(task, { apiKey, timeoutMs, fetchImpl = fetch }) {
  const results = task.output?.results || [];
  const succeeded = results.find((result) => result.subtask_status === "SUCCEEDED" && result.transcription_url);
  if (!succeeded) {
    const failed = results.find((result) => result.subtask_status === "FAILED");
    throw new Error(failed?.message || "听写任务没有成功结果。");
  }
  const response = await fetchImpl(succeeded.transcription_url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`听写结果下载失败：${response.status}`);
  const data = await response.json();
  const sentences = data.transcripts?.[0]?.sentences || [];
  return sentences
    .map((sentence) => ({
      startMs: Number(sentence.begin_time) || 0,
      endMs: Number(sentence.end_time) || 0,
      text: String(sentence.text || "").trim(),
      speaker: sentence.speaker_id !== undefined && sentence.speaker_id !== null ? String(sentence.speaker_id) : undefined
    }))
    .filter((line) => line.text);
}

function nativeBaseUrl(compatibleBaseUrl) {
  const cleaned = String(compatibleBaseUrl || "").replace(/\/+$/, "");
  if (cleaned.includes("/compatible-mode/v1")) return cleaned.replace(/\/compatible-mode\/v1$/, "/api/v1");
  return "https://dashscope.aliyuncs.com/api/v1";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export function compactTranscriptText(value) {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/([啊哦嗯哈诶哎呃唉喔噢呀嘿])\1{2,}/gu, "$1…")
    .replace(/([！!?？。])\1{2,}/gu, "$1");
}
