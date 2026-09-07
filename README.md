# Horris

**AI execution infrastructure for Celo with enforceable risk controls.**

Horris turns trade intent into structured AI proposals, checks them against deterministic risk policy, compiles venue-specific calldata, verifies live venue state, and keeps transaction authority outside the model.

> Testnet-stage and unaudited. Do not use production funds. UpDown signing/broadcast is intentionally disabled.

## Current architecture

```text
User / Dashboard / Discord / SDK
              ↓
        Horris AI (Groq)
              ↓
     Untrusted proposal boundary
              ↓
    Deterministic Horris policy
              ↓
       Exact venue preflight
              ↓
 Replay-safe authorization review
              ↓
 Explicit wallet approval boundary
              ↓
      Confirm → Protect → Monitor
```

The model can propose. It cannot approve its own proposal, sign a wallet transaction, bypass policy, or broadcast an order.

## What is built

- Groq `openai/gpt-oss-120b` advisor with strict structured output and fail-closed provider handling.
- Hostile AI-output boundary and deterministic perp risk engine.
- Replay-safe sessions and EIP-712 authorization review flow.
- UpDown Celo-mainnet unsigned order compiler, live readiness checks, oracle/fee reads and exact `eth_call` simulation.
- Live position/order monitoring, stop coverage, frozen-stop detection, pending-exposure checks and recovery state machine.
- `freezeNewRisk` orchestration when protection is missing or critical alerts exist.
- Stop-loss / take-profit and cancellation preview compilers.
- Onchain `HorrisPerpPolicy`, calldata firewall and replay-safe authorization contracts.
- Discord advisory/read-only commands.
- Hardened release CI, runtime readiness checks and `/api/health`.
- Dashboard Horris AI dock wired to the real hardened advisor endpoint.

## Real Celo Sepolia deployment

Horris has a real Celo Sepolia vault deployment and real test USDC deposit evidence.

- Vault: `0xEd97E9c79599cFB671D59063F8aE446b9C5e0497`
- Mento adapter: `0xbf1abbE40d9B4Fea970Cf9E2b397109eC1D06CEc`
- Owner/deployer: `0xB11c08D9aCfB8C71207e497Ae40cFC8aF1052A51`
- Agent: `0x5DD6B8FaE358299dac805c912FD5c3078861178f`
- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Mento FPMM factory: `0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980`

The adapter is the deterministic CREATE nonce-1 sibling of the known vault CREATE nonce-0 deployment from the same deployer script. Tests prove both derived addresses.

A real 5 USDC deposit has already been made to the vault. The Celo Sepolia Mento USDC/USDm pool currently lacks enough USDm liquidity for the tested swap size, so Horris correctly fails closed instead of pretending a swap succeeded.

## UpDown status

Horris pins UpDown's public Celo mainnet configuration from `UpDownDex/skills` commit:

`33d93fcd5ff0ffb98872dc2964600933f7153052`

Supported registry markets: BTC, ETH, CELO, EURm, JPYm, NGNm, AUDm and GBPm against USDT.

No genuine UpDown Celo Sepolia deployment is configured or advertised. Horris exposes mainnet analysis/readiness only; `testnetExecutionSupported`, signing and broadcast are all explicitly `false` in the capability boundary. No fake testnet fills.

## Perp lifecycle

`Analyze → Policy → Preflight → Authorize → Sign → Execute → Confirm → Protect → Monitor / Recover`

Current application behavior stops before real UpDown signing/broadcast. If a future entry is submitted, Horris must re-read actual venue state, must not blindly retry an uncertain entry, and must freeze new exposure until live stop protection is confirmed.

## Main APIs

- `POST /api/perps/advisor` — real Groq proposal, still non-executable
- `POST /api/perps/analyze` — deterministic risk verdict
- `POST /api/perps/order-preview` — exact unsigned order + readiness + simulation
- `POST /api/perps/authorization-simulate` — read-only authorization simulation
- `GET /api/perps/positions` — live UpDown positions
- `GET /api/perps/orders` — live UpDown orders
- `GET /api/perps/risk-state` — protection/risk state + `freezeNewRisk`
- `POST /api/perps/protection-preview` — stop/TP preview + simulation
- `POST /api/perps/cancel-preview` — cancellation preview + simulation
- `GET /api/perps/confirm-entry` — entry confirmation from venue state
- `GET /api/health` — Vercel/runtime readiness without exposing secrets

None of the UpDown APIs broadcast a transaction.

## Local validation

```bash
npm install
npm run verify:release
npm test
npm run typecheck
npm run build
npm run verify:updown
forge test -vv
forge build --sizes
```

GitHub Actions runs the same release, test, typecheck, build and contract gates on `main`.

## Vercel

Public Celo Sepolia vault/adapter addresses are pinned in code, so the first web deployment does not need manual public-address setup. Keep wallet-direct fallback disabled.

Required server secret:

```bash
GROQ_API_KEY=<set privately in Vercel>
```

Optional model override:

```bash
GROQ_MODEL=openai/gpt-oss-120b
```

Never put the Groq key, private keys, seed phrases or bot tokens in `NEXT_PUBLIC_*`, source control or chat.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`SECURITY.md`](SECURITY.md).
