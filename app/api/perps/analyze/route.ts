import { NextRequest, NextResponse } from "next/server";
import { analyzePerpIntent, perpRiskPolicy, type PerpIntent, type PerpRiskProfile, type PerpSide } from "../../../../lib/perps";
import { getUpDownMarket } from "../../../../lib/updown";

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const sides: PerpSide[] = ["long", "short"];

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 16_384) return json({ error: "Request body too large" }, 413);

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>;

    const market = String(input.market ?? "");
    const side = String(input.side ?? "") as PerpSide;
    const risk = String(input.risk ?? "") as PerpRiskProfile;
    const marginUsd = Number(input.marginUsd);
    const leverage = Number(input.leverage);
    const accountBalanceUsd = Number(input.accountBalanceUsd);
    const entryPrice = Number(input.entryPrice);
    const stopLoss = Number(input.stopLoss);
    const takeProfit = input.takeProfit === undefined || input.takeProfit === null || input.takeProfit === "" ? undefined : Number(input.takeProfit);

    const venueMarket = getUpDownMarket(market);
    if (!venueMarket) return json({ error: "Unsupported UpDown market" }, 400);
    if (!sides.includes(side)) return json({ error: "Side must be long or short" }, 400);
    if (!risks.includes(risk)) return json({ error: "Invalid Horris risk profile" }, 400);

    const intent: PerpIntent = { market: venueMarket.symbol, side, risk, marginUsd, leverage, accountBalanceUsd, entryPrice, stopLoss, takeProfit };
    const analysis = analyzePerpIntent(intent);

    return json({
      venue: "UpDown",
      executionEnabled: false,
      venueMarket,
      policy: perpRiskPolicy[risk],
      intent,
      analysis,
      nextStep: analysis.approved
        ? "Risk checks passed. Venue execution remains disabled until the Horris UpDown adapter is independently verified and guarded onchain."
        : "Trade blocked by Horris risk policy.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Perpetual analysis failed" }, 400);
  }
}
