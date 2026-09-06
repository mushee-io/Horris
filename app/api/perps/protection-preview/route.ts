import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getUpDownPositions } from "../../../../lib/updown-positions";
import { getUpDownOrders } from "../../../../lib/updown-orders";
import { buildUnsignedUpDownProtectionPlan, type UpDownProtectionKind } from "../../../../lib/updown-protection";
import { estimateUpDownDecreaseExecutionFee, getUpDownOraclePrice } from "../../../../lib/updown-live";
import { encodeUnsignedUpDownProtectionMulticall } from "../../../../lib/updown-calldata";
import { simulateUnsignedUpDownTransaction } from "../../../../lib/updown-simulate";

function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
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

    const [positions, orders, oracle] = await Promise.all([
      getUpDownPositions(account as Address), getUpDownOrders(account as Address), getUpDownOraclePrice(marketToken as Address),
    ]);
    const matches = positions.filter((position) => position.marketToken.toLowerCase() === marketToken && position.side === side);
    if (matches.length === 0) return json({ error: "No matching live UpDown position exists", failClosed: true }, 409);
    if (matches.length > 1) return json({ error: "Multiple matching positions require collateral disambiguation", failClosed: true }, 409);
    const position = matches[0];
    const positionSizeUsd = Number(position.sizeUsd);
    if (!Number.isFinite(positionSizeUsd) || positionSizeUsd <= 0) return json({ error: "Live UpDown position size is invalid", failClosed: true }, 409);

    const oracleMid = Number(oracle.mid);
    if (!Number.isFinite(oracleMid) || oracleMid <= 0) return json({ error: "Live UpDown oracle mid-price is invalid", failClosed: true }, 502);
    const triggerDirectionValid = kind === "stop-loss"
      ? (side === "long" ? triggerPrice < oracleMid : triggerPrice > oracleMid)
      : (side === "long" ? triggerPrice > oracleMid : triggerPrice < oracleMid);
    if (!triggerDirectionValid) {
      return json({ error: `${kind === "stop-loss" ? "Stop-loss" : "Take-profit"} trigger is on the wrong side of the live UpDown oracle price`, failClosed: true, oracle, triggerPrice }, 409);
    }

    const targetOrderType = kind === "stop-loss" ? 6 : 5;
    const activeExisting = orders.filter((order) => order.marketToken.toLowerCase() === marketToken && order.side === side && order.orderType === targetOrderType && !order.isFrozen);
    const coveredUsd = activeExisting.reduce((sum, order) => sum + Math.max(0, Number(order.sizeUsd)), 0);
    const uncoveredUsd = Math.max(0, positionSizeUsd - coveredUsd);
    const coveragePercent = Math.min(100, coveredUsd / positionSizeUsd * 100);
    if (uncoveredUsd <= Math.max(0.01, positionSizeUsd * 0.005)) {
      return json({ error: `${kind === "stop-loss" ? "Stop-loss" : "Take-profit"} coverage is already sufficient`, failClosed: true, coveragePercent, coveredUsd, uncoveredUsd }, 409);
    }

    const [plan, fee] = await Promise.all([
      Promise.resolve(buildUnsignedUpDownProtectionPlan(position, account as Address, kind, triggerPrice, acceptablePriceSlippageBps, uncoveredUsd)),
      estimateUpDownDecreaseExecutionFee(),
    ]);
    const transaction = encodeUnsignedUpDownProtectionMulticall(plan, fee.bufferedFeeWei);
    let simulation;
    try {
      simulation = await simulateUnsignedUpDownTransaction(account as Address, transaction);
    } catch (error) {
      return json(serialize({
        error: "Exact UpDown protection eth_call simulation reverted",
        detail: error instanceof Error ? error.message : "Unknown simulation failure",
        oracle,
        existingProtection: { kind, activeOrderCount: activeExisting.length, coveredUsd, uncoveredUsd, coveragePercent },
        unsignedTransaction: transaction,
        executionEnabled: false,
        failClosed: true,
      }), 409);
    }

    return json(serialize({
      venue: "UpDown", chainId: 42220, account, position, oracle,
      existingProtection: { kind, activeOrderCount: activeExisting.length, coveredUsd, uncoveredUsd, coveragePercent },
      protection: plan, liveExecutionFee: fee, unsignedTransaction: transaction, simulation, compiledAt: new Date().toISOString(),
      executionEnabled: false, failClosed: true,
      nextStep: "Exact protection calldata passed live eth_call simulation. Review only; submission remains disabled.",
    }));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Protection preview failed", executionEnabled: false, failClosed: true }, 502);
  }
}
