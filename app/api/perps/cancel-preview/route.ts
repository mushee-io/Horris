import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getUpDownOrders } from "../../../../lib/updown-orders";
import { getUpDownPositions } from "../../../../lib/updown-positions";
import { buildUnsignedUpDownCancelPlan, type UnsignedUpDownCancelPlan } from "../../../../lib/updown-cancel";
import { simulateUnsignedUpDownTransaction } from "../../../../lib/updown-simulate";

function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>;
    const account = String(input.account ?? "");
    const orderKey = String(input.orderKey ?? "").toLowerCase();
    const reason = String(input.reason ?? "manual-review") as UnsignedUpDownCancelPlan["reason"];

    if (!isAddress(account)) return json({ error: "A valid account address is required" }, 400);
    if (!/^0x[0-9a-f]{64}$/.test(orderKey)) return json({ error: "A valid 32-byte order key is required" }, 400);
    if (!["frozen-order", "pending-increase", "orphan-stop", "manual-review"].includes(reason)) return json({ error: "Invalid cancellation reason" }, 400);

    const [orders, positions] = await Promise.all([getUpDownOrders(account as Address), getUpDownPositions(account as Address)]);
    const order = orders.find((item) => item.key.toLowerCase() === orderKey);
    if (!order) return json({ error: "Order is no longer pending on UpDown", failClosed: true }, 409);
    if (reason === "orphan-stop") {
      const hasMatchingPosition = positions.some((position) => position.marketToken.toLowerCase() === order.marketToken.toLowerCase() && position.side === order.side);
      if (order.orderType !== 6 || hasMatchingPosition) return json({ error: "Stop-loss is not orphaned on the latest UpDown state", failClosed: true }, 409);
    }

    const plan = buildUnsignedUpDownCancelPlan(order, reason);
    let simulation;
    try { simulation = await simulateUnsignedUpDownTransaction(account as Address, plan); }
    catch (error) {
      return json({ error: "Exact UpDown cancellation eth_call simulation reverted", detail: error instanceof Error ? error.message : "Unknown simulation failure", ...plan, value: plan.value.toString(), executionEnabled: false, failClosed: true }, 409);
    }

    return json({ ...plan, value: plan.value.toString(), simulation: { ...simulation, value: simulation.value.toString() }, compiledAt: new Date().toISOString(), failClosed: true });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Cancellation preview failed", executionEnabled: false, failClosed: true }, 502); }
}
