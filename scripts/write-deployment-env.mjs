import { chmod, readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";

const target = process.argv[2] || ".env";
let existing = {};
try {
  existing = parse(await readFile(target, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const specs = [
  ["PORT", "APP_PORT", "3000"],
  ["ASR_PROVIDER"], ["ASR_API_KEY"], ["ASR_BASE_URL"], ["ASR_MODEL"],
  ["DASHSCOPE_API_KEY"], ["GROQ_API_KEY"], ["OPENAI_API_KEY"],
  ["VISION_PROVIDER"], ["VISION_API_KEY"], ["VISION_BASE_URL"], ["VISION_MODEL"],
  ["GEMINI_API_KEY"], ["OPENROUTER_API_KEY"],
  ["PUBLIC_BASE_URL"], ["ASR_DIARIZATION", null, "off"],
  ["DEMO_REQUESTS_PER_IP_PER_DAY", null, "0"],
  ["ADMIN_PASSWORD"], ["KOMA_CONFIG_SECRET"],
  ["DB_DRIVER", null, "sqlite"], ["KOMA_DATABASE_PATH", null, "./data/koma.sqlite"],
  ["DB_HOST"], ["DB_PORT", null, "3306"], ["DB_USER"], ["DB_PASSWORD"], ["DB_NAME", null, "koma"],
  ["DB_SSL", null, "false"], ["DB_CONNECTION_LIMIT", null, "5"], ["DB_AUTO_CREATE", null, "true"],
  ["STORAGE_DRIVER", null, "local"], ["LOCAL_STORAGE_PATH", null, "./data/storage"],
  ["OSS_REGION"], ["OSS_ACCESS_KEY_ID"], ["OSS_ACCESS_KEY_SECRET"], ["OSS_BUCKET"],
  ["OSS_UPLOAD_PREFIX", null, "koma"], ["OSS_PUBLIC_BASE_URL"],
  ["OSS_SIGNED_URL_SECONDS", null, "900"], ["OSS_TIMEOUT_MS", null, "120000"],
  ["TRUST_PROXY", null, "true"]
];

const lines = specs.map(([name, source = name, fallback = ""]) => {
  const incoming = clean(process.env[source || name]);
  const current = clean(existing[name]);
  return `${name}=${JSON.stringify(incoming || current || fallback)}`;
});

await writeFile(target, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
await chmod(target, 0o600);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}
