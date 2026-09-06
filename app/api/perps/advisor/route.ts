import { NextRequest, NextResponse } from "next/server";
import { proposeBoundedPerpIntent } from "../../../../lib/perp-advisor";
import type { PerpRiskProfile, PerpSide } from "../../../../lib/perps";
import { getUpDownMarket } from "../../../../lib/updown";

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const sides: PerpSide[] = ["long", "short"];
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0"); if (Number.isFinite(length) && length > 8_192) return json({ error: "Request body too large" }, 413);
    const body: unknown = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>; const market = String(input.market ?? ""); const side = String(input.side ?? "") as PerpSide; const risk = String(input.risk ?? "") as PerpRiskProfile;
    if (!getUpDownMarket(market)) return json({ error: "Unsupported UpDown market" }, 400); if (!sides.includes(side)) return json({ error: "Side must be long or short" }, 400); if (!risks.includes(risk)) return json({ error: "Invalid Horris risk profile" }, 400);
    const accountBalanceUsd = Number(input.accountBalanceUsd); const entryPrice = Number(input.entryPrice); if (!Number.isFinite(accountBalanceUsd) || accountBalanceUsd <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) return json({ error: "Positive account balance and entry price are required" }, 400);
    const preferredMarginUsd = input.preferredMarginUsd === undefined || input.preferredMarginUsd === "" ? undefined : Number(input.preferredMarginUsd); const preferredLeverage = input.preferredLeverage === undefined || input.preferredLeverage === "" ? undefined : Number(input.preferredLeverage);
    const proposal = proposeBoundedPerpIntent({ market, side, risk, accountBalanceUsd, entryPrice, preferredMarginUsd, preferredLeverage });
    return json({ proposal, executionEnabled: false, source: "deterministic-horris", note: "Bounded planning only. A future model may propose inputs, but deterministic Horris policy remains authoritative." });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Advisor failed", executionEnabled: false }, 400); }
}
