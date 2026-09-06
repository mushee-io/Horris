# Horris

**AI execution infrastructure for Celo with policy-enforced risk controls.**

Horris turns user intent into structured DeFi proposals, checks those proposals against deterministic policy, and routes execution through user-controlled onchain custody and narrowly scoped protocol adapters.

> Testnet-stage and unaudited. Do not use production funds.

## Architecture

```text
Dashboard / Discord / SDK
          ↓
Horris Strategy + Perp Risk Engine
          ↓
Policy Simulation + Onchain Preflight
          ↓
Manual or Guarded Automation
          ↓
HorrisPolicyVault / HorrisPerpPolicy
          ↓
Pinned / Allowlisted Venue Adapter
          ↓
Celo
```

## Milestone status

- [x] M1 — Dashboard + Celo wallet
- [x] M2 — Live Mento quote and optional wallet-direct testnet demo
- [x] M3 — Vault deposits, USDC/USDm withdrawals, pause and agent revocation
- [x] M4 — Onchain asset/adapter, execution, daily and quote-derived slippage policies
- [x] M5 — Narrow Mento adapter with immutable Router/factory/token pair
- [x] M6 — Foundry configuration + expanded policy/adapter security tests
- [x] M7 — Structured strategy proposal engine
- [x] M8 — Deterministic pre-execution policy simulation
- [x] M9 — Restricted owner/agent permission model
- [x] M10 — Manual + guarded automation decision engine
- [x] M11 — Portfolio snapshot + indexed onchain execution activity
- [x] M12 — Extensible adapter architecture (Mento first)
- [x] M13 — Horris TypeScript SDK + strategy API
- [x] M14 — Discord slash-command endpoint with Ed25519 verification + registration script
- [x] M15 — CI and security-hardening baseline
- [ ] M16 — Signed Celo Sepolia deployment, explorer verification and end-to-end live vault transaction
- [x] M17 — Celo perpetual market registry + offchain perp risk engine + onchain venue-independent perp policy guard
- [ ] M18 — Hardened UpDown execution adapter with independently verified order values and onchain policy coupling

## Perpetual risk layer

Horris is no longer scoped as a stablecoin swap application. The Mento USDC → USDm adapter remains the first hardened execution proof, while the product now has a dedicated perpetual risk layer for Celo.

The current perpetual venue registry targets **UpDown on Celo mainnet** using contract/market data pinned from the public `UpDownDex/skills` repository at commit:

`33d93fcd5ff0ffb98872dc2964600933f7153052`

Registered markets currently include:

- BTC / USDT
- ETH / USDT
- CELO / USDT
- EURm / USDT
- JPYm / USDT
- NGNm / USDT
- AUDm / USDT
- GBPm / USDT

UpDown's public agent tooling currently permits a default maximum leverage of up to 100x. Horris intentionally imposes much tighter application-level limits:

| Horris profile | Max leverage | Max account risk at stop | Max margin utilization | Max notional |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 3x | 1% | 20% | $1,000 |
| Balanced | 5x | 2% | 35% | $5,000 |
| Aggressive | 10x | 4% | 50% | $10,000 |

The perpetual risk engine checks:

- leverage;
- notional exposure;
- stop-loss direction;
- projected account loss at stop;
- margin utilization;
- gross margin-exhaustion buffer;
- take-profit direction;
- reward/risk when a take-profit is supplied.

`POST /api/perps/analyze` exposes this analysis to the dashboard and future agent interfaces.

### Important execution boundary

Perpetual execution is deliberately **locked** today. `HorrisPerpPolicy` is a policy guard, not a trading adapter and not a custody contract. A future UpDown adapter must independently reconstruct or verify the normalized values that it submits to the policy contract from the actual venue order, otherwise caller-supplied metrics could not be trusted as an execution authorization boundary.

This keeps Horris fail-closed while the execution adapter is built and reviewed.

## Hardened Mento execution path

The current Celo testnet execution proof uses Mento USDC → USDm. It is not the final perpetual venue.

The onchain path enforces:

- owner-controlled custody and emergency withdrawal;
- revocable agent execution;
- mandatory nonzero per-execution and daily limits;
- a contract-level absolute slippage ceiling of 5%;
- minimum output derived from the adapter's current onchain Mento quote;
- actual input/output balance accounting;
- immutable Mento Router, FPMM factory, USDC and USDm inside the adapter;
- approved factory on every route hop, 1–3 hops, route continuity and fixed endpoints;
- exact token approvals that are cleared after execution;
- pause + reentrancy guards;
- frontend `eth_call` simulation before signing.

See [`SECURITY.md`](SECURITY.md) for the trust model and remaining risks.

## Celo Sepolia configuration

- Chain ID: `11142220`
- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento v3 Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Mento FPMM Factory: `0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980`

## Web execution modes

Horris fails closed by default:

- if deployed addresses are configured, the stablecoin dashboard uses the Horris vault path;
- if contracts are not configured, the stablecoin dashboard remains quote-only;
- wallet-direct execution is disabled unless `NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=true` is explicitly set for a testnet demo;
- the perpetual interface performs read-only risk analysis only and cannot submit UpDown orders yet.

When a vault is deployed, the dashboard checks current owner/agent authorization, pause state, accounted USDC, accounting health, execution cap, daily budget and slippage policy before requesting a transaction signature.

## Interfaces

### Strategy API

`POST /api/strategy`

```json
{ "amount": 50, "balance": 100, "risk": "Balanced" }
```

Returns a structured stablecoin proposal plus deterministic policy simulation. This endpoint does not custody or execute funds.

### Perpetual risk API

`POST /api/perps/analyze`

```json
{
  "market": "BTC",
  "side": "long",
  "risk": "Balanced",
  "marginUsd": 100,
  "leverage": 3,
  "accountBalanceUsd": 1000,
  "entryPrice": 100000,
  "stopLoss": 98000,
  "takeProfit": 104000
}
```

Returns Horris' risk verdict, policy checks and the pinned UpDown market metadata. `executionEnabled` remains `false` until M18 is completed.

### Discord application layer

`POST /api/discord`

Production Discord interactions require Ed25519 request verification, support Discord PING, and handle `help`, `strategy`, and `risk` application commands. Responses are advisory and do not withdraw funds.

Register commands after securely setting Discord credentials:

```bash
npm run discord:register
```

### SDK

`sdk/index.ts` exposes `HorrisClient` for strategy creation, simulation, agent checks, automation decisions, portfolio reads and vault activity.

## Run and validate

```bash
npm install
npm run typecheck
npm run build
forge test -vv
forge build --sizes
```

GitHub Actions runs the web typecheck/build and Foundry test/build suites on pushes and pull requests.

## Remaining release gates

### Testnet execution proof

1. deploy the tested `HorrisPolicyVault` and `HorrisMentoAdapter` commit from a dedicated funded Celo Sepolia wallet;
2. record the vault address, adapter address and deployment block in the web environment;
3. verify the contracts on Celo Sepolia Blockscout;
4. deposit a small amount of test USDC;
5. generate the approved Mento route and execute vault → adapter → Mento;
6. confirm USDC accounting decreases and USDm accounting/balance increases;
7. withdraw a small amount of USDm to the owner;
8. capture `ExecutionCompleted`, `SwapExecuted` and explorer transaction links for the demo.

### Perpetual execution

1. independently verify UpDown's current Celo contracts and order semantics from the pinned source and live bytecode;
2. build a narrow Horris UpDown adapter for supported order types only;
3. make the adapter derive leverage, notional and risk inputs from the actual order rather than trusting caller-supplied normalized values;
4. couple the adapter to `HorrisPerpPolicy`;
5. enforce market allowlists, acceptable-price bounds, leverage, account risk, margin utilization and stop-loss requirements;
6. add adversarial Foundry integration tests before enabling any mainnet order path.

Never commit or paste a deployer private key into chat, source control, screenshots or public logs.
