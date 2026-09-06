import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getUpDownPositions } from "../../../../lib/updown-positions";
import { buildUnsignedUpDownProtectionPlan, type UpDownProtectionKind } from "../../../../lib/updown-protection";
import { estimateUpDownDecreaseExecutionFee } from "../../../../lib/updown-live";
import { encodeUnsignedUpDownProtectionMulticall } from "../../../../lib/updown-calldata";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 16_384) return json({ error: "Request body too large" }, 413);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>;

    const account = String(input.account ?? "");
    const marketToken = String(input.marketToken ?? "").toLowerCase();
    const side = String(input.side ?? "");
    const kind = String(input.kind ?? "") as UpDownProtectionKind;
    const triggerPrice = Number(input.triggerPrice);
    const acceptablePriceSlippageBps = input.acceptablePriceSlippageBps === undefined ? 100 : Number(input.acceptablePriceSlippageBps);

    if (!isAddress(account)) return json({ error: "A valid account address is required" }, 400);
    if (!isAddress(marketToken)) return json({ error: "A valid market token is required" }, 400);
    if (side !== "long" && side !== "short") return json({ error: "Side must be long or short" }, 400);
    if (kind !== "stop-loss" && kind !== "take-profit") return json({ error: "Protection kind must be stop-loss or take-profit" }, 400);
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) return json({ error: "A positive trigger price is required" }, 400);

    // Never trust a client-supplied size/collateral tuple. Re-read the live position and compile from venue state.
    const positions = await getUpDownPositions(account as Address);
    const matches = positions.filter((position) => position.marketToken.toLowerCase() === marketToken && position.side === side);
    if (matches.length === 0) return json({ error: "No matching live UpDown position exists", failClosed: true }, 409);
    if (matches.length > 1) return json({ error: "Multiple matching positions require collateral disambiguation", failClosed: true }, 409);

    const position = matches[0];
    const [plan, fee] = await Promise.all([
      Promise.resolve(buildUnsignedUpDownProtectionPlan(position, account as Address, kind, triggerPrice, acceptablePriceSlippageBps)),
      estimateUpDownDecreaseExecutionFee(),
    ]);
    const transaction = encodeUnsignedUpDownProtectionMulticall(plan, fee.bufferedFeeWei);

    return json(serialize({
      venue: "UpDown",
      chainId: 42220,
      account,
      position,
      protection: plan,
      liveExecutionFee: fee,
      unsignedTransaction: transaction,
      compiledAt: new Date().toISOString(),
      executionEnabled: false,
      failClosed: true,
      nextStep: "Review only. Horris will not submit this protection order from the current MVP.",
    }));
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Protection preview failed",
      executionEnabled: false,
      failClosed: true,
    }, 502);
  }
}
