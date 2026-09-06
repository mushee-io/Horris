# Horris

**AI execution infrastructure for Celo with policy-enforced risk controls.**

Horris turns user intent into structured DeFi proposals, simulates those proposals against deterministic policy, and is designed so execution can only pass through user-approved onchain adapters.

## Architecture

```text
Dashboard / Discord / SDK
          ↓
Horris Strategy Engine
          ↓
Policy Simulation
          ↓
Manual or Guarded Automation
          ↓
HorrisPolicyVault
          ↓
Allowlisted Protocol Adapter
          ↓
Celo
```

## Milestone status

- [x] M1 — Dashboard + Celo wallet
- [x] M2 — Live Mento quote and wallet-direct testnet execution
- [x] M3 — Vault deposits, withdrawals, pause and agent revocation
- [x] M4 — Onchain asset/adapter, execution, daily and slippage policies
- [x] M5 — Narrow Horris Mento adapter contract
- [x] M6 — Foundry configuration and core vault policy tests
- [x] M7 — Structured strategy proposal engine
- [x] M8 — Deterministic pre-execution policy simulation
- [x] M9 — Restricted agent permission model
- [x] M10 — Manual + guarded automation decision engine
- [x] M11 — Portfolio snapshot + onchain execution activity reader
- [x] M12 — Extensible protocol adapter registry (Mento first)
- [x] M13 — Horris TypeScript SDK + strategy API
- [x] M14 — Discord command/application layer + API endpoint
- [~] M15 — CI/security baseline implemented; deployment, live vault wiring and final demo remain

## Celo Sepolia configuration

- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Chain ID: `11142220`

## Interfaces

### Strategy API

`POST /api/strategy`

```json
{ "amount": 50, "balance": 100, "risk": "Balanced" }
```

Returns a structured proposal plus deterministic policy simulation.

### Discord application layer

`POST /api/discord` currently exposes the Horris command-response logic for `strategy`, `risk`, and `help`. Discord signature verification and application registration are deployment tasks, not yet complete.

### SDK

`sdk/index.ts` exposes `HorrisClient` for strategy creation, simulation, agent checks, automation decisions, portfolio reads and vault activity.

## Run

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Contracts

```bash
forge test -vv
```

CI now runs both the Next.js build/typecheck and Foundry tests on pushes and pull requests.

## Remaining release gate

The browser UI still uses wallet-direct Mento execution. Before Horris can be called a complete testnet protocol we must:

1. make CI green and fix any compile/test failures;
2. deploy `HorrisPolicyVault` to Celo Sepolia;
3. deploy the Mento adapter with the live vault/router/token addresses;
4. configure vault asset, adapter and risk policies;
5. wire the dashboard to deposit/withdraw/execute through the deployed vault;
6. verify every contract and transaction on the explorer;
7. register/secure the Discord application if included in the demo;
8. run an end-to-end testnet demo and security review.

Everything remains testnet-stage and unaudited. Do not use production funds.
