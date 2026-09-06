import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { confirmUpDownEntryFromState } from "../../../../lib/updown-confirmation";
import { getUpDownOrders } from "../../../../lib/updown-orders";
import { getUpDownPositions } from "../../../../lib/updown-positions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const account = request.nextUrl.searchParams.get("account") ?? "";
    const marketToken = request.nextUrl.searchParams.get("marketToken") ?? "";
    const side = request.nextUrl.searchParams.get("side") ?? "";
    const expectedNotionalUsd = Number(request.nextUrl.searchParams.get("expectedNotionalUsd") ?? "");
    if (!isAddress(account)) return json({ error: "A valid account address is required" }, 400);
    if (!isAddress(marketToken)) return json({ error: "A valid market token is required" }, 400);
    if (side !== "long" && side !== "short") return json({ error: "Side must be long or short" }, 400);
    if (!Number.isFinite(expectedNotionalUsd) || expectedNotionalUsd <= 0) return json({ error: "Expected notional must be positive" }, 400);

    const [positions, orders] = await Promise.all([
      getUpDownPositions(account as Address),
      getUpDownOrders(account as Address),
    ]);
    const confirmation = confirmUpDownEntryFromState(marketToken, side, expectedNotionalUsd, positions, orders);
    return json({ venue: "UpDown", chainId: 42220, account, confirmation, readOnly: true, executionEnabled: false });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Entry confirmation failed", readOnly: true, executionEnabled: false, failClosed: true }, 502);
  }
}
