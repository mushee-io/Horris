# Horris Celo Sepolia deployment runbook

Horris is testnet-stage and unaudited. Use a dedicated test wallet only.

## 1. Prerequisites

- Foundry installed
- a dedicated Celo Sepolia deployer wallet
- enough Celo Sepolia CELO for deployment gas
- an agent address (it may be the zero address if guarded agent execution is disabled initially)

Never commit the deployer private key.

## 2. Configure local environment

Copy `.env.example` to `.env` and set:

```bash
DEPLOYER_PRIVATE_KEY=<testnet-key>
HORRIS_AGENT=<agent-address>
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
```

## 3. Test before deployment

```bash
forge test -vv
forge build --sizes
npm install
npm run typecheck
npm run build
```

All four commands must pass before deployment.

## 4. Deploy

```bash
source .env
forge script script/DeployHorris.s.sol:DeployHorris \
  --rpc-url "$CELO_SEPOLIA_RPC_URL" \
  --broadcast -vvvv
```

Record the deployed `HorrisPolicyVault` address, `HorrisMentoAdapter` address and deployment block.

## 5. Configure the web application

Set:

```bash
NEXT_PUBLIC_HORRIS_VAULT=<vault-address>
NEXT_PUBLIC_HORRIS_MENTO_ADAPTER=<adapter-address>
NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK=<deployment-block>
```

Rebuild the application after changing public environment variables.

## 6. Smoke test

Use a small amount of test USDC only.

1. Connect the vault-owner wallet on Celo Sepolia.
2. Approve and deposit test USDC into the Horris vault.
3. Confirm the dashboard reports the vault balance and risk policy.
4. Generate a Mento USDC → USDm quote/route.
5. Simulate the exact vault execution before requesting a signature.
6. Execute through `HorrisPolicyVault.execute`, not directly from the wallet to Mento.
7. Confirm USDC accounting decreased and USDm arrived at the vault.
8. Confirm `ExecutionCompleted` and `SwapExecuted` logs on the explorer.
9. Withdraw a small test amount back to the owner.

## 7. Release acceptance

A testnet release is accepted only when:

- GitHub CI is green;
- contracts are deployed from the tested commit;
- deployed addresses are recorded in the app configuration;
- the UI uses the vault path for the demo;
- deposit, policy simulation, execution and withdrawal succeed on Celo Sepolia;
- explorer transaction links are captured for the grant demo;
- no production funds are used.
