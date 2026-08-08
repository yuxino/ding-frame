import "dotenv/config";
import os from "node:os";

const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || "";
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
  dashscopeWorkspaceId: process.env.DASHSCOPE_WORKSPACE_ID || "",
  dashscopeModel: process.env.ASR_MODEL || "paraformer-v2",
  dashscopePollIntervalMs: integerEnv("DASHSCOPE_POLL_INTERVAL_MS", 2000),
  dashscopeTimeoutMs: integerEnv("DASHSCOPE_TIMEOUT_MS", 120000),
  ossRegion: process.env.OSS_REGION || "oss-cn-beijing",
  ossBucket: process.env.OSS_BUCKET || "",
  ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
  ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
  ossPrefix: process.env.OSS_PREFIX || "between-frames/temporary",
  visionApiKey,
  visionBaseUrl: process.env.VISION_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  visionModel: process.env.VISION_MODEL || "qwen3-vl-flash"
};

export function asrIsConfigured() {
  return config.asrProvider === "dashscope" && Boolean(config.dashscopeApiKey && config.ossBucket && config.ossAccessKeyId && config.ossAccessKeySecret);
}

export function analysisIsConfigured() {
  return config.analysisProvider === "openai-compatible" && Boolean(config.visionApiKey);
}
