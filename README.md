# Horris

**AI execution infrastructure for Celo with policy-enforced risk controls.**

Horris turns user intent into structured DeFi proposals, checks those proposals against deterministic policy, and routes execution through user-controlled onchain custody and narrowly scoped protocol adapters.

> Testnet-stage and unaudited. Do not use production funds.

## Architecture

```text
Dashboard / Discord / SDK
          ↓
Horris Strategy Engine
          ↓
Policy Simulation + Onchain Preflight
          ↓
Manual or Guarded Automation
          ↓
HorrisPolicyVault
          ↓
Pinned / Allowlisted Protocol Adapter
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

## Hardened execution path

The current Celo MVP uses Mento USDC → USDm as a proof of Horris' execution/risk infrastructure. It is not the final perpetuals venue.

The onchain path now enforces:

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

- if deployed addresses are configured, the dashboard uses the Horris vault path;
- if contracts are not configured, the dashboard remains quote-only;
- wallet-direct execution is disabled unless `NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=true` is explicitly set for a testnet demo.

When a vault is deployed, the dashboard checks current owner/agent authorization, pause state, accounted USDC, accounting health, execution cap, daily budget and slippage policy before requesting a transaction signature.

## Interfaces

### Strategy API

`POST /api/strategy`

```json
{ "amount": 50, "balance": 100, "risk": "Balanced" }
```

Returns a structured proposal plus deterministic policy simulation. This endpoint does not custody or execute funds.

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

## Remaining release gate

Code-side Celo MVP work is at the deployment boundary. The remaining live release work is:

1. deploy the tested `HorrisPolicyVault` and `HorrisMentoAdapter` commit from a dedicated funded Celo Sepolia wallet;
2. record the vault address, adapter address and deployment block in the web environment;
3. verify the contracts on Celo Sepolia Blockscout;
4. deposit a small amount of test USDC;
5. generate the approved Mento route and execute vault → adapter → Mento;
6. confirm USDC accounting decreases and USDm accounting/balance increases;
7. withdraw a small amount of USDm to the owner;
8. capture `ExecutionCompleted`, `SwapExecuted` and explorer transaction links for the demo;
9. register Discord commands only if Discord is part of the submission demo.

Never commit or paste a deployer private key into chat, source control, screenshots or public logs.
