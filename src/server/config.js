import "dotenv/config";
import os from "node:os";

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

const integerEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// 用户显式声明要接真实模型，却没有可用 key 时，安全回退到演示数据，
// 保证“零配置也能跑通完整流程”；配置错误的其他取值仍会在适配器里报错。
export function resolveProvider(rawProvider, hasKey) {
  return (rawProvider === "dashscope" || rawProvider === "openai-compatible") && !hasKey ? "mock" : rawProvider;
}

export const config = {
  port: integerEnv("PORT", 3000),
  maxUploadBytes: integerEnv("MAX_UPLOAD_BYTES", 500 * 1024 * 1024),
  maxDurationSeconds: integerEnv("MAX_DURATION_SECONDS", 15 * 60),
  frameIntervalSeconds: integerEnv("FRAME_INTERVAL_SECONDS", 6),
  maxFrames: integerEnv("MAX_FRAMES", 12),
  resultTtlSeconds: integerEnv("RESULT_TTL_SECONDS", 20 * 60),
  tempRoot: process.env.TEMP_ROOT || os.tmpdir(),
  asrProvider: resolveProvider(requestedAsrProvider, Boolean(dashscopeApiKey)),
  analysisProvider: resolveProvider(requestedAnalysisProvider, Boolean(visionApiKey)),
  dashscopeApiKey,
  dashscopeWorkspaceId,
  dashscopeBaseUrl,
  dashscopeModel: process.env.ASR_MODEL || "fun-asr-flash-2026-06-15",
  asrSegmentSeconds: integerEnv("ASR_SEGMENT_SECONDS", 60),
  // 说话人分离需要把整段音频交给百炼异步转写（要求服务有公网地址）。
  // 默认在配置了 PUBLIC_BASE_URL 时开启，也可以用 ASR_DIARIZATION=on/off 强制指定。
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  asrDiarization: requestedDiarization === "on" ? true : requestedDiarization === "off" ? false : Boolean(process.env.PUBLIC_BASE_URL),
  asrMaxSegmentBytes: integerEnv("ASR_MAX_SEGMENT_BYTES", 8 * 1024 * 1024),
  dashscopeTimeoutMs: integerEnv("DASHSCOPE_TIMEOUT_MS", 120000),
  visionApiKey,
  visionBaseUrl: process.env.VISION_BASE_URL || dashscopeBaseUrl,
  visionModel: process.env.VISION_MODEL || "qwen3-vl-flash"
};

if (config.asrProvider === "mock" && requestedAsrProvider === "dashscope") {
  console.warn("[ding-frame] 已声明 ASR_PROVIDER=dashscope 但缺少 DASHSCOPE_API_KEY，自动改用演示听写。");
}
if (config.analysisProvider === "mock" && requestedAnalysisProvider === "openai-compatible") {
  console.warn("[ding-frame] 已声明 ANALYSIS_PROVIDER=openai-compatible 但缺少可用 API Key，自动改用演示画面分析。");
}

export function asrIsConfigured() {
  return config.asrProvider === "dashscope" && Boolean(config.dashscopeApiKey);
}

export function analysisIsConfigured() {
  return config.analysisProvider === "openai-compatible" && Boolean(config.visionApiKey);
}
