# Horris security model

Horris is unaudited software. Do not use production funds through the Horris vault, and do not treat the current UpDown integration as an approved mainnet execution system.

## Core rule

Strategy/AI output is advisory. Horris must fail closed when custody, venue state, risk policy, oracle state, transaction compilation, authorization or simulation cannot be independently checked.

## Stablecoin custody boundary

`HorrisPolicyVault` on Celo Sepolia enforces owner custody, revocable agent execution, pause, asset/adapter allowlists, mandatory execution/daily caps, quote-derived slippage limits, actual input/output balance accounting, exact approvals and reentrancy protection.

`HorrisMentoAdapter` pins the Mento Router, FPMM factory, USDC and USDm. Routes must be continuous, 1–3 hops, use the pinned factory and end at the configured output asset. Output is measured by balance delta before funds return to the vault.

The stablecoin contracts have not received an independent audit or formal verification.

## Perpetual execution boundary

The current perp subsystem targets UpDown on Celo mainnet but the Horris application **cannot broadcast an UpDown transaction**.

The current onchain pre-broadcast stack is:

```text
EIP-712 Authorization
        ↓
HorrisUpDownAuthorization
        ↓
HorrisUpDownCalldataGuard
        ↓
HorrisPerpPolicy
```

This stack verifies an exact intended transaction and risk envelope. It is not yet a custody/execution architecture.

### `HorrisUpDownCalldataGuard`

The guard decodes the actual UpDown `multicall(bytes[])` and accepts only the exact MarketIncrease shape Horris currently supports:

1. `sendWnt(OrderVault, executionFee)`
2. `sendTokens(USDT, OrderVault, collateralAmount)`
3. `createOrder(params)`

It pins ExchangeRouter, OrderVault and USDT; rejects reordered/extra calls; requires the expected receiver; rejects callback/UI-fee/swap-path/referral behavior; allowlists markets; checks fee/value/collateral consistency; requires MarketIncrease order type; and derives notional/leverage from actual calldata rather than caller-reported metrics.

### `HorrisUpDownAuthorization`

The authorization contract verifies replay-safe EIP-712 signatures over:

- exact calldata hash;
- receiver;
- market;
- account balance used for risk calculation;
- stop distance;
- nonce;
- deadline.

The owner can rotate the dedicated EIP-712 authorizer and invalidate an unused nonce. High-s signatures and invalid `v` values are rejected. The nonce is consumed only after signature verification, calldata inspection and policy validation all succeed on a real state-changing call.

The application can generate the same typed-data payload only after the exact UpDown transaction passes live readiness and `eth_call` preflight. The current UI exposes it for review only and does not request a signature.

`POST /api/perps/authorization-simulate` can later test a supplied signature using `eth_call`. That proves the signature, nonce, exact calldata firewall and Horris policy currently agree without changing state or consuming the nonce.

### `HorrisPerpPolicy`

The policy receives normalized margin/notional/leverage values derived by the calldata guard plus signed account-balance/stop context. It enforces market allowlisting, leverage, maximum notional, projected account risk, margin utilization and a conservative stop buffer.

## Admin / key-management boundary

`HorrisPerpPolicy`, `HorrisUpDownCalldataGuard` and `HorrisUpDownAuthorization` use a shared two-step ownership model:

1. current owner proposes `pendingOwner`;
2. the intended owner must call `acceptOwnership`;
3. the current owner can cancel before acceptance.

The deployment script reads `HORRIS_PERP_OWNER` and proposes all three contracts to that intended long-term admin/multisig. The deployment verifier distinguishes a correctly pending handoff from an accepted handoff and rejects unrelated ownership state.

The EIP-712 `authorizer` is deliberately separate from contract ownership and is rotatable. A production setup should not reuse the deployer key as authorizer or long-term owner.

## UpDown read/compile protections

Current Horris code:

- pins UpDown contract/market metadata from a known public source commit;
- verifies live core, selected-market, collateral-token and oracle-provider bytecode before execution-bound readiness;
- reads positions from UpDown Reader and pending orders from DataStore;
- reads live execution-fee configuration plus Celo gas price and uses a fee buffer;
- reads the UpDown Chainlink price provider and rejects invalid/stale prices;
- compiles only supported Horris-approved MarketIncrease orders;
- bounds acceptable-price slippage;
- checks USDT balance, Router allowance and native CELO fee balance;
- `eth_call` simulates exact entry calldata when current state makes that meaningful;
- generates review-only EIP-712 authorization data from the exact compiled calldata hash only after clean preflight;
- confirms future entries from actual pending-order/live-position state rather than trusting transaction hashes;
- computes active stop coverage and treats frozen stops as blocking failures;
- compiles stop/TP protection only from fresh live position state and only for uncovered size;
- rejects wrong-side protection triggers against a fresh venue oracle;
- `eth_call` simulates exact protection and cancellation calldata;
- re-reads pending venue state before cancellation compilation;
- never sets perp `executionEnabled` to true in the current application.

## Asynchronous protection risk

UpDown entry and protective decrease orders are separate asynchronous actions. A position can exist before a stop-loss order is successfully created/executed by the venue.

Horris explicitly models:

- `awaiting-position`
- `protection-required`
- `protected`
- `review-exposure`
- `blocked`

A future signing system must not describe an entry as protected until the live position is observed and sufficient active stop coverage is visible in venue state. If protection compilation/simulation fails after a future entry, the system must block new exposure and surface recovery; it must not silently continue automation.

## Frontend / API / Discord safeguards

- wallet-direct Mento execution is disabled by default;
- stable vault execution is simulated before signing;
- perp entry/protection/cancellation paths are unsigned and read-only in the current app;
- no current perp API broadcasts a transaction;
- EIP-712 authorization data is review-only in the dashboard;
- authorization signature validation is available only as `eth_call` simulation;
- Discord production requests use Ed25519 verification and stale-timestamp rejection;
- `/perp-risk` performs deterministic risk analysis only;
- `/perp-status` reads live positions/orders and protection phases only;
- Discord never requests a wallet signature or submits an order.

## Residual risks

Important remaining risks include:

- no independent audit or formal verification;
- Celo, Mento or UpDown vulnerabilities/configuration/governance changes;
- stale or compromised RPC/frontends;
- owner, authorizer or user key compromise;
- UpDown order semantics/DataStore layout changing after the pinned source revision;
- oracle outages, keeper delays, price impact, funding, fees and liquidation mechanics;
- `eth_call` success does not guarantee a later transaction will succeed because chain state can change;
- asynchronous entry → protection exposure cannot be made atomic by the current UpDown interface;
- the current authorization stack validates exact intended calldata but does not solve custody or token-transfer authority for an automated executor;
- no Horris UpDown mainnet executor/smart-account module has been approved or enabled.

A future executor must not simply call UpDown from the authorization contract: UpDown collateral movement depends on the caller/token approval model. The custody/smart-account design must be reviewed before a broadcast path is implemented.

## Incident / recovery model

For a deployed Horris testnet vault: pause, revoke the agent, disable affected policies/adapters, withdraw accounted assets and preserve transaction evidence.

For a future perp deployment: pause authorization/policy/guard as appropriate, rotate the EIP-712 authorizer if compromised, invalidate known unused nonces, stop creation of new exposure, re-read live positions/orders, and resolve frozen/uncovered exposure before automation resumes.

## Secrets

Never commit or transmit private keys, seed phrases, Discord bot tokens or deployment credentials through source control, chat, screenshots or public logs.
