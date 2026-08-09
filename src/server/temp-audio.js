import { randomUUID } from "node:crypto";

// 说话人分离需要把音频临时放到一个公网可访问的地址上交给百炼异步转写。
// 这里只登记本机文件路径，路由按随机 token 对外暴露，任务结束或到期即失效。
const entries = new Map();

export function registerTempAudio(filePath, ttlMs = 15 * 60_000) {
  const token = randomUUID();
  entries.set(token, { filePath, expiresAt: Date.now() + ttlMs });
  return token;
}

export function getTempAudio(token) {
  const entry = entries.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    entries.delete(token);
    return null;
  }
  return entry.filePath;
}

export function removeTempAudio(token) {
  entries.delete(token);
}
