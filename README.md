# Horris

**AI execution infrastructure for Celo with policy-enforced risk controls.**

Horris turns user intent into DeFi strategy proposals, validates those proposals against explicit risk rules, and executes only through approved assets and protocol targets.

## Current MVP

The first real execution adapter is a stablecoin conversion on **Celo Sepolia**:

```text
User intent
  ↓
Horris risk profile
  ↓
Live Mento quote
  ↓
Policy validation
  ↓
Explicit wallet approval
  ↓
USDC → USDm via Mento Router
  ↓
Celo Sepolia transaction receipt
```

The dashboard includes:

- Celo Sepolia wallet connection / network switching
- Native test USDC balance lookup
- Conservative / Balanced / Aggressive policy profiles
- Live USDC → USDm Mento quotes
- Per-profile allocation caps
- Per-profile slippage ceilings
- Approval + swap transaction flow
- Celo Sepolia explorer receipts
- `HorisPolicyVault.sol` starter policy contract

## Testnet contracts

- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`

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

## Safety status

This is an early testnet MVP. Use testnet assets only. `HorisPolicyVault.sol` is unaudited and is not yet placed in the live swap execution path.

The current wallet remains the transaction signer. Horris builds and validates the strategy, but the user explicitly approves the resulting transactions.

## Next milestones

1. Add Foundry configuration and unit tests
2. Upgrade `HorisPolicyVault` with deposit / withdrawal accounting
3. Put the policy vault in the execution path instead of wallet-direct execution
4. Add an onchain Mento adapter allowlisted by the vault
5. Add strategy simulation / AI API
6. Add execution history indexed from Celo
7. Add Horris Discord interface

## Network

Development target: **Celo Sepolia testnet** (chain ID `11142220`).
