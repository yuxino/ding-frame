import "dotenv/config";
import os from "node:os";

const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || "";
const dashscopeWorkspaceId = process.env.DASHSCOPE_WORKSPACE_ID || "";
const dashscopeBaseUrl = process.env.DASHSCOPE_BASE_URL
  || (dashscopeWorkspaceId
    ? `https://${dashscopeWorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
    : "https://dashscope.aliyuncs.com/compatible-mode/v1");
const visionApiKey = process.env.VISION_API_KEY || dashscopeApiKey;

const integerEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const config = {
  port: integerEnv("PORT", 3000),
  maxUploadBytes: integerEnv("MAX_UPLOAD_BYTES", 500 * 1024 * 1024),
  maxDurationSeconds: integerEnv("MAX_DURATION_SECONDS", 15 * 60),
  frameIntervalSeconds: integerEnv("FRAME_INTERVAL_SECONDS", 6),
  maxFrames: integerEnv("MAX_FRAMES", 12),
  resultTtlSeconds: integerEnv("RESULT_TTL_SECONDS", 20 * 60),
  tempRoot: process.env.TEMP_ROOT || os.tmpdir(),
  asrProvider: process.env.ASR_PROVIDER || (dashscopeApiKey ? "dashscope" : "mock"),
  analysisProvider: process.env.ANALYSIS_PROVIDER || (visionApiKey ? "openai-compatible" : "mock"),
  dashscopeApiKey,
  dashscopeWorkspaceId,
  dashscopeBaseUrl,
  dashscopeModel: process.env.ASR_MODEL || "qwen3-asr-flash",
  asrSegmentSeconds: integerEnv("ASR_SEGMENT_SECONDS", 60),
  asrMaxSegmentBytes: integerEnv("ASR_MAX_SEGMENT_BYTES", 8 * 1024 * 1024),
  dashscopeTimeoutMs: integerEnv("DASHSCOPE_TIMEOUT_MS", 120000),
  visionApiKey,
  visionBaseUrl: process.env.VISION_BASE_URL || dashscopeBaseUrl,
  visionModel: process.env.VISION_MODEL || "qwen3-vl-flash"
};

export function asrIsConfigured() {
  return config.asrProvider === "dashscope" && Boolean(config.dashscopeApiKey);
}

export function analysisIsConfigured() {
  return config.analysisProvider === "openai-compatible" && Boolean(config.visionApiKey);
}
