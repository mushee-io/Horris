import { describe, expect, it } from "vitest";
import { getContractAddress } from "viem";
import { DEFAULT_HORRIS_MENTO_ADAPTER, DEFAULT_HORRIS_VAULT } from "../lib/horris-contracts";

const deployer = "0xB11c08D9aCfB8C71207e497Ae40cFC8aF1052A51" as const;

describe("Horris Celo Sepolia deployment address derivation", () => {
  it("derives the known vault from deployer nonce 0", () => {
    expect(getContractAddress({ from: deployer, nonce: 0n })).toBe(DEFAULT_HORRIS_VAULT);
  });

  it("derives the Mento adapter from the immediately following deployer nonce", () => {
    expect(getContractAddress({ from: deployer, nonce: 1n })).toBe(DEFAULT_HORRIS_MENTO_ADAPTER);
  });
});
