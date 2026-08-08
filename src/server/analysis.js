import { readFile } from "node:fs/promises";
import { config } from "./config.js";

export async function analyze({ title, durationMs, frames, transcript, framesDir }) {
  if (config.analysisProvider === "mock") return localAnalysis({ title, durationMs, frames, transcript });
  if (config.analysisProvider !== "openai-compatible") throw new Error(`未知的 ANALYSIS_PROVIDER：${config.analysisProvider}`);
  return analyzeWithVisionModel({ title, durationMs, frames, transcript, framesDir });
}

function localAnalysis({ title, durationMs, frames, transcript }) {
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
  const prompt = `你在分析一段小视频。请只返回 JSON，不要 markdown：{"summary":"不超过80字的中文总结","highlights":[{"atMs":0,"title":"不超过12字","detail":"不超过60字"}]}。视频标题：${title}；时长毫秒：${durationMs}；听写：${transcript.map((line) => `[${line.startMs}] ${line.text}`).join(" ")}`;
  const response = await fetch(`${config.visionBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.visionApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: config.visionModel, temperature: 0.2, messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...frameContent] }] })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || `画面模型请求失败：${response.status}`);
  const raw = body.choices?.[0]?.message?.content || "{}";
  const json = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```\s*$/, ""));
  return { title: title || "一段小视频的临时切片", durationMs, summary: json.summary || "画面模型没有返回摘要。", highlights: json.highlights || [], transcript, frames: frames.map((frame, index) => ({ ...frame, caption: `视觉切片 ${index + 1}` })) };
}
