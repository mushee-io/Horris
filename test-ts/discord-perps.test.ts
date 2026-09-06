import { describe, expect, it } from "vitest";
import { handleDiscordCommand } from "../lib/discord";

describe("Horris Discord perp risk", () => {
  it("returns a read-only pass for an approved setup", () => {
    const response = handleDiscordCommand({
      name: "perp-risk",
      market: "BTC",
      side: "long",
      balance: 1_000,
      margin: 100,
      leverage: 3,
      entry: 100_000,
      stop: 98_000,
      takeProfit: 104_000,
      risk: "Balanced",
    });
    expect(response.content).toContain("Horris PERP PASS");
    expect(response.content).toContain("no order submitted");
  });

  it("returns an explicit block for an unsafe setup", () => {
    const response = handleDiscordCommand({
      name: "perp-risk",
      market: "BTC",
      side: "long",
      balance: 1_000,
      margin: 500,
      leverage: 8,
      entry: 100_000,
      stop: 90_000,
      risk: "Balanced",
    });
    expect(response.content).toContain("Horris PERP BLOCK");
    expect(response.content).toContain("failed:");
  });
});
