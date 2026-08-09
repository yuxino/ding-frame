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
    tags: [
      { label: "小视频", category: "形式", atMs: 0 },
      { label: transcript.length ? "有人声" : "无对白", category: "形式", atMs: 0 }
    ],
    highlights,
    transcript,
    frames: frames.map((frame, index) => ({ ...frame, caption: index === 0 ? "进入这段视频的第一个画面" : `第 ${index + 1} 个视觉切片` }))
  };
}

async function analyzeWithVisionModel({ title, durationMs, frames, transcript, framesDir }) {
  if (!config.visionApiKey) throw new Error("配置 VISION_API_KEY 后才能使用画面理解模型。");
  const selectedFrames = selectRepresentativeFrames(frames, 6);
  const frameGroups = await Promise.all(selectedFrames.map(async ({ frame, index }) => {
    const base64 = (await readFile(`${framesDir}/${frame.filename}`)).toString("base64");
    return [
      { type: "text", text: `关键帧 index=${index}，atMs=${frame.atMs}` },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
    ];
  }));
  const frameContent = frameGroups.flat();
  const transcriptText = transcript.map((line) => `[${line.startMs}] ${line.text}`).join(" ").slice(0, 12000);
  const prompt = `你在分析一段小视频。结合画面和听写理解真实内容，只返回一个 JSON 对象，不要 markdown：{"title":"不超过18字的内容标题","summary":"不超过80字的完整视频总结","tags":[{"label":"不超过8字","category":"主体|场景|动作|主题|氛围|形式","atMs":0}],"highlights":[{"atMs":0,"title":"不超过12字","detail":"不超过60字"}],"frameCaptions":[{"index":0,"caption":"不超过24字的画面描述"}]}。tags 给出 4 到 8 个最值得检索或回看的标签，atMs 必须参考相邻关键帧或听写的时间，是该内容首次明确出现的毫秒时间；只标声音或画面能够确认的内容，不推断人物身份、族群、疾病等敏感属性。每张图片前都标注了它在完整抽帧列表中的原始 index 和 atMs，frameCaptions.index 必须原样使用该原始 index。视频原始名称：${title}；时长毫秒：${durationMs}；听写：${transcriptText || "无可用听写"}`;
  const response = await fetch(`${config.visionBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.visionApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.visionModel, temperature: 0.2, max_tokens: 1000, messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...frameContent] }] }),
    signal: AbortSignal.timeout(config.dashscopeTimeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || `画面模型请求失败：${response.status}`);
  const raw = body.choices?.[0]?.message?.content || "";
  return normalizeVisionModelResult({ raw, fallbackTitle: title, durationMs, frames, transcript });
}

export function selectRepresentativeFrames(frames, limit) {
  if (!Array.isArray(frames) || frames.length === 0 || limit <= 0) return [];
  if (frames.length <= limit) return frames.map((frame, index) => ({ frame, index }));
  const lastIndex = frames.length - 1;
  return Array.from({ length: limit }, (_, slot) => {
    const index = Math.round((slot * lastIndex) / (limit - 1));
    return { frame: frames[index], index };
  });
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
  const allowedCategories = new Set(["主体", "场景", "动作", "主题", "氛围", "形式"]);
  const seenTags = new Set();
  const tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
    .map((item) => ({
      label: cleanText(item?.label, "", 16),
      category: allowedCategories.has(item?.category) ? item.category : "主题",
      atMs: Math.min(maxTime, Math.max(0, Number(item?.atMs) || 0))
    }))
    .filter((tag) => {
      const key = tag.label.toLocaleLowerCase("zh-CN");
      if (!key || seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    })
    .slice(0, 8);
  const fallbackTags = (highlights.length ? highlights : fallbackHighlights).slice(0, 4).map((item) => ({
    label: cleanText(item.title, "视频片段", 16),
    category: "主题",
    atMs: item.atMs
  }));

  return {
    title: cleanText(parsed.title, fallbackTitle || "一段小视频的临时切片", 40),
    durationMs: maxTime,
    summary: cleanText(parsed.summary, "画面模型没有返回摘要。", 180),
    tags: tags.length ? tags : fallbackTags,
    highlights: highlights.length ? highlights : fallbackHighlights,
    transcript,
    frames: normalizedFrames
  };
}

function cleanText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}
