import { NextRequest, NextResponse } from "next/server";
import { handleDiscordCommand } from "../../../lib/discord";
import type { HorrisRisk } from "../../../lib/mento";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = body.name as "strategy" | "risk" | "help";

  if (name === "help") return NextResponse.json(handleDiscordCommand({ name: "help" }));
  if (name !== "strategy" && name !== "risk") return NextResponse.json({ content: "Unknown Horris command." }, { status: 400 });

  const risk = body.risk as HorrisRisk;
  const amount = Number(body.amount);
  const balance = Number(body.balance);
  if (!Number.isFinite(amount) || !Number.isFinite(balance)) return NextResponse.json({ content: "Invalid amount or balance." }, { status: 400 });

  return NextResponse.json(handleDiscordCommand({ name, amount, balance, risk }));
}
