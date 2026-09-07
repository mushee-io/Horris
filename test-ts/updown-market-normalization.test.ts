import { describe, expect, it } from "vitest";
import { getUpDownMarket } from "../lib/updown";

describe("UpDown market normalization", () => {
  it("resolves canonical BTC", () => {
    expect(getUpDownMarket("BTC")?.symbol).toBe("BTC");
  });

  it("resolves common BTC perp aliases", () => {
    expect(getUpDownMarket(" btc ")?.symbol).toBe("BTC");
    expect(getUpDownMarket("BTC-PERP")?.symbol).toBe("BTC");
    expect(getUpDownMarket("BTC/USDT")?.symbol).toBe("BTC");
    expect(getUpDownMarket("BTCUSD")?.symbol).toBe("BTC");
  });

  it("preserves mixed-case Mento market symbols", () => {
    expect(getUpDownMarket("EURm")?.symbol).toBe("EURm");
    expect(getUpDownMarket("gbpm-perp")?.symbol).toBe("GBPm");
  });

  it("fails closed for unknown markets", () => {
    expect(getUpDownMarket("DOGE")).toBeUndefined();
    expect(getUpDownMarket("")).toBeUndefined();
  });
});
