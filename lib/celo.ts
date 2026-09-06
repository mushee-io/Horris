import { createPublicClient, http, type Address } from "viem";
import { celoSepolia } from "viem/chains";

export const CELO_SEPOLIA_RPC = "https://forno.celo-sepolia.celo-testnet.org";
export const CELO_SEPOLIA_EXPLORER = "https://celo-sepolia.blockscout.com";

export const TOKENS = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E" as Address,
    decimals: 6,
  },
  USDm: {
    symbol: "USDm",
    name: "Mento Dollar",
    address: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as Address,
    decimals: 18,
  },
} as const;

export const MENTO_ROUTER = "0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd" as Address;
export const MENTO_FPMM_FACTORY = "0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980" as Address;

export const publicClient = createPublicClient({
  chain: celoSepolia,
  transport: http(CELO_SEPOLIA_RPC),
});

export const celoSepoliaWalletParams = {
  chainId: "0xaa044c",
  chainName: "Celo Sepolia",
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
  rpcUrls: [CELO_SEPOLIA_RPC],
  blockExplorerUrls: [CELO_SEPOLIA_EXPLORER],
};
