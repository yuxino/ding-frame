import os from "node:os";
import "dotenv/config";

const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || "";
const dashscopeWorkspaceId = process.env.DASHSCOPE_WORKSPACE_ID || "";
const dashscopeBaseUrl = process.env.DASHSCOPE_BASE_URL
  || (dashscopeWorkspaceId
    ? `https://${dashscopeWorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
    : "https://dashscope.aliyuncs.com/compatible-mode/v1");
const visionApiKey = process.env.VISION_API_KEY || dashscopeApiKey;
const requestedAsrProvider = process.env.ASR_PROVIDER || (dashscopeApiKey ? "dashscope" : "mock");
const requestedDiarization = process.env.ASR_DIARIZATION;
const requestedAnalysisProvider = process.env.ANALYSIS_PROVIDER || (visionApiKey ? "openai-compatible" : "mock");

const integerEnv = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const floatEnv = (name: string, fallback: number, min: number, max: number): number => {
  const value = Number(process.env[name] || "");
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

// 用户显式声明要接真实模型，却没有可用 key 时，安全回退到演示数据，
// 保证“零配置也能跑通完整流程”；配置错误的其他取值仍会在适配器里报错。
export function resolveProvider(rawProvider: string, hasKey: boolean): string {
  return (rawProvider === "dashscope" || rawProvider === "openai-compatible") && !hasKey ? "mock" : rawProvider;
}

export const config = {
  port: integerEnv("PORT", 3000),
  maxUploadBytes: integerEnv("MAX_UPLOAD_BYTES", 500 * 1024 * 1024),
  maxDurationSeconds: integerEnv("MAX_DURATION_SECONDS", 15 * 60),
  // 抽帧宽度：关键帧统一缩到这一宽度（保持比例），太大浪费存储和 API 流量
  frameWidth: integerEnv("FRAME_WIDTH", 1280),
  // 场景检测阈值（0–1）：画面差异超过它才作为“转场/重点”帧优先保留；
  // 值越小抽到的重点帧越多，调大后更保守。
  frameSceneThreshold: floatEnv("FRAME_SCENE_THRESHOLD", 0.4, 0.05, 0.95),
  maxFrames: integerEnv("MAX_FRAMES", 18),
  // 并发送视觉模型理解的帧数上限；结合抽帧时间线从全部关键帧里再挑代表帧
  visionMaxFrames: integerEnv("VISION_MAX_FRAMES", 10),
  // 喂给视觉模型的听写文本上限（字符）。过长时保留头尾、中间省略，
  // 保证长视频的开场和结尾口述内容不丢。
  visionTranscriptChars: integerEnv("VISION_TRANSCRIPT_CHARS", 30000),
  // 视觉模型输出上限（tokens）。章节总结的 summary 各两三句，输出量远大于
  // 旧版 highlight，上限太低会导致 JSON 被截断而解析失败。
  visionMaxTokens: integerEnv("VISION_MAX_TOKENS", 2000),
  // 同时执行的分析任务数上限：ffmpeg 抽帧/转码和 ASR 都吃资源，
  // 超出的任务排队等待，避免几个大视频同时上传把服务拖垮。
  maxConcurrentJobs: integerEnv("MAX_CONCURRENT_JOBS", 2),
  resultTtlSeconds: integerEnv("RESULT_TTL_SECONDS", 20 * 60),
  tempRoot: process.env.TEMP_ROOT || os.tmpdir(),
  asrProvider: resolveProvider(requestedAsrProvider, Boolean(dashscopeApiKey)),
  analysisProvider: resolveProvider(requestedAnalysisProvider, Boolean(visionApiKey)),
  dashscopeApiKey,
  dashscopeWorkspaceId,
  dashscopeBaseUrl,
  dashscopeModel: process.env.ASR_MODEL || "fun-asr-flash-2026-06-15",
  asrSegmentSeconds: integerEnv("ASR_SEGMENT_SECONDS", 60),
  asrMaxSegmentBytes: integerEnv("ASR_MAX_SEGMENT_BYTES", 8 * 1024 * 1024),
  // 说话人分离需要把整段音频交给百炼异步转写（要求服务有公网地址）。
  // 默认在配置了 PUBLIC_BASE_URL 时开启，也可以用 ASR_DIARIZATION=on/off 强制指定。
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  asrDiarization: requestedDiarization === "on" ? true : requestedDiarization === "off" ? false : Boolean(process.env.PUBLIC_BASE_URL),
  dashscopeTimeoutMs: integerEnv("DASHSCOPE_TIMEOUT_MS", 120000),
  visionApiKey,
  visionBaseUrl: process.env.VISION_BASE_URL || dashscopeBaseUrl,
  visionModel: process.env.VISION_MODEL || "qwen3-vl-flash"
} as const;

if (config.asrProvider === "mock" && requestedAsrProvider === "dashscope") {
  console.warn("[koma] 已声明 ASR_PROVIDER=dashscope 但缺少 DASHSCOPE_API_KEY，自动改用演示听写。");
}
if (config.analysisProvider === "mock" && requestedAnalysisProvider === "openai-compatible") {
  console.warn("[koma] 已声明 ANALYSIS_PROVIDER=openai-compatible 但缺少可用 API Key，自动改用演示画面分析。");
}

export function asrIsConfigured(): boolean {
  return config.asrProvider === "dashscope" && Boolean(config.dashscopeApiKey);
}

export function analysisIsConfigured(): boolean {
  return config.analysisProvider === "openai-compatible" && Boolean(config.visionApiKey);
}
