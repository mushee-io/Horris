# Horris

**AI execution infrastructure for Celo with policy-enforced risk controls.**

Horris turns user intent into structured DeFi proposals, simulates those proposals against deterministic policy, and is being built so execution can only pass through user-approved onchain adapters.

## Architecture

```text
User / Horris Agent
        ↓
Strategy Proposal
        ↓
Policy Simulation
        ↓
HorrisPolicyVault
        ↓
Allowlisted Adapter
        ↓
Mento Router
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
- [ ] M10 — Automation modes
- [ ] M11 — Portfolio and indexed execution activity
- [ ] M12 — Additional Celo protocol adapters
- [ ] M13 — Horris API / SDK
- [ ] M14 — Horris Discord
- [ ] M15 — Security hardening, deployment and grant demo

## Celo Sepolia configuration

- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Chain ID: `11142220`

## Run the web app

```bash
npm install
npm run dev
```

## Contract tests

Install Foundry, then run:

```bash
forge test -vv
```

## Important current limitation

The browser UI still uses wallet-direct Mento execution. The vault + adapter path is implemented at contract level but must be compiled, tested, deployed to Celo Sepolia and then wired into the dashboard before it should be represented as live vault execution.

Everything in this repository is testnet-stage and unaudited. Do not use production funds.
