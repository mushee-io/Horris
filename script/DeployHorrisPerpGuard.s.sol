// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisPerpPolicy.sol";
import "../contracts/HorrisUpDownCalldataGuard.sol";
import "../contracts/HorrisUpDownAuthorization.sol";

interface VmPerpDeploy {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys the Horris UpDown inspection/authorization stack. It does NOT enable or submit UpDown trades.
contract DeployHorrisPerpGuard {
    VmPerpDeploy constant vm = VmPerpDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    address constant UPDOWN_EXCHANGE_ROUTER = 0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE;
    address constant UPDOWN_ORDER_VAULT = 0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc;
    address constant UPDOWN_USDT = 0xd96a1ac57a180a3819633bCE3dC602Bd8972f595;

    address constant BTC_MARKET = 0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771;
    address constant ETH_MARKET = 0x3d069FFd681B68BF281077516dd9006C2e4c818A;
    address constant CELO_MARKET = 0x1f39c2B41af79973b25F65E7a4234bc22aF250D7;
    address constant EURM_MARKET = 0x38995e0D3c25EE78D45A45A1311A2CA0544b0E6B;
    address constant JPYM_MARKET = 0xaaB05004Ac382adE5E70eEFC3C67035b5F31b990;
    address constant NGNM_MARKET = 0x1B07C05466D7dC15244969EbCf23520Aba4df9e7;
    address constant AUDM_MARKET = 0x22476a639D1bBDDE1919A226347360b32A2385Fe;
    address constant GBPM_MARKET = 0xc439330b3D59Be316936Ff62d1d22b377656Fc20;

    function run() external returns (HorrisPerpPolicy policy, HorrisUpDownCalldataGuard guard, HorrisUpDownAuthorization authorization) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address authorizer = vm.envAddress("HORRIS_PERP_AUTHORIZER");
        address intendedOwner = vm.envAddress("HORRIS_PERP_OWNER");
        require(authorizer != address(0), "ZERO_AUTHORIZER");
        require(intendedOwner != address(0), "ZERO_OWNER");

        vm.startBroadcast(deployerKey);

        HorrisPerpPolicy.Limits memory limits = HorrisPerpPolicy.Limits({
            maxLeverageBps: 50_000,
            maxAccountRiskBps: 200,
            maxMarginUtilizationBps: 3_500,
            maxNotionalUsdE18: 5_000e18
        });
        policy = new HorrisPerpPolicy(address(0), limits);
        guard = new HorrisUpDownCalldataGuard(UPDOWN_EXCHANGE_ROUTER, UPDOWN_ORDER_VAULT, UPDOWN_USDT, 50_000, 5_000e30);
        authorization = new HorrisUpDownAuthorization(authorizer, address(guard), address(policy));

        _configureMarket(policy, guard, authorization, BTC_MARKET, "BTC");
        _configureMarket(policy, guard, authorization, ETH_MARKET, "ETH");
        _configureMarket(policy, guard, authorization, CELO_MARKET, "CELO");
        _configureMarket(policy, guard, authorization, EURM_MARKET, "EURm");
        _configureMarket(policy, guard, authorization, JPYM_MARKET, "JPYm");
        _configureMarket(policy, guard, authorization, NGNM_MARKET, "NGNm");
        _configureMarket(policy, guard, authorization, AUDM_MARKET, "AUDm");
        _configureMarket(policy, guard, authorization, GBPM_MARKET, "GBPm");

        policy.setAgent(address(authorization));

        // Deliberately two-step. The intended owner must explicitly accept on each contract after deployment verification.
        policy.proposeOwner(intendedOwner);
        guard.proposeOwner(intendedOwner);
        authorization.proposeOwner(intendedOwner);

        vm.stopBroadcast();
    }

    function _configureMarket(HorrisPerpPolicy policy, HorrisUpDownCalldataGuard guard, HorrisUpDownAuthorization authorization, address market, string memory symbol) internal {
        bytes32 marketId = keccak256(bytes(symbol));
        policy.setMarket(marketId, true);
        guard.setMarket(market, true);
        authorization.setMarketId(market, marketId);
    }
}
