import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, isAddress, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO } from "../../../../lib/updown";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";
const authorizationAbi = [{
  type: "function",
  name: "consumeIncreaseAuthorization",
  stateMutability: "nonpayable",
  inputs: [
    { name: "target", type: "address" },
    { name: "msgValue", type: "uint256" },
    { name: "multicallData", type: "bytes" },
    {
      name: "auth",
      type: "tuple",
      components: [
        { name: "calldataHash", type: "bytes32" },
        { name: "receiver", type: "address" },
        { name: "market", type: "address" },
        { name: "accountBalanceUsdE18", type: "uint256" },
        { name: "stopDistanceBps", type: "uint16" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { name: "signature", type: "bytes" },
  ],
  outputs: [
    {
      name: "inspection",
      type: "tuple",
      components: [
        { name: "market", type: "address" },
        { name: "collateralUsdt", type: "uint256" },
        { name: "notionalUsdE30", type: "uint256" },
        { name: "leverageBps", type: "uint32" },
        { name: "executionFee", type: "uint256" },
        { name: "isLong", type: "bool" },
      ],
    },
    { name: "accountRiskBps", type: "uint16" },
    { name: "marginUtilizationBps", type: "uint16" },
  ],
}] as const;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}
function asHex(value: unknown, bytes?: number): Hex {
  const text = String(value ?? "");
  const pattern = bytes ? new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`) : /^0x(?:[0-9a-fA-F]{2})*$/;
  if (!pattern.test(text)) throw new Error(bytes ? `Expected ${bytes}-byte hex value` : "Expected hex bytes");
  return text as Hex;
}
function asBigInt(value: unknown, label: string) {
  try {
    const result = BigInt(String(value));
    if (result < 0n) throw new Error();
    return result;
  } catch {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 65_536) return json({ error: "Request body too large" }, 413);
    const authorizationAddress = process.env.HORRIS_UPDOWN_AUTHORIZATION;
    if (!authorizationAddress || !isAddress(authorizationAddress)) {
      return json({ error: "Horris UpDown authorization contract is not configured", simulationOnly: true, executionEnabled: false }, 503);
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
    const input = body as Record<string, unknown>;
    const authInput = input.authorization;
    if (!authInput || typeof authInput !== "object" || Array.isArray(authInput)) return json({ error: "Authorization object is required" }, 400);
    const auth = authInput as Record<string, unknown>;

    const receiver = String(auth.receiver ?? "");
    const market = String(auth.market ?? "");
    if (!isAddress(receiver) || !isAddress(market)) return json({ error: "Authorization receiver/market must be valid addresses" }, 400);

    const multicallData = asHex(input.multicallData);
    const signature = asHex(input.signature);
    if ((signature.length - 2) / 2 !== 65) return json({ error: "Expected a 65-byte ECDSA signature" }, 400);

    const authorization = {
      calldataHash: asHex(auth.calldataHash, 32),
      receiver: receiver as Address,
      market: market as Address,
      accountBalanceUsdE18: asBigInt(auth.accountBalanceUsdE18, "accountBalanceUsdE18"),
      stopDistanceBps: Number(asBigInt(auth.stopDistanceBps, "stopDistanceBps")),
      nonce: asBigInt(auth.nonce, "nonce"),
      deadline: asBigInt(auth.deadline, "deadline"),
    };
    if (!Number.isInteger(authorization.stopDistanceBps) || authorization.stopDistanceBps < 1 || authorization.stopDistanceBps > 65_535) {
      return json({ error: "stopDistanceBps is outside uint16 bounds" }, 400);
    }

    const msgValue = asBigInt(input.msgValue, "msgValue");
    const data = encodeFunctionData({
      abi: authorizationAbi,
      functionName: "consumeIncreaseAuthorization",
      args: [UPDOWN_CELO.exchangeRouter, msgValue, multicallData, authorization, signature],
    });

    const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 15_000 }) });
    const code = await client.getCode({ address: authorizationAddress });
    if (!code || code === "0x") return json({ error: "Configured Horris authorization address has no bytecode", simulationOnly: true, executionEnabled: false }, 503);

    try {
      const result = await client.call({ to: authorizationAddress, data });
      if (!result.data) throw new Error("Authorization eth_call returned no data");
      const decoded = decodeFunctionResult({ abi: authorizationAbi, functionName: "consumeIncreaseAuthorization", data: result.data });
      const [inspection, accountRiskBps, marginUtilizationBps] = decoded;
      return json(serialize({
        success: true,
        simulationOnly: true,
        executionEnabled: false,
        nonceConsumed: false,
        authorizationContract: authorizationAddress,
        inspection,
        accountRiskBps,
        marginUtilizationBps,
        note: "eth_call passed. No state was changed, the authorization nonce was not consumed, and no UpDown transaction was broadcast.",
      }));
    } catch (error) {
      return json({
        success: false,
        simulationOnly: true,
        executionEnabled: false,
        nonceConsumed: false,
        error: error instanceof Error ? error.message : "Authorization eth_call reverted",
      }, 409);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Authorization simulation failed", simulationOnly: true, executionEnabled: false }, 400);
  }
}
