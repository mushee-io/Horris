import { describe, expect, it } from "vitest";
import { hashTypedData, parseUnits } from "viem";
import { buildUpDownAuthorizationTypedData, calculateStopDistanceBps } from "../lib/updown-authorization";

const authorizationContract = "0x1111111111111111111111111111111111111111" as const;
const receiver = "0x2222222222222222222222222222222222222222" as const;
const market = "0x3333333333333333333333333333333333333333" as const;
const calldataHash = `0x${"44".repeat(32)}` as const;

describe("Horris UpDown authorization typed data", () => {
  it("derives the same signed risk fields expected onchain", () => {
    const typed = buildUpDownAuthorizationTypedData({
      authorizationContract,
      calldataHash,
      receiver,
      market,
      accountBalanceUsd: "1000",
      entryPrice: 100_000,
      stopLoss: 98_000,
      nonce: 7n,
      deadline: 2_000_000_000n,
    });

    expect(typed.domain.name).toBe("Horris UpDown Authorization");
    expect(typed.domain.version).toBe("1");
    expect(typed.domain.chainId).toBe(42220);
    expect(typed.domain.verifyingContract).toBe(authorizationContract);
    expect(typed.message.calldataHash).toBe(calldataHash);
    expect(typed.message.receiver).toBe(receiver);
    expect(typed.message.market).toBe(market);
    expect(typed.message.accountBalanceUsdE18).toBe(parseUnits("1000", 18));
    expect(typed.message.stopDistanceBps).toBe(200);
    expect(typed.message.nonce).toBe(7n);
    expect(hashTypedData(typed)).toHaveLength(66);
  });

  it("rounds stop distance deterministically to uint16 bps", () => {
    expect(calculateStopDistanceBps(2_000, 1_950)).toBe(250);
  });

  it("rejects malformed calldata hashes and account balances", () => {
    expect(() => buildUpDownAuthorizationTypedData({
      authorizationContract,
      calldataHash: "0x1234",
      receiver,
      market,
      accountBalanceUsd: "1000",
      entryPrice: 100_000,
      stopLoss: 98_000,
      nonce: 1n,
      deadline: 2_000_000_000n,
    })).toThrow("bytes32 calldata hash");

    expect(() => buildUpDownAuthorizationTypedData({
      authorizationContract,
      calldataHash,
      receiver,
      market,
      accountBalanceUsd: "1000.1234567890123456789",
      entryPrice: 100_000,
      stopLoss: 98_000,
      nonce: 1n,
      deadline: 2_000_000_000n,
    })).toThrow("at most 18 decimals");
  });
});
