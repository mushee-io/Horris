import { NextRequest, NextResponse } from "next/server";
import { getUpDownOraclePrice } from "../../../../lib/updown-live";
import { getUpDownMarket } from "../../../../lib/updown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const rawMarket = (request.nextUrl.searchParams.get("market") ?? "").slice(0, 40);
    const market = getUpDownMarket(rawMarket);
    if (!market) return json({ error: "Unsupported UpDown market", readOnly: true, executionEnabled: false }, 400);

    const price = await getUpDownOraclePrice(market.marketToken);
    return json({
      venue: "UpDown",
      chainId: 42220,
      market: market.symbol,
      quoteSymbol: market.quoteSymbol,
      price,
      authority: "updown-live-oracle",
      readOnly: true,
      executionEnabled: false
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "UpDown market price read failed",
      readOnly: true,
      executionEnabled: false
    }, 502);
  }
}
