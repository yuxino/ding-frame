import { readFile } from "node:fs/promises";
import { config } from "./config.js";

export async function analyze({ title, durationMs, frames, transcript, framesDir }) {
  if (config.analysisProvider === "mock") return localAnalysis({ title, durationMs, frames, transcript });
  if (config.analysisProvider !== "openai-compatible") throw new Error(`未知的 ANALYSIS_PROVIDER：${config.analysisProvider}`);
  return analyzeWithVisionModel({ title, durationMs, frames, transcript, framesDir });
}

export function localAnalysis({ title, durationMs, frames, transcript }) {
  const usableFrames = frames.length ? frames : [{ filename: "", atMs: 0 }];
  const highlights = transcript.slice(0, Math.min(3, transcript.length)).map((line, index) => ({
    atMs: line.startMs || usableFrames[index % usableFrames.length].atMs,
    title: ["开场建立了场景", "中段出现了主要信息", "结尾留下了一个动作"][index] || "值得回看的片段",
    detail: line.text
  }));
  return {
    title: title || "一段小视频的临时切片",
    durationMs: durationMs || 0,
    summary: "这段视频的线索集中在几处声音与画面的交汇处。下面按时间顺序放回它们，适合从中段开始回看。",
    highlights,
    transcript,
    frames: frames.map((frame, index) => ({ ...frame, caption: index === 0 ? "进入这段视频的第一个画面" : `第 ${index + 1} 个视觉切片` }))
  };
}

async function analyzeWithVisionModel({ title, durationMs, frames, transcript, framesDir }) {
  if (!config.visionApiKey) throw new Error("配置 VISION_API_KEY 后才能使用画面理解模型。");
  const frameContent = await Promise.all(frames.slice(0, 6).map(async (frame) => {
    const base64 = (await readFile(`${framesDir}/${frame.filename}`)).toString("base64");
    return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } };
  }));
  const transcriptText = transcript.map((line) => `[${line.startMs}] ${line.text}`).join(" ").slice(0, 12000);
  const prompt = `你在分析一段小视频。结合画面和听写理解真实内容，只返回一个 JSON 对象，不要 markdown：{"title":"不超过18字的内容标题","summary":"不超过80字的中文总结","highlights":[{"atMs":0,"title":"不超过12字","detail":"不超过60字"}],"frameCaptions":[{"index":0,"caption":"不超过24字的画面描述"}]}。frameCaptions.index 从 0 开始，对应图片顺序。视频原始名称：${title}；时长毫秒：${durationMs}；听写：${transcriptText || "无可用听写"}`;
  const response = await fetch(`${config.visionBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.visionApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.visionModel, temperature: 0.2, max_tokens: 800, messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...frameContent] }] }),
    signal: AbortSignal.timeout(config.dashscopeTimeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || `画面模型请求失败：${response.status}`);
  const raw = body.choices?.[0]?.message?.content || "";
  return normalizeVisionModelResult({ raw, fallbackTitle: title, durationMs, frames, transcript });
}

export function normalizeVisionModelResult({ raw, fallbackTitle, durationMs, frames, transcript }) {
  const rawText = typeof raw === "string"
    ? raw
    : Array.isArray(raw) ? raw.map((item) => item?.text || "").join("") : "";
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("画面模型没有返回有效 JSON，请重试。");

  let parsed;
  try {
    parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new Error("画面模型没有返回有效 JSON，请重试。");
  }

  const captions = new Map((Array.isArray(parsed.frameCaptions) ? parsed.frameCaptions : [])
    .map((item) => [Number(item?.index), cleanText(item?.caption, "", 48)])
    .filter(([index, caption]) => Number.isInteger(index) && index >= 0 && caption));
  const normalizedFrames = frames.map((frame, index) => ({
    ...frame,
    caption: captions.get(index) || `视觉切片 ${index + 1}`
  }));
  const maxTime = Math.max(0, Number(durationMs) || 0);
  const highlights = (Array.isArray(parsed.highlights) ? parsed.highlights : [])
    .map((item) => ({
      atMs: Math.min(maxTime, Math.max(0, Number(item?.atMs) || 0)),
      title: cleanText(item?.title, "值得回看的片段", 24),
      detail: cleanText(item?.detail, "画面与声音在这里形成了一个线索。", 120)
    }))
    .slice(0, 6);
  const fallbackHighlights = transcript.slice(0, 3).map((line) => ({
    atMs: Math.min(maxTime, Math.max(0, Number(line.startMs) || 0)),
    title: "人声线索",
    detail: cleanText(line.text, "听写片段", 120)
  }));

  return {
    title: cleanText(parsed.title, fallbackTitle || "一段小视频的临时切片", 40),
    durationMs: maxTime,
    summary: cleanText(parsed.summary, "画面模型没有返回摘要。", 180),
    highlights: highlights.length ? highlights : fallbackHighlights,
    transcript,
    frames: normalizedFrames
  };
}

function cleanText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}
