import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { buildUnsignedUpDownIncreaseOrderPlan } from "../../../../lib/updown-order";
import { encodeUnsignedUpDownMulticall } from "../../../../lib/updown-calldata";
import { getUpDownEntryReadiness } from "../../../../lib/updown-readiness";
import { simulateUnsignedUpDownTransaction } from "../../../../lib/updown-simulate";
import { buildUpDownAuthorizationTypedData } from "../../../../lib/updown-authorization";
import { derivePerpExecutionGate } from "../../../../lib/perp-execution-gate";
import { analyzePerpIntent, type PerpIntent, type PerpRiskProfile, type PerpSide } from "../../../../lib/perps";
import { getUpDownMarket } from "../../../../lib/updown";

const risks: PerpRiskProfile[] = ["Conservative", "Balanced", "Aggressive"];
const sides: PerpSide[] = ["long", "short"];
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
function serialize(value: unknown): unknown { if (typeof value === "bigint") return value.toString(); if (Array.isArray(value)) return value.map(serialize); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)])); return value; }

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 16_384) return json({ error: "Request body too large" }, 413);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>;
    const market = String(input.market ?? ""); const side = String(input.side ?? "") as PerpSide; const risk = String(input.risk ?? "") as PerpRiskProfile; const receiver = String(input.receiver ?? "") as Address;
    const acceptablePriceSlippageBps = input.acceptablePriceSlippageBps === undefined ? 50 : Number(input.acceptablePriceSlippageBps);
    const marketMeta = getUpDownMarket(market);
    if (!marketMeta) return json({ error: "Unsupported UpDown market" }, 400); if (!sides.includes(side)) return json({ error: "Side must be long or short" }, 400); if (!risks.includes(risk)) return json({ error: "Invalid Horris risk profile" }, 400); if (!isAddress(receiver)) return json({ error: "A valid receiver address is required" }, 400);
    const takeProfit = input.takeProfit === undefined || input.takeProfit === null || input.takeProfit === "" ? undefined : Number(input.takeProfit);
    const intent: PerpIntent = { market, side, risk, marginUsd: Number(input.marginUsd), leverage: Number(input.leverage), accountBalanceUsd: Number(input.accountBalanceUsd), entryPrice: Number(input.entryPrice), stopLoss: Number(input.stopLoss), takeProfit };
    const riskAnalysis = analyzePerpIntent(intent);
    const plan = buildUnsignedUpDownIncreaseOrderPlan(intent, receiver, acceptablePriceSlippageBps);
    const readiness = await getUpDownEntryReadiness(receiver, marketMeta.marketToken, plan.params.numbers.initialCollateralDeltaAmount);
    const transaction = encodeUnsignedUpDownMulticall(plan, readiness.requiredExecutionFee);
    let simulation: unknown;
    if (!readiness.readyForSimulation) simulation = { success: false, skipped: true, reason: "Hard readiness checks failed; exact eth_call is intentionally skipped." };
    else if (readiness.approvalRequired) simulation = { success: false, skipped: true, reason: "Router approval is required before the exact entry multicall can be simulated against live state." };
    else { try { simulation = await simulateUnsignedUpDownTransaction(receiver, transaction); } catch (error) { simulation = { success: false, skipped: false, reverted: true, reason: error instanceof Error ? error.message : "Unknown simulation failure" }; } }
    const preflightPassed = readiness.readyForSimulation && !readiness.approvalRequired && (simulation as { success?: boolean }).success === true;
    const authorizationContract = process.env.HORRIS_UPDOWN_AUTHORIZATION;
    let authorizationPreview: unknown = { available: false, reason: preflightPassed ? "HORRIS_UPDOWN_AUTHORIZATION is not configured with a valid deployed authorization contract." : "Authorization payload is withheld until the exact transaction passes live preflight." };
    let authorizationAvailable = false;
    if (riskAnalysis.approved && preflightPassed && authorizationContract && isAddress(authorizationContract)) {
      const nonce = BigInt(`0x${randomBytes(32).toString("hex")}`); const deadline = BigInt(Math.floor(Date.now() / 1_000) + 10 * 60);
      const typedData = buildUpDownAuthorizationTypedData({ authorizationContract, calldataHash: transaction.calldataHash, receiver, market: marketMeta.marketToken, accountBalanceUsd: String(input.accountBalanceUsd ?? ""), entryPrice: intent.entryPrice, stopLoss: intent.stopLoss, nonce, deadline });
      authorizationAvailable = true;
      authorizationPreview = { available: true, typedData, expiresAt: new Date(Number(deadline) * 1_000).toISOString(), signingEnabled: false, submissionEnabled: false, note: "Review-only EIP-712 payload. Horris does not request a signature or submit the UpDown transaction in the current MVP." };
    }
    const executionGate = derivePerpExecutionGate({ risk: riskAnalysis, preflightPassed, authorizationAvailable, authorizationSimulationPassed: false, signingEnabled: false, submissionEnabled: false });
    return json(serialize({ ...plan, riskAnalysis, liveExecutionFee: { bufferedFeeWei: readiness.requiredExecutionFee, bufferedFeeCelo: readiness.requiredExecutionFeeCelo, source: "live-readiness" }, params: { ...plan.params, numbers: { ...plan.params.numbers, executionFee: readiness.requiredExecutionFee } }, unsignedTransaction: transaction, readiness, simulation, preflightPassed, authorizationPreview, executionGate, requiresLiveExecutionFee: false, feeResolvedAt: new Date().toISOString(), executionEnabled: false, failClosed: true, nextStep: executionGate.stage === "risk-blocked" ? "Horris risk policy rejected this entry. Change the trade intent before any authorization can be generated." : preflightPassed ? "Exact entry calldata passed live eth_call simulation. Review-only authorization may be available; signing and submission remain locked." : readiness.approvalRequired ? "Preview compiled. Explicit Router approval is still required; submission remains disabled." : "Preview compiled, but live readiness/simulation is not clean. Resolve failed checks before any future signing path." }));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Order preview failed", executionEnabled: false, failClosed: true }, 400); }
}
