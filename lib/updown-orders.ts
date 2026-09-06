import "server-only";
import { createPublicClient, encodeAbiParameters, formatEther, formatUnits, http, isAddress, keccak256, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO, UPDOWN_MARKETS } from "./updown";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";

const dataStoreAbi = [
  { type: "function", name: "getBytes32Count", stateMutability: "view", inputs: [{ name: "setKey", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getBytes32ValuesAt", stateMutability: "view", inputs: [{ name: "setKey", type: "bytes32" }, { name: "start", type: "uint256" }, { name: "end", type: "uint256" }], outputs: [{ name: "", type: "bytes32[]" }] },
  { type: "function", name: "getAddress", stateMutability: "view", inputs: [{ name: "key", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "getUint", stateMutability: "view", inputs: [{ name: "key", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getBool", stateMutability: "view", inputs: [{ name: "key", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const ORDER_TYPES = ["MarketSwap", "LimitSwap", "MarketIncrease", "LimitIncrease", "MarketDecrease", "LimitDecrease", "StopLossDecrease", "Liquidation", "StopIncrease"] as const;

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

function keyOfString(value: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }], [value]));
}

function accountOrderListKey(account: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [keyOfString("ACCOUNT_ORDER_LIST"), account]));
}

function orderFieldKey(orderKey: Hex, field: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [orderKey, keyOfString(field)]));
}

function marketInfo(address: Address) {
  return UPDOWN_MARKETS.find((market) => market.marketToken.toLowerCase() === address.toLowerCase());
}

export type HorrisUpDownOrder = {
  key: Hex;
  market: string;
  marketToken: Address;
  type: string;
  orderType: number;
  side: "long" | "short";
  sizeUsd: string;
  collateralAmount: string;
  triggerPrice: string | null;
  acceptablePrice: string | null;
  executionFeeCelo: string;
  updatedAt: number;
  validFrom: number;
  isFrozen: boolean;
  autoCancel: boolean;
};

export async function getUpDownOrders(account: Address, max = 50): Promise<HorrisUpDownOrder[]> {
  if (!isAddress(account)) throw new Error("Invalid account address");
  const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 12_000 }) });
  const setKey = accountOrderListKey(account);
  const count = await client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getBytes32Count", args: [setKey] });
  if (count === 0n) return [];
  const end = count > BigInt(max) ? BigInt(max) : count;
  const keys = await client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getBytes32ValuesAt", args: [setKey, 0n, end] });

  return Promise.all(keys.map(async (key) => {
    const addressFields = ["MARKET", "INITIAL_COLLATERAL_TOKEN"] as const;
    const uintFields = ["ORDER_TYPE", "SIZE_DELTA_USD", "INITIAL_COLLATERAL_DELTA_AMOUNT", "TRIGGER_PRICE", "ACCEPTABLE_PRICE", "EXECUTION_FEE", "VALID_FROM_TIME", "UPDATED_AT_TIME"] as const;
    const boolFields = ["IS_LONG", "IS_FROZEN", "AUTO_CANCEL"] as const;

    const [addresses, numbers, flags] = await Promise.all([
      Promise.all(addressFields.map((field) => client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getAddress", args: [orderFieldKey(key, field)] }))),
      Promise.all(uintFields.map((field) => client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [orderFieldKey(key, field)] }))),
      Promise.all(boolFields.map((field) => client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getBool", args: [orderFieldKey(key, field)] }))),
    ]);

    const market = marketInfo(addresses[0]);
    const indexDecimals = market?.symbol === "BTC" ? 8 : 18;
    const priceDecimals = 30 - indexDecimals;
    const collateralDecimals = TOKEN_DECIMALS.get(addresses[1].toLowerCase()) ?? 18;
    const orderType = Number(numbers[0]);

    return {
      key,
      market: market ? `${market.symbol}/${market.quoteSymbol}` : addresses[0],
      marketToken: addresses[0],
      type: ORDER_TYPES[orderType] ?? `OrderType(${orderType})`,
      orderType,
      side: flags[0] ? "long" : "short",
      sizeUsd: formatUnits(numbers[1], 30),
      collateralAmount: formatUnits(numbers[2], collateralDecimals),
      triggerPrice: numbers[3] === 0n ? null : formatUnits(numbers[3], priceDecimals),
      acceptablePrice: numbers[4] === 0n ? null : formatUnits(numbers[4], priceDecimals),
      executionFeeCelo: formatEther(numbers[5]),
      validFrom: Number(numbers[6]),
      updatedAt: Number(numbers[7]),
      isFrozen: flags[1],
      autoCancel: flags[2],
    };
  }));
}
