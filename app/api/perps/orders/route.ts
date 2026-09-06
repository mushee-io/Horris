import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getUpDownOrders } from "../../../../lib/updown-orders";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const account = request.nextUrl.searchParams.get("account") ?? "";
    if (!isAddress(account)) return json({ error: "A valid account address is required" }, 400);
    const orders = await getUpDownOrders(account as Address);
    return json({
      venue: "UpDown",
      chainId: 42220,
      account,
      orderCount: orders.length,
      orders,
      readOnly: true,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Order read failed", readOnly: true }, 502);
  }
}
