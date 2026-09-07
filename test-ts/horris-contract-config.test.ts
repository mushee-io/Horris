import { afterEach, describe, expect, it, vi } from "vitest";

const originalVault = process.env.NEXT_PUBLIC_HORRIS_VAULT;
const originalAdapter = process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER;

afterEach(() => {
  if (originalVault === undefined) delete process.env.NEXT_PUBLIC_HORRIS_VAULT; else process.env.NEXT_PUBLIC_HORRIS_VAULT = originalVault;
  if (originalAdapter === undefined) delete process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER; else process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER = originalAdapter;
  vi.resetModules();
});

describe("Horris deployment configuration", () => {
  it("throws instead of silently falling back when the vault override is malformed", async () => {
    process.env.NEXT_PUBLIC_HORRIS_VAULT = `0x${"z".repeat(40)}`;
    vi.resetModules();
    await expect(import("../lib/horris-contracts")).rejects.toThrow("NEXT_PUBLIC_HORRIS_VAULT must be a valid 20-byte EVM address");
  });

  it("throws instead of silently falling back when the adapter override is malformed", async () => {
    delete process.env.NEXT_PUBLIC_HORRIS_VAULT;
    process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER = "0x1234";
    vi.resetModules();
    await expect(import("../lib/horris-contracts")).rejects.toThrow("NEXT_PUBLIC_HORRIS_MENTO_ADAPTER must be a valid 20-byte EVM address");
  });

  it("accepts an explicit valid deployment override", async () => {
    process.env.NEXT_PUBLIC_HORRIS_VAULT = "0x1111111111111111111111111111111111111111";
    process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER = "0x2222222222222222222222222222222222222222";
    vi.resetModules();
    const config = await import("../lib/horris-contracts");
    expect(config.HORRIS_VAULT).toBe("0x1111111111111111111111111111111111111111");
    expect(config.HORRIS_MENTO_ADAPTER).toBe("0x2222222222222222222222222222222222222222");
  });
});
