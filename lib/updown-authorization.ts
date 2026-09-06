import { getAddress, parseUnits, type Address, type Hex } from "viem";

export const HORRIS_UPDOWN_AUTHORIZATION_DOMAIN = {
  name: "Horris UpDown Authorization",
  version: "1",
  chainId: 42220,
} as const;

export const HORRIS_UPDOWN_AUTHORIZATION_TYPES = {
  Authorization: [
    { name: "calldataHash", type: "bytes32" },
    { name: "receiver", type: "address" },
    { name: "market", type: "address" },
    { name: "accountBalanceUsdE18", type: "uint256" },
    { name: "stopDistanceBps", type: "uint16" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type UpDownAuthorizationPayloadInput = {
  authorizationContract: Address;
  calldataHash: Hex;
  receiver: Address;
  market: Address;
  accountBalanceUsd: string;
  entryPrice: number;
  stopLoss: number;
  nonce: bigint;
  deadline: bigint;
};

export function calculateStopDistanceBps(entryPrice: number, stopLoss: number) {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error("Entry price must be positive");
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) throw new Error("Stop loss must be positive");
  const raw = Math.abs(entryPrice - stopLoss) / entryPrice * 10_000;
  const bps = Math.round(raw);
  if (bps < 1 || bps > 65_535) throw new Error("Stop distance is outside uint16 bounds");
  return bps;
}

function parseUsdE18(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(normalized)) throw new Error("Account balance must be a positive decimal with at most 18 decimals");
  const parsed = parseUnits(normalized, 18);
  if (parsed <= 0n) throw new Error("Account balance must be positive");
  return parsed;
}

export function buildUpDownAuthorizationTypedData(input: UpDownAuthorizationPayloadInput) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.calldataHash)) throw new Error("A valid bytes32 calldata hash is required");
  if (input.nonce < 0n) throw new Error("Authorization nonce cannot be negative");
  if (input.deadline <= 0n) throw new Error("Authorization deadline must be positive");

  const verifyingContract = getAddress(input.authorizationContract);
  const receiver = getAddress(input.receiver);
  const market = getAddress(input.market);
  const accountBalanceUsdE18 = parseUsdE18(input.accountBalanceUsd);
  const stopDistanceBps = calculateStopDistanceBps(input.entryPrice, input.stopLoss);

  return {
    domain: {
      ...HORRIS_UPDOWN_AUTHORIZATION_DOMAIN,
      verifyingContract,
    },
    types: HORRIS_UPDOWN_AUTHORIZATION_TYPES,
    primaryType: "Authorization" as const,
    message: {
      calldataHash: input.calldataHash,
      receiver,
      market,
      accountBalanceUsdE18,
      stopDistanceBps,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  };
}
