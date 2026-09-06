import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getUpDownOrders } from "../../../../lib/updown-orders";
import { buildUnsignedUpDownCancelPlan, type UnsignedUpDownCancelPlan } from "../../../../lib/updown-cancel";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

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
    if (!["frozen-order", "pending-increase", "manual-review"].includes(reason)) return json({ error: "Invalid cancellation reason" }, 400);

    // Re-read the venue order. Never compile a cancellation from client-supplied order metadata.
    const orders = await getUpDownOrders(account as Address);
    const order = orders.find((item) => item.key.toLowerCase() === orderKey);
    if (!order) return json({ error: "Order is no longer pending on UpDown", failClosed: true }, 409);

    const plan = buildUnsignedUpDownCancelPlan(order, reason);
    return json({ ...plan, value: plan.value.toString(), compiledAt: new Date().toISOString(), failClosed: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Cancellation preview failed", executionEnabled: false, failClosed: true }, 502);
  }
}
