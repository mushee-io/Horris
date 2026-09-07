import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { analyzePerpRiskState } from "../../../../lib/perp-monitor";
import { derivePerpProtectionSequence } from "../../../../lib/perp-sequence";
import type { PerpRiskProfile } from "../../../../lib/perps";
import { getUpDownOrders } from "../../../../lib/updown-orders";
import { getUpDownPositions } from "../../../../lib/updown-positions";

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: NextRequest) {
  try {
    const account = request.nextUrl.searchParams.get("account") ?? "";
    const riskParam = request.nextUrl.searchParams.get("risk") ?? "Balanced";
    if (!isAddress(account)) return json({ error: "A valid account address is required" }, 400);
    if (!risks.includes(riskParam as PerpRiskProfile)) return json({ error: "Invalid Horris risk profile" }, 400);

    const [positions, orders] = await Promise.all([
      getUpDownPositions(account as Address),
      getUpDownOrders(account as Address),
    ]);
    const riskState = analyzePerpRiskState(positions, orders, riskParam as PerpRiskProfile);
    const sequences = positions.map((position) => derivePerpProtectionSequence(position.marketToken, position.side, positions, orders));
    const freezeNewRisk = positions.length > 0 && (riskState.criticalCount > 0 || riskState.protections.some((item) => !item.fullyStopProtected || item.hasFrozenStop));

    return json({
      venue: "UpDown",
      chainId: 42220,
      account,
      positions,
      orders,
      riskState,
      sequences,
      freezeNewRisk,
      authority: "horris-policy",
      readOnly: true,
      executionEnabled: false,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Risk-state read failed", readOnly: true, executionEnabled: false, freezeNewRisk: true }, 502);
  }
}
