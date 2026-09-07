import { NextRequest, NextResponse } from "next/server";
import { requestGroqPerpProposal, AiAdvisorUnavailableError } from "../../../../lib/groq-perp-advisor";
import type { PerpRiskProfile, PerpSide } from "../../../../lib/perps";
import { getUpDownMarket } from "../../../../lib/updown";

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const sides: PerpSide[] = ["long", "short"];
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } }); }

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0"); if (Number.isFinite(length) && length > 8_192) return json({ error: "Request body too large", executionEnabled: false }, 413);
    const body: unknown = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body", executionEnabled: false }, 400);
    const input = body as Record<string, unknown>; const market = String(input.market ?? ""); const side = String(input.side ?? "") as PerpSide; const risk = String(input.risk ?? "") as PerpRiskProfile;
    if (!getUpDownMarket(market)) return json({ error: "Unsupported UpDown market", executionEnabled: false }, 400); if (!sides.includes(side)) return json({ error: "Side must be long or short", executionEnabled: false }, 400); if (!risks.includes(risk)) return json({ error: "Invalid Horris risk profile", executionEnabled: false }, 400);
    const accountBalanceUsd = Number(input.accountBalanceUsd); const entryPrice = Number(input.entryPrice); if (!Number.isFinite(accountBalanceUsd) || accountBalanceUsd <= 0 || accountBalanceUsd > 1_000_000_000 || !Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice > 1_000_000_000) return json({ error: "Valid positive account balance and entry price are required", executionEnabled: false }, 400);
    const preferredMarginUsd = input.preferredMarginUsd === undefined || input.preferredMarginUsd === "" ? undefined : Number(input.preferredMarginUsd); const preferredLeverage = input.preferredLeverage === undefined || input.preferredLeverage === "" ? undefined : Number(input.preferredLeverage);
    if (preferredMarginUsd !== undefined && (!Number.isFinite(preferredMarginUsd) || preferredMarginUsd <= 0)) return json({ error: "Invalid preferred margin", executionEnabled: false }, 400);
    if (preferredLeverage !== undefined && (!Number.isFinite(preferredLeverage) || preferredLeverage <= 0)) return json({ error: "Invalid preferred leverage", executionEnabled: false }, 400);
    const result = await requestGroqPerpProposal({ market, side, risk, accountBalanceUsd, entryPrice, preferredMarginUsd, preferredLeverage });
    return json({ ...result, source: "horris-ai", note: "AI proposal only. Deterministic Horris policy remains authoritative and execution stays locked." });
  } catch (error) {
    const unavailable = error instanceof AiAdvisorUnavailableError;
    return json({ error: unavailable ? "Horris AI is temporarily unavailable" : "Advisor request rejected", code: unavailable ? error.code : "ADVISOR_REJECTED", executionEnabled: false }, unavailable ? 503 : 400);
  }
}
