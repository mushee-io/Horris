import { describe, expect, it } from "vitest";
import { confirmUpDownEntryFromState } from "../lib/updown-confirmation";
import { UPDOWN_MARKETS } from "../lib/updown";
import type { HorrisUpDownOrder } from "../lib/updown-orders";
import type { HorrisUpDownPosition } from "../lib/updown-positions";

const btc = UPDOWN_MARKETS.find((market) => market.symbol === "BTC")!;
const position: HorrisUpDownPosition = {
  market: "BTC/USDT", marketToken: btc.marketToken,
  collateralToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595",
  side: "long", sizeUsd: "300", collateralAmount: "100", effectiveLeverage: 3, increasedAt: 0, decreasedAt: 0,
};
const order: HorrisUpDownOrder = {
  key: `0x${"44".repeat(32)}`, market: "BTC/USDT", marketToken: btc.marketToken, type: "MarketIncrease", orderType: 2,
  side: "long", sizeUsd: "300", collateralAmount: "100", triggerPrice: null, acceptablePrice: null,
  executionFeeCelo: "1", updatedAt: 0, validFrom: 0, isFrozen: false, autoCancel: false,
};

describe("Horris UpDown entry confirmation", () => {
  it("does not assume success when no venue state exists", () => {
    expect(confirmUpDownEntryFromState(btc.marketToken, "long", 300, [], []).phase).toBe("not-observed");
  });

  it("recognizes a matching pending increase order", () => {
    const result = confirmUpDownEntryFromState(btc.marketToken, "long", 300, [], [order]);
    expect(result.phase).toBe("order-pending");
    expect(result.matchingOrderKeys).toEqual([order.key]);
  });

  it("recognizes a matching live position", () => {
    const result = confirmUpDownEntryFromState(btc.marketToken, "long", 300, [position], []);
    expect(result.phase).toBe("position-live");
    expect(result.livePositionSizeUsd).toBe(300);
  });

  it("uses a small tolerance for venue rounding", () => {
    expect(confirmUpDownEntryFromState(btc.marketToken, "long", 300, [{ ...position, sizeUsd: "300.9" }], []).phase).toBe("position-live");
  });

  it("fails closed on ambiguous matching venue state", () => {
    const result = confirmUpDownEntryFromState(btc.marketToken, "long", 300, [position], [order]);
    expect(result.phase).toBe("ambiguous");
    expect(result.executionEnabled).toBe(false);
  });
});
