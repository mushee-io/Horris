// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisPolicyVault.sol";
import "../contracts/adapters/HorrisMentoAdapter.sol";

interface Vm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployHorris {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address constant CELO_SEPOLIA_USDC = 0x01C5C0122039549AD1493B8220cABEdD739BC44E;
    address constant CELO_SEPOLIA_USDM = 0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b;
    address constant MENTO_ROUTER = 0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd;

    function run() external returns (HorrisPolicyVault vault, HorrisMentoAdapter adapter) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address agent = vm.envAddress("HORRIS_AGENT");
        vm.startBroadcast(deployerKey);
        vault = new HorrisPolicyVault(agent, 1_000e6, 2_500e6, 50);
        adapter = new HorrisMentoAdapter(address(vault), MENTO_ROUTER, CELO_SEPOLIA_USDC, CELO_SEPOLIA_USDM);
        vault.setAllowedAsset(CELO_SEPOLIA_USDC, true);
        vault.setAllowedAsset(CELO_SEPOLIA_USDM, true);
        vault.setAllowedAdapter(address(adapter), true);
        vm.stopBroadcast();
    }
}
