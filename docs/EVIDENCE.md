# Horris Celo Sepolia evidence

This file records only transactions and state that were actually observed during the Horris testnet build. It deliberately does not invent a successful swap or UpDown testnet fill.

## Deployment

- Vault: `0xEd97E9c79599cFB671D59063F8aE446b9C5e0497`
- Mento adapter: `0xbf1abbE40d9B4Fea970Cf9E2b397109eC1D06CEc`
- Owner/deployer: `0xB11c08D9aCfB8C71207e497Ae40cFC8aF1052A51`
- Agent: `0x5DD6B8FaE358299dac805c912FD5c3078861178f`

The deployment test suite proves the vault is the deployer's CREATE nonce 0 address and the adapter is the immediately following nonce 1 address from `DeployHorris.s.sol`.

## Real USDC funding

A real 5 USDC testnet deposit was made into the Horris vault.

- USDC approval tx: `0xdeaea8d4ba60f6ae47f98f8a57e18c4672b55ceddfab9cbd460e0e81046c7d47`
- Vault deposit tx: `0x4fc1449f75aaf1fff73a20dc20685213c4c7c0effcafe839b2c162862740e19f`
- Observed vault USDC balance/accounting: `5,000,000` raw units = 5 USDC

## Mento execution status

The USDC → USDm route was quoted successfully, but the external Celo Sepolia Mento pool did not have enough USDm reserve for the tested swap. A direct Router simulation reverted with `InsufficientLiquidity` (`0xbb55fd27`). Horris therefore does not claim a successful swap and its execution wrapper fails closed before wallet broadcast when this condition is detected.

A direct Router approval transaction used during diagnosis was:

- `0x10e1733ea1c09d840edc110e5adbd4a1c9ce474391a71f3b2108a0cb07804934`

No Horris vault swap was broadcast after the liquidity failure was isolated.

## UpDown status

Horris has verified Celo-mainnet UpDown read-only infrastructure and compiles/simulates unsigned transaction plans. No genuine UpDown Celo Sepolia deployment has been verified, so Horris explicitly keeps testnet execution, signing and broadcast disabled.

## Release rule

Explorer/source-verification links should be added when available, but only for genuine observed transactions/contracts. Never replace missing evidence with mock hashes, fake fills or screenshots presented as onchain proof.
