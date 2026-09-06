// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisPerpPolicy.sol";

contract PerpAgentCaller {
    function validate(HorrisPerpPolicy policy, HorrisPerpPolicy.Proposal calldata proposal) external view returns (bool ok) {
        try policy.validate(proposal) returns (uint16, uint16) { return true; } catch { return false; }
    }
}

contract HorrisPerpPolicyTest {
    HorrisPerpPolicy policy;
    bytes32 constant BTC = keccak256("BTC");

    constructor() {
        policy = new HorrisPerpPolicy(address(0), HorrisPerpPolicy.Limits({
            maxLeverageBps: 50_000,
            maxAccountRiskBps: 200,
            maxMarginUtilizationBps: 3_500,
            maxNotionalUsdE18: 5_000e18
        }));
        policy.setMarket(BTC, true);
    }

    function proposal() internal pure returns (HorrisPerpPolicy.Proposal memory) {
        return HorrisPerpPolicy.Proposal({
            marketId: BTC,
            marginUsdE18: 100e18,
            notionalUsdE18: 300e18,
            accountBalanceUsdE18: 1_000e18,
            leverageBps: 30_000,
            stopDistanceBps: 200
        });
    }

    function testValidProposalPasses() public view {
        (uint16 accountRiskBps, uint16 utilizationBps) = policy.validate(proposal());
        require(accountRiskBps == 60, "risk bps");
        require(utilizationBps == 1_000, "utilization bps");
    }

    function testLeverageCapBlocksTrade() public {
        HorrisPerpPolicy.Proposal memory p = proposal();
        p.leverageBps = 60_000;
        p.notionalUsdE18 = 600e18;
        (bool ok,) = address(policy).call(abi.encodeCall(policy.validate, (p)));
        require(!ok, "unsafe leverage accepted");
    }

    function testNotionalMismatchBlocksCallerLies() public {
        HorrisPerpPolicy.Proposal memory p = proposal();
        p.notionalUsdE18 = 200e18;
        (bool ok,) = address(policy).call(abi.encodeCall(policy.validate, (p)));
        require(!ok, "notional mismatch accepted");
    }

    function testAccountRiskCapBlocksWideStop() public {
        HorrisPerpPolicy.Proposal memory p = proposal();
        p.stopDistanceBps = 1_000;
        (bool ok,) = address(policy).call(abi.encodeCall(policy.validate, (p)));
        require(!ok, "account risk cap bypassed");
    }

    function testMarginUtilizationCapBlocksOversizing() public {
        HorrisPerpPolicy.Proposal memory p = proposal();
        p.marginUsdE18 = 400e18;
        p.notionalUsdE18 = 1_200e18;
        (bool ok,) = address(policy).call(abi.encodeCall(policy.validate, (p)));
        require(!ok, "margin utilization cap bypassed");
    }

    function testBlockedMarketFails() public {
        HorrisPerpPolicy.Proposal memory p = proposal();
        p.marketId = keccak256("DOGE");
        (bool ok,) = address(policy).call(abi.encodeCall(policy.validate, (p)));
        require(!ok, "blocked market accepted");
    }

    function testPauseFailsClosed() public {
        policy.setPaused(true);
        (bool ok,) = address(policy).call(abi.encodeCall(policy.validate, (proposal())));
        require(!ok, "paused policy accepted proposal");
    }

    function testAgentCanValidateAndRevocationWorks() public {
        PerpAgentCaller agent = new PerpAgentCaller();
        policy.setAgent(address(agent));
        require(agent.validate(policy, proposal()), "agent should validate");
        policy.revokeAgent();
        require(!agent.validate(policy, proposal()), "revoked agent should fail");
    }

    function testUnsafeLimitConfigurationRejected() public {
        HorrisPerpPolicy.Limits memory badLeverage = HorrisPerpPolicy.Limits({ maxLeverageBps: 110_000, maxAccountRiskBps: 200, maxMarginUtilizationBps: 3_500, maxNotionalUsdE18: 5_000e18 });
        HorrisPerpPolicy.Limits memory badRisk = HorrisPerpPolicy.Limits({ maxLeverageBps: 50_000, maxAccountRiskBps: 600, maxMarginUtilizationBps: 3_500, maxNotionalUsdE18: 5_000e18 });
        HorrisPerpPolicy.Limits memory zeroNotional = HorrisPerpPolicy.Limits({ maxLeverageBps: 50_000, maxAccountRiskBps: 200, maxMarginUtilizationBps: 3_500, maxNotionalUsdE18: 0 });
        (bool leverageOk,) = address(policy).call(abi.encodeCall(policy.setLimits, (badLeverage)));
        (bool riskOk,) = address(policy).call(abi.encodeCall(policy.setLimits, (badRisk)));
        (bool notionalOk,) = address(policy).call(abi.encodeCall(policy.setLimits, (zeroNotional)));
        require(!leverageOk && !riskOk && !notionalOk, "unsafe limits accepted");
    }

    function testOwnerCannotBeAgent() public {
        (bool ok,) = address(policy).call(abi.encodeCall(policy.setAgent, (address(this))));
        require(!ok, "owner accepted as agent");
    }
}
