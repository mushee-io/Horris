# Horris

**AI execution infrastructure for Celo with enforceable risk controls.**

Horris turns trade intent into structured proposals, checks them against deterministic risk policy, compiles venue-specific execution calldata, verifies live venue state, and keeps signing disabled until the execution path satisfies Horris' safety gates.

> Testnet-stage and unaudited. Do not use production funds. UpDown mainnet transaction submission is intentionally disabled.

## Architecture

```text
Dashboard / Discord / SDK
          ↓
Intent + Horris Risk Engine
          ↓
Policy + Live Venue Readiness
          ↓
Unsigned Transaction Compiler
          ↓
Read-only eth_call Simulation
          ↓
User / Agent Signing Boundary  ← currently locked for perps
          ↓
Pinned Venue Contracts on Celo
```

## Milestones

- [x] M1 — Dashboard + Celo wallet
- [x] M2 — Live Mento quote + optional testnet demo mode
- [x] M3 — Horris vault deposits/withdrawals, pause and agent revocation
- [x] M4 — Onchain execution/daily/asset/adapter/slippage policies
- [x] M5 — Pinned Mento Router/factory/token adapter
- [x] M6 — Foundry and adversarial contract tests
- [x] M7 — Structured strategy engine + policy simulation
- [x] M8 — Indexed vault activity + SDK/API layer
- [x] M9 — Discord signature verification + command registration
- [x] M10 — Hardened CI, dependency audit and deployment verifier
- [ ] M16 — Signed Celo Sepolia deployment + explorer verification + real vault transaction
- [x] M17 — Perp risk engine + UpDown registry + onchain `HorrisPerpPolicy`
- [x] M17.1 — Unsigned UpDown MarketIncrease compiler
- [x] M17.2 — Live UpDown fee/oracle/position/order reads
- [x] M17.3 — Position protection and pending-order risk monitor
- [x] M17.4 — Stop-loss / take-profit protection compiler
- [x] M17.5 — Frozen/pending order cancellation compiler
- [x] M17.6 — Live entry readiness + exact `eth_call` simulation gates
- [x] M17.7 — Venue-state entry confirmation + protection state machine
- [ ] M18 — Audited/verified UpDown execution path with policy coupling and explicitly enabled signing

## Celo perpetual layer

Horris targets UpDown on Celo mainnet using metadata pinned from the public `UpDownDex/skills` repository at commit:

`33d93fcd5ff0ffb98872dc2964600933f7153052`

Supported registry markets:

- BTC / USDT
- ETH / USDT
- CELO / USDT
- EURm / USDT
- JPYm / USDT
- NGNm / USDT
- AUDm / USDT
- GBPm / USDT

Horris deliberately imposes tighter limits than the venue:

| Profile | Max leverage | Max account risk at stop | Max margin use | Max notional |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 3x | 1% | 20% | $1,000 |
| Balanced | 5x | 2% | 35% | $5,000 |
| Aggressive | 10x | 4% | 50% | $10,000 |

The risk engine validates leverage, notional, margin use, stop direction, projected loss at stop, gross margin-exhaustion buffer, take-profit direction and reward/risk.

## Protected execution workflow

Horris currently implements the full **unsigned** workflow:

1. user defines perp intent;
2. Horris risk engine approves or blocks it;
3. Horris compiles the exact UpDown MarketIncrease parameters;
4. Horris reads current DataStore execution-fee inputs and Celo gas price;
5. Horris checks pinned venue bytecode, USDT balance, Router allowance, native CELO balance and fresh UpDown oracle state;
6. if allowance is already sufficient, Horris `eth_call` simulates the exact `sendWnt → sendTokens → createOrder` multicall;
7. after a future broadcast, Horris does **not** trust a transaction hash alone: it re-reads UpDown pending orders and live positions;
8. a pending entry stays `order-pending`;
9. a live position becomes `protection-required` unless active stop coverage is at least 99.5%;
10. stop-loss / take-profit previews are compiled only from a fresh live position read;
11. existing active protection is subtracted so Horris compiles only the uncovered size;
12. protection triggers are checked against a fresh UpDown oracle price;
13. exact protection calldata is `eth_call` simulated before it can ever become signable;
14. frozen stops block further automation;
15. frozen orders and pending increases can produce a fresh-state unsigned cancellation preview and `eth_call` simulation.

UpDown requires protection orders to be created **after** a live position exists. Horris therefore does not claim atomic entry + stop protection.

## Deterministic protection phases

`lib/perp-sequence.ts` exposes these states:

- `awaiting-position`
- `protection-required`
- `protected`
- `review-exposure`
- `blocked`

Every state currently returns `executionAllowed: false`. This is deliberate.

## Main perp APIs

- `POST /api/perps/analyze` — deterministic Horris risk verdict
- `POST /api/perps/order-preview` — unsigned MarketIncrease + live readiness + optional exact `eth_call`
- `GET /api/perps/positions` — live UpDown positions
- `GET /api/perps/orders` — live pending orders
- `GET /api/perps/risk-state` — positions/orders + Horris protection verdict + state-machine phases
- `POST /api/perps/protection-preview` — fresh-state stop/TP compilation + live oracle + fee + `eth_call`
- `POST /api/perps/cancel-preview` — fresh-state cancellation compilation + `eth_call`
- `GET /api/perps/confirm-entry` — confirm expected entry from actual pending-order/position state

None of these endpoints broadcast an UpDown transaction.

## Hardened Mento testnet path

The first real execution proof remains Mento USDC → USDm on Celo Sepolia. `HorrisPolicyVault` and `HorrisMentoAdapter` enforce:

- owner custody and emergency withdrawal;
- revocable agent execution;
- nonzero execution and daily limits;
- allowlisted assets/adapters;
- quote-derived onchain slippage checks with a 5% absolute ceiling;
- actual input/output balance accounting;
- immutable Router/factory/token endpoints;
- 1–3 continuous route hops using the pinned factory;
- exact approvals cleared after execution;
- pause and reentrancy protection;
- frontend simulation before signing.

Celo Sepolia configuration:

- chain ID `11142220`
- USDC `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento Router `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Mento FPMM factory `0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980`

## Validation

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify:updown
forge test -vv
forge build --sizes
```

After a signed Horris Sepolia deployment:

```bash
npm run verify:deployment
```

GitHub Actions runs dependency auditing, TypeScript tests/typecheck/build and Foundry test/build gates.

## Remaining release boundary

Two external/signing gates remain:

1. deploy and verify the hardened Horris vault/Mento adapter on Celo Sepolia and execute the small end-to-end testnet transaction;
2. do not enable UpDown mainnet signing until a dedicated execution architecture couples actual venue order values to Horris policy and the asynchronous entry → protection failure/recovery path has been independently reviewed and tested.

See [`SECURITY.md`](SECURITY.md).

Never commit, paste or send a deployer private key, seed phrase, Discord token or other secret through chat or source control.
