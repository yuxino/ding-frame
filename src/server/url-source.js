const browserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

const DOUYIN_HOST_SUFFIXES = ["douyin.com", "douyinvod.com", "iesdouyin.com", "snssdk.com", "amemv.com"];
const BILIBILI_HOST_SUFFIXES = ["bilibili.com", "b23.tv", "bilivideo.com", "hdslb.com"];

export function normalizeVideoUrl(value) {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  if (normalized.startsWith("//")) return `https:${normalized}`;
  if (!/^[a-z][a-z\d+.-]*:/i.test(normalized) && /^[^/\s]+\.[^/\s]+/.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
}

export function headersForVideoUrl(value) {
  const parsed = new URL(value);
  const headers = {
    accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
    "user-agent": browserUserAgent,
    "cache-control": "no-cache"
  };
  if (isDouyinHost(parsed.hostname)) {
    headers.referer = "https://www.douyin.com/";
    headers.origin = "https://www.douyin.com";
  }
  if (isBilibiliHost(parsed.hostname)) {
    headers.referer = "https://www.bilibili.com/";
  }
  return headers;
}

export function isDouyinHost(hostname) {
  const normalized = hostname.toLowerCase();
  return DOUYIN_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

export function isBilibiliHost(hostname) {
  const normalized = hostname.toLowerCase();
  return BILIBILI_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}
