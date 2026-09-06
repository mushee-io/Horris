# Horris Celo Sepolia deployment runbook

Horris is testnet-stage and unaudited. Use a dedicated Celo Sepolia wallet and test assets only.

## 1. Prerequisites

- Foundry installed
- Node.js 22+
- a dedicated Celo Sepolia deployer wallet
- enough Celo Sepolia CELO for deployment gas
- a separate nonzero Horris agent address

Never commit, paste into chat, screenshot or publicly log the deployer private key or Discord bot token.

## 2. Pinned Celo Sepolia dependencies

The tested deployment script pins:

- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento v3 Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Mento FPMM Factory: `0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980`

If Mento changes these deployments, stop and re-review/retest Horris rather than silently changing addresses in production configuration.

## 3. Configure the secure deployment environment

Copy `.env.example` to a local untracked `.env` or use an equivalent secrets manager:

```bash
DEPLOYER_PRIVATE_KEY=<dedicated-testnet-key>
HORRIS_AGENT=<separate-agent-address>
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
```

The deployment script rejects a zero agent. The vault itself supports later agent revocation.

## 4. Release gate before signing

From the exact commit that will be deployed, all commands must pass:

```bash
npm install --no-audit --no-fund
npm run typecheck
npm run build
forge test -vv
forge build --sizes
```

Also confirm the current GitHub Actions run for that same commit is green.

## 5. Deploy

Load secrets only in the secure shell/environment and broadcast:

```bash
source .env
forge script script/DeployHorris.s.sol:DeployHorris \
  --rpc-url "$CELO_SEPOLIA_RPC_URL" \
  --broadcast -vvvv
```

Record:

- tested git commit SHA
- deployment transaction hash/block
- `HorrisPolicyVault` address
- `HorrisMentoAdapter` address
- deployer/owner address
- configured agent address

## 6. Verify deployed state before funding

Before depositing any USDC, read the contracts on Celo Sepolia and confirm:

- vault owner equals the expected deployer;
- agent equals the intended agent;
- max execution = `1,000 USDC`;
- daily limit = `2,500 USDC`;
- max slippage = `50 bps` / `0.50%`;
- USDC and USDm are allowlisted;
- only the deployed Horris Mento adapter is enabled for the demo;
- adapter vault points to the deployed vault;
- adapter Router, factory, tokenIn and tokenOut match the pinned addresses above.

Do not fund a deployment that fails any of these checks.

## 7. Configure the web application

Set public deployment values:

```bash
NEXT_PUBLIC_HORRIS_VAULT=<vault-address>
NEXT_PUBLIC_HORRIS_MENTO_ADAPTER=<adapter-address>
NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK=<deployment-block>
NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=false
```

Rebuild/redeploy after changing `NEXT_PUBLIC_*` values. The production/demo deployment should keep wallet-direct execution disabled.

## 8. End-to-end smoke test

Use the smallest practical amount of test USDC.

1. Connect the vault-owner wallet on Celo Sepolia.
2. Confirm the dashboard identifies it as `OWNER` and reports healthy accounting.
3. Approve and deposit test USDC into the Horris vault.
4. Confirm accounted and raw USDC balances are consistent.
5. Choose a risk profile compatible with the deployed 0.50% onchain slippage limit.
6. Review the route. The dashboard must preflight current authorization, pause state, balance, execution cap, daily budget and slippage policy.
7. Build the route through the official Mento SDK. Every hop must use the pinned FPMM factory.
8. Simulate the exact `HorrisPolicyVault.execute` call before signing.
9. Execute through vault → adapter → Mento Router.
10. Confirm the input approval to the adapter and adapter approval to Mento are not left as unintended standing approvals.
11. Confirm accounted USDC decreased by the input amount.
12. Confirm accounted/raw USDm increased by the actual output amount.
13. Confirm `ExecutionCompleted` and `SwapExecuted` logs on Celo Sepolia Blockscout.
14. Withdraw a small amount of USDm to the owner and verify accounting decreases correctly.
15. Pause the vault, confirm new deposits/executions fail, then confirm owner emergency withdrawal still works.
16. Revoke the agent and confirm it can no longer execute before restoring any intended demo configuration.

## 9. Discord, if included in the demo

Configure server-side only:

```bash
DISCORD_PUBLIC_KEY=<discord-public-key>
DISCORD_APPLICATION_ID=<application-id>
DISCORD_BOT_TOKEN=<secret-bot-token>
DISCORD_GUILD_ID=<optional-test-guild-id>
```

Register the commands:

```bash
npm run discord:register
```

Then set Discord's Interaction Endpoint URL to the deployed `/api/discord` route and verify:

- Discord PING succeeds;
- unsigned/invalid requests return 401;
- stale signed requests are rejected;
- `/help`, `/strategy` and `/risk` respond correctly;
- no Discord command can withdraw funds or bypass vault policy.

## 10. Blockscout verification and release evidence

Verify the deployed source using the exact compiler/settings from `foundry.toml` and preserve links for:

- vault contract
- adapter contract
- deployment transaction
- deposit transaction
- Horris execution transaction
- USDm withdrawal transaction

The release record should include the deployed git SHA and those explorer links so the demo can be independently reproduced.

## 11. Acceptance criteria

The Celo Sepolia MVP is accepted only when:

- GitHub CI is green on the deployed commit;
- both contracts are deployed from that exact commit;
- pinned external addresses and vault policy have been verified onchain;
- the web app is configured for vault execution with direct fallback disabled;
- deposit → quote → policy preflight → simulated execute → signed execute → USDm accounting → withdrawal succeeds;
- pause/revoke emergency controls are exercised successfully;
- explorer evidence is captured;
- no production funds or leaked credentials are involved.

If any acceptance item fails, keep the release labeled testnet/incomplete and do not weaken a policy check merely to make the demo pass.
