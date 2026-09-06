# Horris security model

Horris is unaudited testnet-stage software. Do not use production funds through the Horris vault, and do not treat the current UpDown integration as an approved mainnet execution system.

## Core rule

Strategy/AI output is advisory. Horris must fail closed when custody, venue state, risk policy, oracle state, transaction compilation or simulation cannot be independently checked.

## Stablecoin custody boundary

`HorrisPolicyVault` on Celo Sepolia enforces owner custody, revocable agent execution, pause, asset/adapter allowlists, mandatory execution/daily caps, quote-derived slippage limits, actual input/output balance accounting, exact approvals and reentrancy protection.

`HorrisMentoAdapter` pins the Mento Router, FPMM factory, USDC and USDm. Routes must be continuous, 1–3 hops, use the pinned factory and end at the configured output asset. Output is measured by balance delta before funds return to the vault.

The owner can still change configured risk/allowlist policy within hard-coded contract bounds. Horris contracts have not received an independent audit or formal verification.

## Perpetual boundary

The current perp subsystem targets UpDown on Celo mainnet but **cannot broadcast an UpDown transaction**.

`HorrisPerpPolicy` is a venue-independent guard. It checks market allowlisting, leverage, maximum notional, projected account risk, margin utilization and a conservative stop buffer. It does not independently derive those values from UpDown calldata, so it is not yet a sufficient authorization boundary for mainnet execution.

A future execution architecture must derive/verify the exact venue values it submits and couple them to Horris policy before signing is enabled.

## UpDown read/compile protections

Current Horris code:

- pins UpDown contract/market metadata from a known public source commit;
- verifies live contract bytecode before execution-bound readiness;
- reads positions using UpDown Reader;
- reads pending orders directly from UpDown DataStore;
- reads live increase/decrease execution-fee configuration from DataStore plus current Celo gas price;
- applies a 125% fee buffer and fails closed when fee reads fail;
- reads the UpDown Chainlink price provider and rejects invalid/stale (>10 minute) prices;
- compiles only Horris-approved MarketIncrease orders;
- limits acceptable-price slippage in the unsigned entry compiler;
- checks USDT balance, Router allowance and native CELO fee balance;
- can `eth_call` simulate the exact entry multicall when allowance/state make simulation meaningful;
- confirms a future entry using actual pending-order / live-position state rather than trusting a transaction hash;
- calculates active stop coverage from pending StopLossDecrease orders;
- treats frozen stops as blocking failures;
- compiles stop/TP protection only from a fresh live position read;
- subtracts existing active coverage and compiles only uncovered position size;
- rejects stop-loss/take-profit triggers on the wrong side of the fresh live oracle price;
- compiles protection as `sendWnt → createOrder` with no additional collateral approval;
- `eth_call` simulates exact protection calldata;
- re-reads pending order state before compiling a cancellation;
- can compile and simulate `cancelOrder` recovery calldata for frozen/pending exposure;
- never sets `executionEnabled` to true in the current perp API/state machine.

## Asynchronous protection risk

UpDown entry and protective decrease orders are separate asynchronous actions. A position can exist before a stop-loss order has been successfully created/executed by the venue.

Therefore Horris explicitly models:

- `awaiting-position`
- `protection-required`
- `protected`
- `review-exposure`
- `blocked`

A future signing system must not describe an entry as “protected” until the live position is observed and sufficient active stop coverage is visible in venue state.

If protection compilation or simulation fails after a future entry, the system must fail closed, prevent new exposure and surface a recovery path. It must not silently continue automation.

## Frontend/API safeguards

- wallet-direct Mento execution is disabled by default;
- stable vault execution is simulated before signing;
- perp analysis, entry compilation, protection compilation, recovery compilation and state monitoring are read-only/unsigned;
- no current perp API sends a transaction;
- Discord requests use Ed25519 verification and stale timestamp rejection;
- Discord commands are advisory only.

## Residual risks

Important remaining risks include:

- no independent audit/formal verification;
- Celo, Mento or UpDown vulnerabilities/configuration/governance changes;
- stale or compromised RPC/frontends;
- owner/agent key compromise;
- UpDown order semantics or DataStore layout changing after the pinned source revision;
- oracle outages, keeper delays, price impact, funding, fees and venue liquidation rules;
- `eth_call` success does not guarantee a later transaction will succeed because chain state can change;
- asynchronous entry → protection exposure cannot be made atomic by the current UpDown interface;
- the current `HorrisPerpPolicy` is not yet cryptographically coupled to actual UpDown order calldata;
- no current mainnet perp executor has been approved.

## Incident / recovery model

For a deployed Horris testnet vault: pause, revoke the agent, disable affected policies/adapters, withdraw accounted assets and preserve transaction evidence.

For future perp execution: stop creation of new exposure first. Re-read positions/orders, identify frozen or uncovered risk, prepare cancellation/close/protection recovery, and do not resume automation until venue state is unambiguous and reviewed.

## Secrets

Never commit or transmit private keys, seed phrases, Discord bot tokens or deployment credentials through source control, chat, screenshots or public logs.
