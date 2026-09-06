import { NextRequest, NextResponse } from "next/server";
import { simulatePolicy } from "../../../lib/policy";
import { proposeStableStrategy } from "../../../lib/strategy";
import { isHorrisRisk } from "../../../lib/discord";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 16_384) return json({ error: "Request body too large" }, 413);

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>;
    const amount = Number(input.amount);
    const balance = Number(input.balance);

    if (!isHorrisRisk(input.risk)) return json({ error: "Invalid risk profile" }, 400);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Amount must be a positive number" }, 400);
    if (!Number.isFinite(balance) || balance < 0) return json({ error: "Balance must be a non-negative number" }, 400);

    const proposal = proposeStableStrategy(amount, input.risk);
    const simulation = simulatePolicy(proposal, balance, input.risk);
    return json({ proposal, simulation });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Strategy generation failed" }, 400);
  }
}
