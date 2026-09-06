import { NextRequest, NextResponse } from "next/server";
import { simulatePolicy } from "../../../lib/policy";
import { proposeStableStrategy } from "../../../lib/strategy";
import type { HorrisRisk } from "../../../lib/mento";

const risks: HorrisRisk[] = ["Conservative", "Balanced", "Aggressive"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);
    const balance = Number(body.balance);
    const risk = body.risk as HorrisRisk;

    if (!risks.includes(risk)) return NextResponse.json({ error: "Invalid risk profile" }, { status: 400 });
    if (!Number.isFinite(amount) || !Number.isFinite(balance)) return NextResponse.json({ error: "Invalid amount or balance" }, { status: 400 });

    const proposal = proposeStableStrategy(amount, risk);
    const simulation = simulatePolicy(proposal, balance, risk);
    return NextResponse.json({ proposal, simulation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Strategy generation failed" }, { status: 400 });
  }
}
