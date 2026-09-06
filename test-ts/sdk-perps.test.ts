import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { HorrisClient } from "../sdk";

const client = new HorrisClient({} as PublicClient);
const receiver = "0x1234567890123456789012345678901234567890" as const;

describe("Horris perp SDK", () => {
  it("analyzes and compiles an approved UpDown intent", () => {
    const intent = {
      market: "BTC",
      side: "long" as const,
      marginUsd: 100,
      leverage: 3,
      accountBalanceUsd: 1_000,
      entryPrice: 100_000,
      stopLoss: 98_000,
      takeProfit: 104_000,
      risk: "Balanced" as const,
    };
    expect(client.analyzePerp(intent).approved).toBe(true);
    const order = client.compileUnsignedUpDownOrder(intent, receiver);
    expect(order.riskApproved).toBe(true);
    expect(order.params.addresses.receiver).toBe(receiver);
    expect(order.executionEnabled).toBe(false);
  });

  it("builds review-only authorization typed data", () => {
    const typed = client.buildUpDownAuthorization({
      authorizationContract: "0x1111111111111111111111111111111111111111",
      calldataHash: `0x${"22".repeat(32)}`,
      receiver,
      market: "0x3333333333333333333333333333333333333333",
      accountBalanceUsd: "1000",
      entryPrice: 100_000,
      stopLoss: 98_000,
      nonce: 1n,
      deadline: 2_000_000_000n,
    });
    expect(typed.primaryType).toBe("Authorization");
    expect(typed.domain.chainId).toBe(42220);
    expect(typed.message.stopDistanceBps).toBe(200);
  });
});
