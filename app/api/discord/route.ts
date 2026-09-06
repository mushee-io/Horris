import { NextRequest, NextResponse } from "next/server";
import { handleDiscordCommand, isHorrisRisk } from "../../../lib/discord";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ content: "Invalid JSON request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ content: "Invalid Horris command payload." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = input.name;
  if (name === "help") return NextResponse.json(handleDiscordCommand({ name: "help" }));
  if (name !== "strategy" && name !== "risk") {
    return NextResponse.json({ content: "Unknown Horris command." }, { status: 400 });
  }

  if (!isHorrisRisk(input.risk)) {
    return NextResponse.json({ content: "Risk must be Conservative, Balanced, or Aggressive." }, { status: 400 });
  }

  const amount = Number(input.amount);
  const balance = Number(input.balance);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({ content: "Amount must be positive and balance must be a valid non-negative number." }, { status: 400 });
  }

  return NextResponse.json(handleDiscordCommand({ name, amount, balance, risk: input.risk }));
}
