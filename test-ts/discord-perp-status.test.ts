import { describe, expect, it } from "vitest";
import { formatDiscordPerpStatus } from "../lib/discord-perp-status";
import { UPDOWN_MARKETS } from "../lib/updown";
import type { HorrisUpDownPosition } from "../lib/updown-positions";
import type { HorrisUpDownOrder } from "../lib/updown-orders";

const btc = UPDOWN_MARKETS.find((market) => market.symbol === "BTC")!;
const position: HorrisUpDownPosition = {
  market: "BTC/USDT",
  marketToken: btc.marketToken,
  collateralToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595",
  side: "long",
  sizeUsd: "300",
  collateralAmount: "100",
  effectiveLeverage: 3,
  increasedAt: 0,
  decreasedAt: 0,
};

function order(orderType: number, sizeUsd: string, isFrozen = false): HorrisUpDownOrder {
  return {
    key: `0x${"11".repeat(32)}`,
    market: "BTC/USDT",
    marketToken: btc.marketToken,
    type: `OrderType(${orderType})`,
    orderType,
    side: "long",
    sizeUsd,
    collateralAmount: "0",
    triggerPrice: null,
    acceptablePrice: null,
    executionFeeCelo: "1",
    updatedAt: 0,
    validFrom: 0,
    isFrozen,
    autoCancel: true,
  };
}

describe("Discord perp status formatter", () => {
  it("reports empty state with frozen pending orders", () => {
    const text = formatDiscordPerpStatus([], [order(2, "100", true)]);
    expect(text).toContain("no live UpDown positions");
    expect(text).toContain("1 pending order");
    expect(text).toContain("1 frozen");
  });

  it("reports stop coverage and protection phase", () => {
    const text = formatDiscordPerpStatus([position], [order(6, "150")]);
    expect(text).toContain("BTC/USDT LONG");
    expect(text).toContain("stop 50.0%");
    expect(text).toContain("PROTECTION REQUIRED");
    expect(text).toContain("no order submitted");
  });

  it("caps the number of position lines and total Discord response length", () => {
    const positions = Array.from({ length: 8 }, (_, index) => ({
      ...position,
      market: `TEST${index}/USDT`,
      marketToken: `0x${(index + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
    }));
    const text = formatDiscordPerpStatus(positions, []);
    expect(text).toContain("+3 more position(s)");
    expect(text.length).toBeLessThanOrEqual(1900);
  });
});
