import type { Address } from "viem";

// Source pinned from UpDownDex/skills main commit 33d93fcd5ff0ffb98872dc2964600933f7153052.
// These are Celo mainnet addresses exposed by UpDown's public agent tooling.
export const UPDOWN_SOURCE_COMMIT = "33d93fcd5ff0ffb98872dc2964600933f7153052";

export const UPDOWN_CELO = {
  chainId: 42220,
  exchangeRouter: "0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE" as Address,
  router: "0x5C1e75b8425F9B0de50F8aA5846189fe8676e463" as Address,
  orderVault: "0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc" as Address,
  depositVault: "0x2690A62C0c19F91f0d59A104955322451F951F90" as Address,
  withdrawalVault: "0x0336b6eDa5F1889092005ebb78648c2a02d406e3" as Address,
  wnt: "0x471EcE3750Da237f93B8E339c536989b8978a438" as Address,
  dataStore: "0x2808EFda9b6c464208d14aF22A793AD1725D5836" as Address,
  reader: "0x357A2044aD1DfE8c93e7dcf352DD4785b1C6CD93" as Address,
  chainlinkPriceFeedProvider: "0x3f1932ba80878364575d91B822272044E76C87e3" as Address,
} as const;

export type UpDownMarket = {
  symbol: "BTC" | "ETH" | "CELO" | "EURm" | "JPYm" | "NGNm" | "AUDm" | "GBPm";
  marketToken: Address;
  indexToken: Address;
  longToken: Address;
  shortToken: Address;
  quoteSymbol: "USDT";
};

export const UPDOWN_MARKETS: readonly UpDownMarket[] = [
  { symbol: "BTC", marketToken: "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771", indexToken: "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C", longToken: "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "ETH", marketToken: "0x3d069FFd681B68BF281077516dd9006C2e4c818A", indexToken: "0x4C2675e9067Cd7Fc859165AC5F37f1D82d825A1E", longToken: "0x4C2675e9067Cd7Fc859165AC5F37f1D82d825A1E", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "CELO", marketToken: "0x1f39c2B41af79973b25F65E7a4234bc22aF250D7", indexToken: "0x5B1B6DCB4E907b9755E27Db88bD62B9750a13C60", longToken: "0x5B1B6DCB4E907b9755E27Db88bD62B9750a13C60", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "EURm", marketToken: "0x38995e0D3c25EE78D45A45A1311A2CA0544b0E6B", indexToken: "0x2350246BAE36EE301B108cA8fE58D795A8DBdb4e", longToken: "0x2350246BAE36EE301B108cA8fE58D795A8DBdb4e", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "JPYm", marketToken: "0xaaB05004Ac382adE5E70eEFC3C67035b5F31b990", indexToken: "0x29206D4B6183A29Ef5B68494B0850330e98f27F4", longToken: "0x29206D4B6183A29Ef5B68494B0850330e98f27F4", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "NGNm", marketToken: "0x1B07C05466D7dC15244969EbCf23520Aba4df9e7", indexToken: "0xEb8A6C14e625A05F06eA914Db627dd65175b4505", longToken: "0xEb8A6C14e625A05F06eA914Db627dd65175b4505", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "AUDm", marketToken: "0x22476a639D1bBDDE1919A226347360b32A2385Fe", indexToken: "0x91CA0318Fc30D728640f0E6329205eE1F538F17B", longToken: "0x91CA0318Fc30D728640f0E6329205eE1F538F17B", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
  { symbol: "GBPm", marketToken: "0xc439330b3D59Be316936Ff62d1d22b377656Fc20", indexToken: "0x7Ef503a2722cdfa7E99f2A59771f7E2390c2DF76", longToken: "0x7Ef503a2722cdfa7E99f2A59771f7E2390c2DF76", shortToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595", quoteSymbol: "USDT" },
] as const;

function normalizeUpDownSymbol(symbol: string) {
  let value = symbol.trim().toUpperCase().replace(/\s+/g, "");
  value = value.replace(/(?:[-_/]?PERP(?:ETUALS?)?)$/, "");
  value = value.replace(/(?:[-_/]?(?:USDT0?|USD))$/, "");
  return value;
}

export function getUpDownMarket(symbol: string) {
  const normalized = normalizeUpDownSymbol(symbol);
  if (!normalized) return undefined;
  return UPDOWN_MARKETS.find((market) => market.symbol.toUpperCase() === normalized);
}
