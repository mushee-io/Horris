import "server-only";
import { createPublicClient, formatUnits, http, isAddress, type Address } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO, UPDOWN_MARKETS } from "./updown";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";

const readerAbi = [{
  type: "function",
  name: "getAccountPositions",
  stateMutability: "view",
  inputs: [
    { name: "dataStore", type: "address" },
    { name: "account", type: "address" },
    { name: "start", type: "uint256" },
    { name: "end", type: "uint256" },
  ],
  outputs: [{
    name: "",
    type: "tuple[]",
    components: [
      {
        name: "addresses",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "market", type: "address" },
          { name: "collateralToken", type: "address" },
        ],
      },
      {
        name: "numbers",
        type: "tuple",
        components: [
          { name: "sizeInUsd", type: "uint256" },
          { name: "sizeInTokens", type: "uint256" },
          { name: "collateralAmount", type: "uint256" },
          { name: "borrowingFactor", type: "uint256" },
          { name: "fundingFeeAmountPerSize", type: "uint256" },
          { name: "longTokenClaimableFundingAmountPerSize", type: "uint256" },
          { name: "shortTokenClaimableFundingAmountPerSize", type: "uint256" },
          { name: "increasedAtTime", type: "uint256" },
          { name: "decreasedAtTime", type: "uint256" },
        ],
      },
      {
        name: "flags",
        type: "tuple",
        components: [{ name: "isLong", type: "bool" }],
      },
    ],
  }],
}] as const;

const TOKEN_DECIMALS = new Map<string, number>([
  ["0xd96a1ac57a180a3819633bce3dc602bd8972f595", 6],
  ["0x57433ed8ec1fad60b8e1dcfdd1fbd56aba19c04c", 8],
  ["0x4c2675e9067cd7fc859165ac5f37f1d82d825a1e", 18],
  ["0x5b1b6dcb4e907b9755e27db88bd62b9750a13c60", 18],
  ["0x2350246bae36ee301b108ca8fe58d795a8dbdb4e", 18],
  ["0x29206d4b6183a29ef5b68494b0850330e98f27f4", 18],
  ["0xeb8a6c14e625a05f06ea914db627dd65175b4505", 18],
  ["0x91ca0318fc30d728640f0e6329205ee1f538f17b", 18],
  ["0x7ef503a2722cdfa7e99f2a59771f7e2390c2df76", 18],
]);

export type HorrisUpDownPosition = {
  market: string;
  marketToken: Address;
  collateralToken: Address;
  side: "long" | "short";
  sizeUsd: string;
  collateralAmount: string;
  effectiveLeverage: number | null;
  increasedAt: number;
  decreasedAt: number;
};

function marketLabel(address: Address) {
  const market = UPDOWN_MARKETS.find((item) => item.marketToken.toLowerCase() === address.toLowerCase());
  return market ? `${market.symbol}/${market.quoteSymbol}` : address;
}

export async function getUpDownPositions(account: Address): Promise<HorrisUpDownPosition[]> {
  if (!isAddress(account)) throw new Error("Invalid account address");
  const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 12_000 }) });
  const positions = await client.readContract({
    address: UPDOWN_CELO.reader,
    abi: readerAbi,
    functionName: "getAccountPositions",
    args: [UPDOWN_CELO.dataStore, account, 0n, 50n],
  });

  return positions
    .filter((position) => position.numbers.sizeInUsd > 0n)
    .map((position) => {
      const decimals = TOKEN_DECIMALS.get(position.addresses.collateralToken.toLowerCase()) ?? 18;
      const sizeUsd = formatUnits(position.numbers.sizeInUsd, 30);
      const collateralAmount = formatUnits(position.numbers.collateralAmount, decimals);
      const size = Number(sizeUsd);
      const collateral = Number(collateralAmount);
      return {
        market: marketLabel(position.addresses.market),
        marketToken: position.addresses.market,
        collateralToken: position.addresses.collateralToken,
        side: position.flags.isLong ? "long" : "short",
        sizeUsd,
        collateralAmount,
        effectiveLeverage: Number.isFinite(size) && Number.isFinite(collateral) && collateral > 0 ? size / collateral : null,
        increasedAt: Number(position.numbers.increasedAtTime),
        decreasedAt: Number(position.numbers.decreasedAtTime),
      };
    });
}
