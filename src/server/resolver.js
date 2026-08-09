import { spawn, spawnSync } from "node:child_process";
import { isBilibiliHost, isDouyinHost } from "./url-source.js";

const douyinPageUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const defaultOptions = {
  fetchImpl: fetch,
  timeoutMs: 30_000,
  maxRedirects: 6
};

// 从分享文案里挑出第一条 http(s) 链接，例如抖音的
// “8.88 复制打开抖音… https://v.douyin.com/xxxx/”。
export function extractUrlFromText(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/https?:\/\/[^\s<>"'，。；、！？）\]】]+/i);
  if (!match) return "";
  return match[0].replace(/[),.;，。；！!、）\]】]+$/g, "");
}

// 把 _ROUTER_DATA 里的播放地址里 playwm（带水印）换成 play（无水印）。
export function deWatermark(url) {
  return typeof url === "string" ? url.replace("/playwm/", "/play/") : url;
}

export function looksLikeDouyinLink(value) {
  if (typeof value !== "string") return false;
  try {
    return isDouyinHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

// 解析抖音分享页。返回 { url, title } 或 null。
export function parseDouyinPage(html) {
  const routerJson = extractRouterData(html);
  if (routerJson) {
    try {
      const found = findVideoInRouterData(JSON.parse(routerJson));
      if (found) return found;
    } catch {
      // 继续尝试 og:video
    }
  }
  const ogVideo = extractOgVideo(html);
  if (ogVideo) return { url: deWatermark(ogVideo), title: undefined };
  return null;
}


// 从抖音链接里提取视频 ID 并转成分享页地址：
// - www.douyin.com/jingxuan/search/...?modal_id=<id>（精选/搜索弹窗）
// - www.douyin.com/video/<id>、www.iesdouyin.com/share/video/<id>
// 分享页是服务端渲染，HTML 里带 _ROUTER_DATA，解析最稳。
export function douyinShareUrl(value) {
  try {
    const parsed = new URL(value);
    if (!isDouyinHost(parsed.hostname)) return null;
    const modal = parsed.searchParams.get("modal_id");
    if (modal && /^\d+$/.test(modal)) return `https://www.iesdouyin.com/share/video/${modal}`;
    const pathMatch = parsed.pathname.match(/^\/(?:video|share\/video)\/(\d+)/);
    if (pathMatch) return `https://www.iesdouyin.com/share/video/${pathMatch[1]}`;
  } catch {
    // 不是合法 URL 就交给后续逻辑
  }
  return null;
}

export async function resolveDouyinVideo(value, options = {}) {
  const { fetchImpl, timeoutMs, maxRedirects } = { ...defaultOptions, ...options };
  const headers = {
    "user-agent": douyinPageUserAgent,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9",
    referer: "https://www.douyin.com/"
  };
  let current = douyinShareUrl(value) || value;
  for (let attempt = 0; attempt < maxRedirects; attempt += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`抖音页面无法访问：${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("video/") || contentType.includes("audio/")) {
      return { url: current, source: "douyin", title: undefined };
    }
    const html = await response.text();
    const parsed = parseDouyinPage(html);
    if (parsed) return { ...parsed, source: "douyin" };
    throw new Error("抖音这条内容没有解析到视频（可能是图文笔记、已删除或需要登录）。");
  }
  throw new Error("抖音链接重定向次数太多，暂时解析不了。");
}

const browserLikeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

export function looksLikeBilibiliLink(value) {
  if (typeof value !== "string") return false;
  try {
    return isBilibiliHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

// 从 B 站链接里提取 BV 号：/video/BVxxx 路径或 bvid= 参数都行。
export function bilibiliBvid(value) {
  try {
    const parsed = new URL(value);
    const fromQuery = parsed.searchParams.get("bvid");
    if (fromQuery && /^BV[0-9A-Za-z]{10,}$/.test(fromQuery)) return fromQuery;
    const match = parsed.pathname.match(/(BV[0-9A-Za-z]{10,})/);
    if (match) return match[1];
  } catch {
    // 交给外层报错
  }
  return null;
}

// B 站原生解析：官方接口拿视频信息（标题、cid）和播放直链，不需要登录。
// b23.tv 短链先跟随重定向到正片地址。
export async function resolveBilibiliVideo(value, options = {}) {
  const { fetchImpl, timeoutMs } = { ...defaultOptions, ...options };
  const headers = {
    "user-agent": browserLikeUserAgent,
    referer: "https://www.bilibili.com/",
    accept: "application/json,text/plain,*/*"
  };
  let url = value;
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname === "b23.tv" || hostname.endsWith(".b23.tv")) {
    const redirected = await fetchImpl(url, {
      redirect: "follow",
      headers: { "user-agent": browserLikeUserAgent },
      signal: AbortSignal.timeout(timeoutMs)
    });
    url = redirected.url || url;
  }
  const bvid = bilibiliBvid(url);
  if (!bvid) throw new Error("没有从 B 站链接里找到视频编号。");

  const viewResponse = await fetchImpl(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const viewBody = await viewResponse.json().catch(() => ({}));
  if (viewBody.code !== 0) throw new Error(`B 站视频信息获取失败：${viewBody.message || viewBody.code}`);
  const data = viewBody.data || {};
  const cid = data.cid || data.pages?.[0]?.cid;
  if (!cid) throw new Error("B 站这条内容没有可用的分P编号。");

  const playResponse = await fetchImpl(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&fnver=0&fourk=1`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const playBody = await playResponse.json().catch(() => ({}));
  if (playBody.code !== 0) throw new Error(`B 站播放地址获取失败：${playBody.message || playBody.code}`);
  const direct = playBody.data?.durl?.[0]?.url;
  if (!direct) throw new Error("B 站没有返回可下载的播放地址（可能需要登录）。");

  return { url: direct, title: typeof data.title === "string" ? data.title : undefined, source: "bilibili" };
}

// 统一入口：能解析出真实可下载地址就返回它，否则原样返回让下载流程兜底。
export async function resolveVideoUrl(value, options = {}) {
  if (looksLikeDouyinLink(value)) {
    try {
      return await resolveDouyinVideo(value, options);
    } catch (error) {
      if (String(error?.message || "").startsWith("抖音")) throw error;
      return { url: value, source: "direct", title: undefined };
    }
  }
  if (looksLikeBilibiliLink(value)) {
    try {
      return await resolveBilibiliVideo(value, options);
    } catch (error) {
      if (String(error?.message || "").startsWith("B 站") || String(error?.message || "").includes("BV")) throw error;
      return { url: value, source: "direct", title: undefined };
    }
  }
  const ytdlpUrl = await resolveWithYtDlp(value, options);
  if (ytdlpUrl) return { url: ytdlpUrl, source: "ytdlp", title: undefined };
  return { url: value, source: "direct", title: undefined };
}

// yt-dlp 兜底：覆盖抖音之外的各大热门网站（B站、YouTube、小红书等）。
export async function resolveWithYtDlp(value, options = {}) {
  const command = findYtDlpCommand();
  if (!command) return null;
  const timeoutMs = options.ytdlpTimeoutMs || 90_000;
  const args = [
    ...command.args,
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "15",
    "-f",
    "best[ext=mp4]/best",
    "-g",
    value
  ];
  const { stdout } = await runYtDlp(command.bin, args, timeoutMs);
  const lines = String(stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const direct = lines[lines.length - 1];
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  return null;
}

function findYtDlpCommand() {
  if (process.env.YTDLP_PATH) return { bin: process.env.YTDLP_PATH, args: [] };
  const ytdlp = findOnPath("yt-dlp");
  if (ytdlp) return { bin: ytdlp, args: [] };
  const python3 = findOnPath("python3");
  if (python3) return { bin: python3, args: ["-m", "yt_dlp"] };
  return null;
}

function findOnPath(name) {
  try {
    const result = spawnSync("which", [name], { encoding: "utf8" });
    if (result.status !== 0) return null;
    const first = result.stdout.trim().split("\n")[0];
    return first || null;
  } catch {
    return null;
  }
}

function runYtDlp(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", () => { clearTimeout(timer); resolve({ stdout: "", stderr: "" }); });
    child.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr });
    });
  });
}

function extractRouterData(html) {
  const marker = "window._ROUTER_DATA";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const equals = html.indexOf("=", start);
  if (equals < 0) return null;
  const jsonStart = html.indexOf("{", equals);
  if (jsonStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(jsonStart, index + 1);
    }
  }
  return null;
}

function findVideoInRouterData(data) {
  const loader = data?.loaderData || {};
  for (const value of Object.values(loader)) {
    const item = value?.videoInfoRes?.item_list?.[0];
    if (!item?.video) continue;
    const video = item.video;
    const candidate =
      video.play_addr?.url_list?.[0] ||
      video.bit_rate?.[0]?.play_addr?.url_list?.[0] ||
      video.download_addr?.url_list?.[0];
    if (!candidate) continue;
    return {
      url: deWatermark(candidate),
      title: typeof item.desc === "string" ? item.desc : undefined
    };
  }
  return null;
}

function extractOgVideo(html) {
  const patterns = [
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
