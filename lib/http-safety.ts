export class HttpRequestSafetyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 413 | 415 | 429,
    readonly code: string,
  ) {
    super(message);
    this.name = "HttpRequestSafetyError";
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be a positive safe integer");

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && contentType !== "application/json" && !contentType.endsWith("+json")) {
    throw new HttpRequestSafetyError("Content-Type must be application/json", 415, "UNSUPPORTED_MEDIA_TYPE");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (!Number.isFinite(parsed) || parsed < 0) throw new HttpRequestSafetyError("Invalid Content-Length", 400, "INVALID_CONTENT_LENGTH");
    if (parsed > maxBytes) throw new HttpRequestSafetyError("Request body too large", 413, "REQUEST_BODY_TOO_LARGE");
  }

  if (!request.body) throw new HttpRequestSafetyError("Request body is required", 400, "REQUEST_BODY_REQUIRED");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpRequestSafetyError("Request body too large", 413, "REQUEST_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) throw new HttpRequestSafetyError("Request body is required", 400, "REQUEST_BODY_REQUIRED");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpRequestSafetyError("Invalid JSON request body", 400, "INVALID_JSON");
  }
}

export function isCrossSiteBrowserRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function consume(key: string, max: number, windowMs: number, now: number) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, max - 1), resetAt: next.resetAt };
  }
  current.count += 1;
  return { allowed: current.count <= max, remaining: Math.max(0, max - current.count), resetAt: current.resetAt };
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkBurstRateLimit(
  request: Request,
  options: { namespace: string; maxPerIp: number; maxGlobal: number; windowMs: number },
) {
  const { namespace, maxPerIp, maxGlobal, windowMs } = options;
  if (!namespace || !Number.isSafeInteger(maxPerIp) || maxPerIp < 1 || !Number.isSafeInteger(maxGlobal) || maxGlobal < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Invalid rate-limit configuration");
  }

  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }

  const global = consume(`${namespace}:global`, maxGlobal, windowMs, now);
  const perIp = consume(`${namespace}:ip:${clientKey(request)}`, maxPerIp, windowMs, now);
  const allowed = global.allowed && perIp.allowed;
  const resetAt = Math.max(global.resetAt, perIp.resetAt);
  return {
    allowed,
    remaining: Math.min(global.remaining, perIp.remaining),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1_000)),
  };
}

export function resetHttpSafetyStateForTests() {
  buckets.clear();
}
