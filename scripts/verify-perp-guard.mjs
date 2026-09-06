#!/usr/bin/env node
import { createPublicClient, getAddress, http, keccak256, toBytes } from "viem";
import { celo } from "viem/chains";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";
const policyAddress = process.env.HORRIS_PERP_POLICY;
const guardAddress = process.env.HORRIS_UPDOWN_GUARD;
const authorizationAddress = process.env.HORRIS_UPDOWN_AUTHORIZATION;
const expectedAuthorizer = process.env.HORRIS_PERP_AUTHORIZER;
const expectedOwner = process.env.HORRIS_PERP_OWNER;

for (const [name, value] of Object.entries({
  HORRIS_PERP_POLICY: policyAddress,
  HORRIS_UPDOWN_GUARD: guardAddress,
  HORRIS_UPDOWN_AUTHORIZATION: authorizationAddress,
  HORRIS_PERP_AUTHORIZER: expectedAuthorizer,
  HORRIS_PERP_OWNER: expectedOwner,
})) {
  if (!value) throw new Error(`Missing ${name}`);
}

const addresses = {
  exchangeRouter: "0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE",
  orderVault: "0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc",
  usdt: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595",
};
const markets = [
  ["BTC", "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771"],
  ["ETH", "0x3d069FFd681B68BF281077516dd9006C2e4c818A"],
  ["CELO", "0x1f39c2B41af79973b25F65E7a4234bc22aF250D7"],
  ["EURm", "0x38995e0D3c25EE78D45A45A1311A2CA0544b0E6B"],
  ["JPYm", "0xaaB05004Ac382adE5E70eEFC3C67035b5F31b990"],
  ["NGNm", "0x1B07C05466D7dC15244969EbCf23520Aba4df9e7"],
  ["AUDm", "0x22476a639D1bBDDE1919A226347360b32A2385Fe"],
  ["GBPm", "0xc439330b3D59Be316936Ff62d1d22b377656Fc20"],
];

const ownershipAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingOwner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const policyAbi = [
  ...ownershipAbi,
  { type: "function", name: "agent", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowedMarkets", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "limits", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }, { type: "uint16" }, { type: "uint16" }, { type: "uint256" }] },
];
const guardAbi = [
  ...ownershipAbi,
  { type: "function", name: "exchangeRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "orderVault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "usdt", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "maxLeverageBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "maxNotionalUsdE30", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowedMarkets", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
];
const authAbi = [
  ...ownershipAbi,
  { type: "function", name: "authorizer", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "guard", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "policy", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "marketIds", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }] },
];

const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 15_000 }) });
const norm = (value) => getAddress(value).toLowerCase();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const zero = "0x0000000000000000000000000000000000000000";

function ownershipState(label, owner, pendingOwner) {
  const intended = norm(expectedOwner);
  if (norm(owner) === intended && norm(pendingOwner) === norm(zero)) return `${label}: accepted`;
  if (norm(pendingOwner) === intended) return `${label}: pending acceptance`;
  throw new Error(`${label} ownership is neither accepted by nor pending to HORRIS_PERP_OWNER`);
}

async function main() {
  const chainId = await client.getChainId();
  assert(chainId === 42220, `Wrong chain: ${chainId}`);

  const deploymentAddresses = [policyAddress, guardAddress, authorizationAddress].map(getAddress);
  const codes = await Promise.all(deploymentAddresses.map((address) => client.getCode({ address })));
  codes.forEach((code, index) => assert(code && code !== "0x", `No bytecode at ${deploymentAddresses[index]}`));

  const [
    policyOwner, policyPendingOwner, agent, policyPaused, limits,
    guardOwner, guardPendingOwner, exchangeRouter, orderVault, usdt, guardPaused, maxLeverage, maxNotional,
    authOwner, authPendingOwner, authorizer, authGuard, authPolicy, authPaused,
  ] = await Promise.all([
    client.readContract({ address: getAddress(policyAddress), abi: policyAbi, functionName: "owner" }),
    client.readContract({ address: getAddress(policyAddress), abi: policyAbi, functionName: "pendingOwner" }),
    client.readContract({ address: getAddress(policyAddress), abi: policyAbi, functionName: "agent" }),
    client.readContract({ address: getAddress(policyAddress), abi: policyAbi, functionName: "paused" }),
    client.readContract({ address: getAddress(policyAddress), abi: policyAbi, functionName: "limits" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "owner" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "pendingOwner" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "exchangeRouter" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "orderVault" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "usdt" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "paused" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "maxLeverageBps" }),
    client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "maxNotionalUsdE30" }),
    client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "owner" }),
    client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "pendingOwner" }),
    client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "authorizer" }),
    client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "guard" }),
    client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "policy" }),
    client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "paused" }),
  ]);

  const ownership = [
    ownershipState("Policy", policyOwner, policyPendingOwner),
    ownershipState("Guard", guardOwner, guardPendingOwner),
    ownershipState("Authorization", authOwner, authPendingOwner),
  ];

  assert(norm(agent) === norm(authorizationAddress), "Policy agent is not the Horris authorization contract");
  assert(!policyPaused && !guardPaused && !authPaused, "One or more Horris perp contracts are paused");
  assert(Number(limits[0]) === 50_000 && Number(limits[1]) === 200 && Number(limits[2]) === 3_500 && limits[3] === 5_000n * 10n ** 18n, "Unexpected HorrisPerpPolicy limits");
  assert(norm(exchangeRouter) === norm(addresses.exchangeRouter), "Wrong ExchangeRouter");
  assert(norm(orderVault) === norm(addresses.orderVault), "Wrong OrderVault");
  assert(norm(usdt) === norm(addresses.usdt), "Wrong USDT");
  assert(Number(maxLeverage) === 50_000 && maxNotional === 5_000n * 10n ** 30n, "Unexpected calldata guard limits");
  assert(norm(authorizer) === norm(expectedAuthorizer), "Unexpected EIP-712 authorizer");
  assert(norm(authGuard) === norm(guardAddress), "Authorization points to wrong guard");
  assert(norm(authPolicy) === norm(policyAddress), "Authorization points to wrong policy");

  for (const [symbol, rawMarket] of markets) {
    const market = getAddress(rawMarket);
    const marketId = keccak256(toBytes(symbol));
    const [policyAllowed, guardAllowed, configuredMarketId] = await Promise.all([
      client.readContract({ address: getAddress(policyAddress), abi: policyAbi, functionName: "allowedMarkets", args: [marketId] }),
      client.readContract({ address: getAddress(guardAddress), abi: guardAbi, functionName: "allowedMarkets", args: [market] }),
      client.readContract({ address: getAddress(authorizationAddress), abi: authAbi, functionName: "marketIds", args: [market] }),
    ]);
    assert(policyAllowed, `${symbol} missing from policy allowlist`);
    assert(guardAllowed, `${symbol} missing from calldata guard allowlist`);
    assert(configuredMarketId === marketId, `${symbol} market ID mismatch`);
  }

  console.log("Horris perp guard verification passed");
  ownership.forEach((state) => console.log(state));
  console.log(`Policy: ${getAddress(policyAddress)}`);
  console.log(`Guard: ${getAddress(guardAddress)}`);
  console.log(`Authorization: ${getAddress(authorizationAddress)}`);
  console.log(`Authorizer: ${getAddress(expectedAuthorizer)}`);
  console.log(`Intended owner: ${getAddress(expectedOwner)}`);
  console.log("UpDown mainnet submission remains disabled by the current app.");
}

main().catch((error) => {
  console.error(`Horris perp guard verification failed: ${error.message}`);
  process.exitCode = 1;
});
