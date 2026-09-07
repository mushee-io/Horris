import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ERC8004_AGENT_REGISTRY,
  ERC8004_AGENT_URI,
  ERC8004_CHAIN_ID,
  ERC8004_IDENTITY_REGISTRY,
} from "../lib/erc8004";

describe("Horris ERC-8004 identity", () => {
  it("pins the Celo mainnet identity registry and canonical agent URI", () => {
    expect(ERC8004_CHAIN_ID).toBe(42220);
    expect(ERC8004_IDENTITY_REGISTRY).toBe("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(ERC8004_AGENT_REGISTRY).toBe(`eip155:42220:${ERC8004_IDENTITY_REGISTRY}`);
    expect(ERC8004_AGENT_URI).toBe("https://horris-delta.vercel.app/.well-known/agent-registration.json");
  });

  it("publishes an ERC-8004 registration-v1 file for Horris", () => {
    const raw = readFileSync("public/.well-known/agent-registration.json", "utf8");
    const metadata = JSON.parse(raw) as Record<string, unknown>;
    expect(metadata.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    expect(metadata.name).toBe("Horris");
    expect(metadata.active).toBe(true);
    expect(metadata.x402Support).toBe(false);
    expect(Array.isArray(metadata.services)).toBe(true);
    expect(Array.isArray(metadata.registrations)).toBe(true);
  });
});
