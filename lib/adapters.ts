import type { Address } from "viem";

export type AdapterId = "mento";

export type ProtocolAdapter = {
  id: AdapterId;
  name: string;
  network: "celo-sepolia";
  contract?: Address;
  enabled: boolean;
  supportedPairs: readonly string[];
};

export const adapters: Record<AdapterId, ProtocolAdapter> = {
  mento: {
    id: "mento",
    name: "Mento",
    network: "celo-sepolia",
    enabled: true,
    supportedPairs: ["USDC/USDm"],
  },
};

export function getAdapter(id: AdapterId) {
  const adapter = adapters[id];
  if (!adapter.enabled) throw new Error(`${adapter.name} adapter is disabled`);
  return adapter;
}

export function supportsPair(id: AdapterId, pair: string) {
  return getAdapter(id).supportedPairs.includes(pair);
}
