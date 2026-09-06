import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { handleDiscordCommand, isHorrisRisk } from "../../../lib/discord";

export const runtime = "nodejs";

function hexToBytes(value: string) {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) throw new Error("Invalid hex");
  return Uint8Array.from(value.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function verifyDiscordRequest(rawBody: string, request: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return process.env.NODE_ENV !== "production";

  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;

  try {
    const message = new TextEncoder().encode(timestamp + rawBody);
    return nacl.sign.detached.verify(message, hexToBytes(signature), hexToBytes(publicKey));
  } catch {
    return false;
  }
}

function optionMap(options: unknown) {
  const result: Record<string, unknown> = {};
  if (!Array.isArray(options)) return result;
  for (const option of options) {
    if (option && typeof option === "object") {
      const entry = option as Record<string, unknown>;
      if (typeof entry.name === "string") result[entry.name] = entry.value;
    }
  }
  return result;
}

function discordResponse(content: string, status = 200) {
  return NextResponse.json({ type: 4, data: { content, flags: 64 } }, { status });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyDiscordRequest(rawBody, request)) {
    return NextResponse.json({ error: "Invalid Discord signature." }, { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid interaction payload." }, { status: 400 });

  const input = body as Record<string, unknown>;
  if (input.type === 1) return NextResponse.json({ type: 1 });

  // Real Discord application-command payload.
  if (input.type === 2 && input.data && typeof input.data === "object") {
    const data = input.data as Record<string, unknown>;
    const name = data.name;
    if (name === "help") return discordResponse(handleDiscordCommand({ name: "help" }).content);
    if (name !== "strategy" && name !== "risk") return discordResponse("Unknown Horris command.");

    const options = optionMap(data.options);
    if (!isHorrisRisk(options.risk)) return discordResponse("Risk must be Conservative, Balanced, or Aggressive.");
    const amount = Number(options.amount);
    const balance = Number(options.balance);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance < 0) {
      return discordResponse("Amount must be positive and balance must be a valid non-negative number.");
    }
    return discordResponse(handleDiscordCommand({ name, amount, balance, risk: options.risk }).content);
  }

  // Development-only compact payload used for local API testing.
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Unsupported Discord interaction." }, { status: 400 });
  const name = input.name;
  if (name === "help") return NextResponse.json(handleDiscordCommand({ name: "help" }));
  if (name !== "strategy" && name !== "risk") return NextResponse.json({ content: "Unknown Horris command." }, { status: 400 });
  if (!isHorrisRisk(input.risk)) return NextResponse.json({ content: "Risk must be Conservative, Balanced, or Aggressive." }, { status: 400 });
  const amount = Number(input.amount); const balance = Number(input.balance);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance < 0) return NextResponse.json({ content: "Invalid amount or balance." }, { status: 400 });
  return NextResponse.json(handleDiscordCommand({ name, amount, balance, risk: input.risk }));
}
