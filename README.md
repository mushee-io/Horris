# Horris

**AI execution infrastructure for Celo with enforceable risk controls.**

Horris turns trade intent into structured proposals, checks them against deterministic risk policy, compiles venue-specific calldata, verifies live venue state, and keeps signing/broadcast disabled until the execution path satisfies Horris' safety gates.

> Unaudited. Do not use production funds. UpDown mainnet transaction submission is intentionally disabled in the current app.

## Architecture

```text
Dashboard / Discord / SDK
          ↓
Intent + Horris Risk Engine
          ↓
Policy + Live Venue Readiness
          ↓
Exact Unsigned UpDown Calldata
          ↓
Read-only eth_call Simulation
          ↓
Review-only EIP-712 Authorization
          ↓
Calldata Firewall → HorrisPerpPolicy
          ↓
Signing / Broadcast Boundary  ← currently locked
```

## Milestones

- [x] M1–M15 — Dashboard, Celo wallet, Mento vault/adapter, strategy/policy engine, SDK, Discord and hardened CI baseline
- [ ] M16 — Signed Celo Sepolia deployment + explorer verification + real vault transaction
- [x] M17 — Perp risk engine + UpDown registry + onchain `HorrisPerpPolicy`
- [x] M17.1 — Unsigned UpDown MarketIncrease compiler
- [x] M17.2 — Live UpDown fee/oracle/position/order reads
- [x] M17.3 — Position protection and pending-order risk monitor
- [x] M17.4 — Stop-loss / take-profit protection compiler
- [x] M17.5 — Frozen/pending order cancellation compiler
- [x] M17.6 — Live entry readiness + exact `eth_call` simulation gates
- [x] M17.7 — Venue-state entry confirmation + protection state machine
- [x] M18.1 — Onchain exact-calldata firewall for the UpDown MarketIncrease multicall
- [x] M18.2 — Replay-safe EIP-712 authorization bound to calldata hash, receiver, market, account-risk context, nonce and expiry
- [x] M18.3 — Two-step ownership transfer, rotatable authorizer and explicit nonce invalidation
- [x] M18.4 — Perp deployment script + live wiring/ownership verifier
- [x] M18.5 — Read-only signature/authorization `eth_call` simulator
- [ ] M18.6 — Independently reviewed custody/smart-account execution architecture and explicitly enabled signing/broadcast

## Celo perpetual layer

Horris targets UpDown on Celo mainnet using metadata pinned from the public `UpDownDex/skills` repository at commit:

`33d93fcd5ff0ffb98872dc2964600933f7153052`

Registry markets: BTC/USDT, ETH/USDT, CELO/USDT, EURm/USDT, JPYm/USDT, NGNm/USDT, AUDm/USDT and GBPm/USDT.

Horris deliberately imposes tighter application limits than the venue:

| Profile | Max leverage | Max account risk at stop | Max margin use | Max notional |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 3x | 1% | 20% | $1,000 |
| Balanced | 5x | 2% | 35% | $5,000 |
| Aggressive | 10x | 4% | 50% | $10,000 |

The risk engine validates leverage, notional, margin use, stop direction, projected loss at stop, gross margin-exhaustion buffer, take-profit direction and reward/risk.

## Protected entry workflow

Horris currently implements the full **pre-broadcast** workflow:

1. user defines perp intent;
2. deterministic Horris policy approves or blocks it;
3. Horris compiles the exact UpDown MarketIncrease transaction;
4. live readiness checks pinned venue/market/token/oracle bytecode, USDT balance, Router allowance, CELO fee balance and oracle freshness;
5. Horris `eth_call` simulates the exact `sendWnt → sendTokens → createOrder` multicall when allowance/readiness permit it;
6. only after that preflight passes, Horris may generate a review-only EIP-712 authorization payload tied to the exact calldata hash;
7. `HorrisUpDownCalldataGuard` independently decodes the actual multicall and derives collateral, notional and leverage from those bytes rather than trusting caller-reported numbers;
8. `HorrisUpDownAuthorization` verifies signer, nonce, expiry, exact calldata hash, receiver and market, then routes the derived values plus signed account/stop context through `HorrisPerpPolicy`;
9. a read-only authorization simulation endpoint can prove that a future signature + exact calldata pass the entire onchain authorization stack without consuming the nonce;
10. **the current app still has no UpDown broadcast path.**

After any future broadcast, Horris must re-read actual UpDown state rather than trust a transaction hash. Pending entry → live position → protection-required/protected is handled by the state machine, including partial stop coverage, frozen stops, pending exposure and cancellation recovery.

UpDown requires protection orders after a live position exists, so Horris does not claim atomic entry + stop protection.

## Onchain perp safety stack

### `HorrisUpDownCalldataGuard`

Fail-closed decoder for the exact three-call MarketIncrease shape. It pins the ExchangeRouter, OrderVault and USDT, rejects extra/reordered calls, validates order fields, allowlists markets and derives leverage/notional from actual calldata.

### `HorrisUpDownAuthorization`

Replay-safe EIP-712 boundary. It binds authorization to:

- exact calldata hash;
- receiver;
- market;
- account balance used for risk calculation;
- stop distance;
- nonce;
- deadline.

The owner can rotate the dedicated authorizer and invalidate unused nonces. A nonce is consumed only after signature, calldata inspection and policy checks succeed on a real state-changing call.

### `HorrisPerpPolicy`

Receives normalized values after the calldata firewall. It enforces allowlisted markets, leverage, notional, account-risk, margin-utilization and stop-buffer limits.

All three admin contracts use two-step ownership transfer so deployment control can be proposed to, then explicitly accepted by, a long-term multisig/admin.

## Main perp APIs

- `POST /api/perps/analyze` — deterministic risk verdict
- `POST /api/perps/order-preview` — exact unsigned MarketIncrease + live readiness + `eth_call` + optional review-only EIP-712 payload
- `GET /api/perps/positions` — live UpDown positions
- `GET /api/perps/orders` — live pending orders
- `GET /api/perps/risk-state` — live state + protection phases
- `POST /api/perps/protection-preview` — fresh-state stop/TP compilation + oracle + fee + `eth_call`
- `POST /api/perps/cancel-preview` — fresh-state cancellation compilation + `eth_call`
- `GET /api/perps/confirm-entry` — expected entry confirmation from actual venue state
- `POST /api/perps/authorization-simulate` — simulate a future EIP-712 signature through Authorization → CalldataGuard → PerpPolicy without changing state

None of these endpoints broadcast an UpDown transaction.

## Discord

Production Discord interactions are Ed25519 verified and timestamp-bounded. Current commands are:

- `/strategy` — stablecoin strategy proposal
- `/risk` — stablecoin policy check
- `/perp-risk` — deterministic perp risk analysis
- `/perp-status` — live UpDown positions, stop coverage and Horris protection phase
- `/help`

Discord remains analysis/read-only. It does not request signatures or submit orders.

## SDK

`HorrisClient` exposes stablecoin strategy/policy helpers plus perp risk analysis, unsigned UpDown order compilation, EIP-712 authorization construction and protection-state derivation. Pure Horris risk configuration is isolated from the Mento SDK so risk/Discord/perp tests do not depend on Mento runtime internals.

## Hardened Mento testnet path

The first real execution proof remains Mento USDC → USDm on Celo Sepolia. `HorrisPolicyVault` and `HorrisMentoAdapter` enforce owner custody/emergency withdrawal, revocable agents, execution/daily limits, allowlisted assets/adapters, quote-derived slippage bounds, real token balance accounting, immutable venue endpoints, approved route factories, exact approvals, pause/reentrancy guards and frontend simulation.

Celo Sepolia:

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

After configuring deployed addresses:

```bash
npm run verify:deployment   # Celo Sepolia vault/Mento stack
npm run verify:perp-guard   # Celo mainnet read-only perp policy/guard/auth wiring
```

The perp deployment script reads `HORRIS_PERP_AUTHORIZER` and `HORRIS_PERP_OWNER`. It proposes ownership of Policy, Guard and Authorization to the intended long-term owner; that address must explicitly accept ownership after verification.

## Remaining release boundary

The code now verifies substantially more than a frontend prototype, but two external gates remain:

1. deploy/verify the tested vault/Mento stack on Celo Sepolia and record a small end-to-end testnet execution;
2. do **not** enable UpDown mainnet signing/broadcast until the custody/smart-account execution model is independently reviewed and the asynchronous entry → protection failure/recovery process has been exercised against the deployed contracts.

See [`SECURITY.md`](SECURITY.md).

Never commit, paste or send a deployer private key, seed phrase, Discord token or other secret through chat or source control.
