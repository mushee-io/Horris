import { describe, expect, it } from "vitest";
import { assertUpDownBroadcastSupported, UPDOWN_CAPABILITIES } from "../lib/updown-capabilities";

describe("Horris UpDown capability boundary", () => {
  it("keeps testnet execution and all broadcast disabled", () => {
    expect(UPDOWN_CAPABILITIES.mainnetReadOnlySupported).toBe(true);
    expect(UPDOWN_CAPABILITIES.testnetExecutionSupported).toBe(false);
    expect(UPDOWN_CAPABILITIES.signingSupported).toBe(false);
    expect(UPDOWN_CAPABILITIES.broadcastSupported).toBe(false);
  });

  it("fails closed when code asks for UpDown broadcast", () => {
    expect(() => assertUpDownBroadcastSupported()).toThrow("UpDown broadcast is intentionally disabled");
  });
});
