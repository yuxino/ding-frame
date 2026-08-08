const browserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

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
  return headers;
}

export function isDouyinHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "douyin.com" || normalized.endsWith(".douyin.com") || normalized === "douyinvod.com" || normalized.endsWith(".douyinvod.com");
}
