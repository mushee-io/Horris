import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { buildUnsignedUpDownIncreaseOrderPlan } from "../../../../lib/updown-order";
import { encodeUnsignedUpDownMulticall } from "../../../../lib/updown-calldata";
import { getUpDownEntryReadiness } from "../../../../lib/updown-readiness";
import { simulateUnsignedUpDownTransaction } from "../../../../lib/updown-simulate";
import type { PerpIntent, PerpRiskProfile, PerpSide } from "../../../../lib/perps";
import { getUpDownMarket } from "../../../../lib/updown";

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const sides: PerpSide[] = ["long", "short"];
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
    const market = String(input.market ?? "");
    const side = String(input.side ?? "") as PerpSide;
    const risk = String(input.risk ?? "") as PerpRiskProfile;
    const receiver = String(input.receiver ?? "") as Address;
    const acceptablePriceSlippageBps = input.acceptablePriceSlippageBps === undefined ? 50 : Number(input.acceptablePriceSlippageBps);
    const marketMeta = getUpDownMarket(market);
    if (!marketMeta) return json({ error: "Unsupported UpDown market" }, 400);
    if (!sides.includes(side)) return json({ error: "Side must be long or short" }, 400);
    if (!risks.includes(risk)) return json({ error: "Invalid Horris risk profile" }, 400);

    const takeProfit = input.takeProfit === undefined || input.takeProfit === null || input.takeProfit === "" ? undefined : Number(input.takeProfit);
    const intent: PerpIntent = {
      market, side, risk,
      marginUsd: Number(input.marginUsd), leverage: Number(input.leverage), accountBalanceUsd: Number(input.accountBalanceUsd),
      entryPrice: Number(input.entryPrice), stopLoss: Number(input.stopLoss), takeProfit,
    };
    const plan = buildUnsignedUpDownIncreaseOrderPlan(intent, receiver, acceptablePriceSlippageBps);
    const readiness = await getUpDownEntryReadiness(receiver, marketMeta.marketToken, plan.params.numbers.initialCollateralDeltaAmount);
    const transaction = encodeUnsignedUpDownMulticall(plan, readiness.requiredExecutionFee);

    let simulation: unknown;
    if (!readiness.readyForSimulation) {
      simulation = {
        success: false,
        skipped: true,
        reason: "Hard readiness checks failed; exact eth_call is intentionally skipped.",
      };
    } else if (readiness.approvalRequired) {
      simulation = {
        success: false,
        skipped: true,
        reason: "Router approval is required before the exact entry multicall can be simulated against live state.",
      };
    } else {
      try {
        simulation = await simulateUnsignedUpDownTransaction(receiver, transaction);
      } catch (error) {
        simulation = {
          success: false,
          skipped: false,
          reverted: true,
          reason: error instanceof Error ? error.message : "Unknown simulation failure",
        };
      }
    }

    const preflightPassed = readiness.readyForSimulation && !readiness.approvalRequired && (simulation as { success?: boolean }).success === true;
    return json(serialize({
      ...plan,
      liveExecutionFee: { bufferedFeeWei: readiness.requiredExecutionFee, bufferedFeeCelo: readiness.requiredExecutionFeeCelo, source: "live-readiness" },
      params: { ...plan.params, numbers: { ...plan.params.numbers, executionFee: readiness.requiredExecutionFee } },
      unsignedTransaction: transaction,
      readiness,
      simulation,
      preflightPassed,
      requiresLiveExecutionFee: false,
      feeResolvedAt: new Date().toISOString(),
      executionEnabled: false,
      failClosed: true,
      nextStep: preflightPassed
        ? "Exact entry calldata passed live eth_call simulation. Submission remains disabled until the protected execution sequence is completed."
        : readiness.approvalRequired
          ? "Preview compiled. Explicit Router approval is still required; submission remains disabled."
          : "Preview compiled, but live readiness/simulation is not clean. Resolve failed checks before any future signing path.",
    }));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Order preview failed", executionEnabled: false, failClosed: true }, 400);
  }
}
