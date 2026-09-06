import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { isAddress, type Address } from "viem";
import { handleDiscordCommand, isHorrisRisk, isPerpSide } from "../../../lib/discord";
import { getUpDownPositions } from "../../../lib/updown-positions";
import { getUpDownOrders } from "../../../lib/updown-orders";
import { derivePerpProtectionSequence } from "../../../lib/perp-sequence";

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
  try { return nacl.sign.detached.verify(new TextEncoder().encode(timestamp + rawBody), hexToBytes(signature), hexToBytes(publicKey)); }
  catch { return false; }
}
function optionMap(options: unknown) {
  const result: Record<string, unknown> = {};
  if (!Array.isArray(options)) return result;
  for (const option of options) if (option && typeof option === "object") {
    const entry = option as Record<string, unknown>;
    if (typeof entry.name === "string") result[entry.name] = entry.value;
  }
  return result;
}
function discordResponse(content: string, status = 200) { return NextResponse.json({ type: 4, data: { content, flags: 64 } }, { status }); }
function finitePositive(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined; }

async function perpStatus(account: Address) {
  const [positions, orders] = await Promise.all([getUpDownPositions(account), getUpDownOrders(account)]);
  if (positions.length === 0) {
    const frozen = orders.filter((order) => order.isFrozen).length;
    return `Horris PERP STATUS · no live UpDown positions · ${orders.length} pending order${orders.length === 1 ? "" : "s"}${frozen ? ` · ${frozen} frozen` : ""}. Read-only.`;
  }
  const lines = positions.slice(0, 5).map((position) => {
    const sequence = derivePerpProtectionSequence(position.marketToken, position.side, positions, orders);
    return `${position.market} ${position.side.toUpperCase()} · $${Number(position.sizeUsd).toFixed(2)} · stop ${sequence.stopCoveragePercent.toFixed(1)}% · ${sequence.phase.toUpperCase().replaceAll("-", " ")}`;
  });
  const extra = positions.length > 5 ? `\n+${positions.length - 5} more position(s)` : "";
  return `Horris PERP STATUS · ${positions.length} live position${positions.length === 1 ? "" : "s"}\n${lines.join("\n")}${extra}\nRead-only; no order submitted.`.slice(0, 1_900);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyDiscordRequest(rawBody, request)) return NextResponse.json({ error: "Invalid Discord signature." }, { status: 401 });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid interaction payload." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.type === 1) return NextResponse.json({ type: 1 });

  if (input.type === 2 && input.data && typeof input.data === "object") {
    const data = input.data as Record<string, unknown>;
    const name = data.name;
    if (name === "help") return discordResponse(handleDiscordCommand({ name: "help" }).content);
    const options = optionMap(data.options);

    if (name === "perp-status") {
      const account = String(options.account ?? "");
      if (!isAddress(account)) return discordResponse("A valid Celo wallet address is required.");
      try { return discordResponse(await perpStatus(account)); }
      catch (error) { return discordResponse(error instanceof Error ? error.message : "Live perp status failed."); }
    }

    if (name === "perp-risk") {
      if (!isHorrisRisk(options.risk) || !isPerpSide(options.side)) return discordResponse("Risk or side is invalid.");
      const balance = finitePositive(options.balance); const margin = finitePositive(options.margin); const leverage = finitePositive(options.leverage);
      const entry = finitePositive(options.entry); const stop = finitePositive(options.stop);
      const takeProfit = options.take_profit === undefined ? undefined : finitePositive(options.take_profit);
      const market = typeof options.market === "string" ? options.market : "";
      if (!balance || !margin || !leverage || !entry || !stop || !market || (options.take_profit !== undefined && !takeProfit)) return discordResponse("Perp inputs must be valid positive numbers and a supported market.");
      try { return discordResponse(handleDiscordCommand({ name, market, side: options.side, balance, margin, leverage, entry, stop, takeProfit, risk: options.risk }).content); }
      catch (error) { return discordResponse(error instanceof Error ? error.message : "Perp risk analysis failed."); }
    }

    if (name !== "strategy" && name !== "risk") return discordResponse("Unknown Horris command.");
    if (!isHorrisRisk(options.risk)) return discordResponse("Risk must be Conservative, Balanced, or Aggressive.");
    const amount = Number(options.amount); const balance = Number(options.balance);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance < 0) return discordResponse("Amount must be positive and balance must be a valid non-negative number.");
    return discordResponse(handleDiscordCommand({ name, amount, balance, risk: options.risk }).content);
  }

  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Unsupported Discord interaction." }, { status: 400 });
  const name = input.name;
  if (name === "help") return NextResponse.json(handleDiscordCommand({ name: "help" }));
  if (name === "perp-status") {
    const account = String(input.account ?? "");
    if (!isAddress(account)) return NextResponse.json({ content: "Invalid wallet address." }, { status: 400 });
    try { return NextResponse.json({ content: await perpStatus(account) }); }
    catch (error) { return NextResponse.json({ content: error instanceof Error ? error.message : "Live perp status failed." }, { status: 502 }); }
  }
  if (name === "perp-risk") {
    if (!isHorrisRisk(input.risk) || !isPerpSide(input.side)) return NextResponse.json({ content: "Invalid perp risk or side." }, { status: 400 });
    const balance = finitePositive(input.balance); const margin = finitePositive(input.margin); const leverage = finitePositive(input.leverage);
    const entry = finitePositive(input.entry); const stop = finitePositive(input.stop); const takeProfit = input.takeProfit === undefined ? undefined : finitePositive(input.takeProfit);
    const market = typeof input.market === "string" ? input.market : "";
    if (!balance || !margin || !leverage || !entry || !stop || !market || (input.takeProfit !== undefined && !takeProfit)) return NextResponse.json({ content: "Invalid perp inputs." }, { status: 400 });
    try { return NextResponse.json(handleDiscordCommand({ name, market, side: input.side, balance, margin, leverage, entry, stop, takeProfit, risk: input.risk })); }
    catch (error) { return NextResponse.json({ content: error instanceof Error ? error.message : "Perp risk analysis failed." }, { status: 400 }); }
  }
  if (name !== "strategy" && name !== "risk") return NextResponse.json({ content: "Unknown Horris command." }, { status: 400 });
  if (!isHorrisRisk(input.risk)) return NextResponse.json({ content: "Risk must be Conservative, Balanced, or Aggressive." }, { status: 400 });
  const amount = Number(input.amount); const balance = Number(input.balance);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance < 0) return NextResponse.json({ content: "Invalid amount or balance." }, { status: 400 });
  return NextResponse.json(handleDiscordCommand({ name, amount, balance, risk: input.risk }));
}
