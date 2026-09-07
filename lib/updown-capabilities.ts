import { UPDOWN_SOURCE_COMMIT } from "./updown";

export const UPDOWN_CAPABILITIES = {
  venue: "UpDown",
  sourceCommit: UPDOWN_SOURCE_COMMIT,
  mainnetChainId: 42220,
  mainnetReadOnlySupported: true,
  testnetExecutionSupported: false,
  signingSupported: false,
  broadcastSupported: false,
  mode: "celo-mainnet-review-only",
} as const;

export function assertUpDownBroadcastSupported() {
  if (!UPDOWN_CAPABILITIES.broadcastSupported) {
    throw new Error("UpDown broadcast is intentionally disabled: no reviewed Horris execution path is enabled");
  }
}
