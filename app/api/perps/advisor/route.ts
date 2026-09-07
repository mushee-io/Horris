import { NextRequest, NextResponse } from "next/server";
import { requestGroqPerpProposal, AiAdvisorUnavailableError } from "../../../../lib/groq-perp-advisor";
import { checkBurstRateLimit, HttpRequestSafetyError, isCrossSiteBrowserRequest, readBoundedJson } from "../../../../lib/http-safety";
import type { PerpRiskProfile, PerpSide } from "../../../../lib/perps";
import { getUpDownMarket } from "../../../../lib/updown";

export const runtime = "nodejs";
export const maxDuration = 25;

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const sides: PerpSide[] = ["long", "short"];
const allowedFields = new Set(["market", "side", "risk", "accountBalanceUsd", "entryPrice", "preferredMarginUsd", "preferredLeverage"]);

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    if (isCrossSiteBrowserRequest(request)) {
      return json({ error: "Cross-site advisor requests are not allowed", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 403);
    }

    const limit = checkBurstRateLimit(request, { namespace: "horris-ai-advisor", maxPerIp: 10, maxGlobal: 25, windowMs: 60_000 });
    if (!limit.allowed) {
      return json(
        { error: "Horris AI request limit reached. Try again shortly.", code: "AI_RATE_LIMITED", retryable: true, executionEnabled: false },
        429,
        { "Retry-After": String(limit.retryAfterSeconds), "X-RateLimit-Remaining": "0" },
      );
    }

    const body = await readBoundedJson(request, 8_192);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !allowedFields.has(key))) return json({ error: "Unexpected advisor request field", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);

    const marketInput = String(input.market ?? "");
    const marketMeta = getUpDownMarket(marketInput);
    const side = String(input.side ?? "") as PerpSide;
    const risk = String(input.risk ?? "") as PerpRiskProfile;
    if (!marketMeta) return json({ error: "Unsupported UpDown market", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);
    if (!sides.includes(side)) return json({ error: "Side must be long or short", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);
    if (!risks.includes(risk)) return json({ error: "Invalid Horris risk profile", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);

    const accountBalanceUsd = Number(input.accountBalanceUsd);
    const entryPrice = Number(input.entryPrice);
    if (!Number.isFinite(accountBalanceUsd) || accountBalanceUsd <= 0 || accountBalanceUsd > 1_000_000_000 || !Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice > 1_000_000_000) {
      return json({ error: "Valid positive account balance and entry price are required", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);
    }

    const preferredMarginUsd = input.preferredMarginUsd === undefined || input.preferredMarginUsd === "" ? undefined : Number(input.preferredMarginUsd);
    const preferredLeverage = input.preferredLeverage === undefined || input.preferredLeverage === "" ? undefined : Number(input.preferredLeverage);
    if (preferredMarginUsd !== undefined && (!Number.isFinite(preferredMarginUsd) || preferredMarginUsd <= 0 || preferredMarginUsd > 1_000_000_000)) {
      return json({ error: "Invalid preferred margin", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);
    }
    if (preferredLeverage !== undefined && (!Number.isFinite(preferredLeverage) || preferredLeverage <= 0 || preferredLeverage > 1_000)) {
      return json({ error: "Invalid preferred leverage", code: "AI_REQUEST_REJECTED", executionEnabled: false }, 400);
    }

    const result = await requestGroqPerpProposal({
      market: marketMeta.symbol,
      side,
      risk,
      accountBalanceUsd,
      entryPrice,
      preferredMarginUsd,
      preferredLeverage,
    });
    return json({ ...result, source: "horris-ai", note: "AI proposal only. Deterministic Horris policy remains authoritative and execution stays locked." }, 200, { "X-RateLimit-Remaining": String(limit.remaining) });
  } catch (error) {
    if (error instanceof HttpRequestSafetyError) {
      return json({ error: error.message, code: error.code, executionEnabled: false }, error.status);
    }
    if (error instanceof AiAdvisorUnavailableError) {
      return json({
        error: "Horris AI is temporarily unavailable",
        code: error.code,
        retryable: error.retryable,
        executionEnabled: false,
      }, error.code === "AI_NOT_CONFIGURED" || error.code === "AI_PROVIDER_AUTH" || error.code === "AI_INVALID_MODEL_CONFIG" ? 503 : 502);
    }
    return json({ error: "Advisor request rejected", code: "ADVISOR_REJECTED", executionEnabled: false }, 400);
  }
}
