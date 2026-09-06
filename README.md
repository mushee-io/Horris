# Horis

**AI execution infrastructure for Celo with policy-enforced risk controls.**

Horis turns user intent into DeFi strategy proposals, validates those proposals against explicit risk rules, and is designed to execute only through approved assets and protocol targets.

## MVP

The current MVP includes:

- Celo Alfajores wallet connection
- Allocation input
- Conservative / Balanced / Aggressive risk profiles
- Simulated AI strategy proposals
- Policy-check UX
- Execution activity surface
- `HorisPolicyVault.sol` starter policy contract

> The current execution flow is intentionally simulated. The Solidity contract is unaudited and must not be used with production funds.

## Architecture

```text
User
  ↓
Horis Dashboard
  ↓
Strategy / AI Layer
  ↓
Policy Check
  ↓
HorisPolicyVault
  ↓
Approved Celo protocol adapters
```

The important design rule is that the AI layer does not receive unrestricted execution authority. User-defined constraints should remain enforceable at the contract layer.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Build

```bash
npm run typecheck
npm run build
```

## Next milestones

1. Add Foundry tests for `HorisPolicyVault`
2. Add deposit / withdraw accounting
3. Add one real Celo testnet protocol adapter
4. Add strategy simulation API
5. Connect strategy output to policy validation
6. Add execution receipts and explorer links
7. Add Discord interface

## Network

Development target: **Celo Alfajores testnet**.

## Status

Early testnet MVP. Not audited. Not production-ready.
