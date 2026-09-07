import { parseAbi } from "viem";

export const ERC8004_CHAIN_ID = 42220 as const;
export const ERC8004_CHAIN_NAME = "Celo" as const;
export const ERC8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const ERC8004_AGENT_REGISTRY = `eip155:${ERC8004_CHAIN_ID}:${ERC8004_IDENTITY_REGISTRY}` as const;
export const ERC8004_AGENT_URI = "https://horris-delta.vercel.app/.well-known/agent-registration.json" as const;
export const ERC8004_EXPLORER_BASE = "https://celoscan.io" as const;
export const CELO_MAINNET_RPC = "https://forno.celo.org" as const;

export const ERC8004_IDENTITY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
