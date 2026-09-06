// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HorrisPerpPolicy
/// @notice Venue-independent policy guard for normalized perpetual trade proposals.
/// @dev This contract does not execute trades or custody funds. A future venue adapter must recompute
///      or independently verify normalized proposal values before relying on this policy for execution.
contract HorrisPerpPolicy {
    address public immutable owner;
    address public agent;
    bool public paused;

    uint32 public constant BPS = 10_000;
    uint32 public constant ABSOLUTE_MAX_LEVERAGE_BPS = 100_000; // 10x
    uint16 public constant ABSOLUTE_MAX_ACCOUNT_RISK_BPS = 500; // 5%
    uint16 public constant ABSOLUTE_MAX_MARGIN_UTILIZATION_BPS = 5_000; // 50%

    struct Limits {
        uint32 maxLeverageBps; // 10,000 = 1x
        uint16 maxAccountRiskBps;
        uint16 maxMarginUtilizationBps;
        uint256 maxNotionalUsdE18;
    }

    struct Proposal {
        bytes32 marketId;
        uint256 marginUsdE18;
        uint256 notionalUsdE18;
        uint256 accountBalanceUsdE18;
        uint32 leverageBps;
        uint16 stopDistanceBps;
    }

    Limits public limits;
    mapping(bytes32 => bool) public allowedMarkets;

    event AgentUpdated(address indexed previousAgent, address indexed newAgent);
    event PausedUpdated(bool paused);
    event LimitsUpdated(uint32 maxLeverageBps, uint16 maxAccountRiskBps, uint16 maxMarginUtilizationBps, uint256 maxNotionalUsdE18);
    event MarketUpdated(bytes32 indexed marketId, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || (agent != address(0) && msg.sender == agent), "NOT_AUTHORIZED");
        _;
    }

    constructor(address agent_, Limits memory initialLimits) {
        owner = msg.sender;
        require(agent_ != msg.sender, "OWNER_AS_AGENT");
        agent = agent_;
        _setLimits(initialLimits);
    }

    function setAgent(address nextAgent) external onlyOwner {
        require(nextAgent != owner, "OWNER_AS_AGENT");
        emit AgentUpdated(agent, nextAgent);
        agent = nextAgent;
    }

    function revokeAgent() external onlyOwner {
        emit AgentUpdated(agent, address(0));
        agent = address(0);
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit PausedUpdated(nextPaused);
    }

    function setLimits(Limits calldata nextLimits) external onlyOwner {
        _setLimits(nextLimits);
    }

    function setMarket(bytes32 marketId, bool allowed) external onlyOwner {
        require(marketId != bytes32(0), "ZERO_MARKET");
        allowedMarkets[marketId] = allowed;
        emit MarketUpdated(marketId, allowed);
    }

    function validate(Proposal calldata proposal) external view onlyAuthorized returns (uint16 accountRiskBps, uint16 marginUtilizationBps) {
        require(!paused, "PAUSED");
        require(allowedMarkets[proposal.marketId], "MARKET_BLOCKED");
        require(proposal.marginUsdE18 > 0 && proposal.notionalUsdE18 > 0 && proposal.accountBalanceUsdE18 > 0, "ZERO_VALUE");
        require(proposal.marginUsdE18 <= proposal.accountBalanceUsdE18, "MARGIN_GT_ACCOUNT");
        require(proposal.leverageBps >= BPS && proposal.leverageBps <= limits.maxLeverageBps, "LEVERAGE_CAP");
        require(proposal.notionalUsdE18 <= limits.maxNotionalUsdE18, "NOTIONAL_CAP");
        require(proposal.stopDistanceBps > 0, "ZERO_STOP_DISTANCE");

        uint256 expectedNotional = proposal.marginUsdE18 * proposal.leverageBps / BPS;
        require(_withinOneWei(expectedNotional, proposal.notionalUsdE18), "NOTIONAL_MISMATCH");

        uint256 projectedLossUsdE18 = proposal.notionalUsdE18 * proposal.stopDistanceBps / BPS;
        uint256 risk = projectedLossUsdE18 * BPS / proposal.accountBalanceUsdE18;
        uint256 utilization = proposal.marginUsdE18 * BPS / proposal.accountBalanceUsdE18;
        require(risk <= type(uint16).max && utilization <= type(uint16).max, "BPS_OVERFLOW");
        accountRiskBps = uint16(risk);
        marginUtilizationBps = uint16(utilization);

        require(accountRiskBps <= limits.maxAccountRiskBps, "ACCOUNT_RISK_CAP");
        require(marginUtilizationBps <= limits.maxMarginUtilizationBps, "MARGIN_UTILIZATION_CAP");

        // A stop must be closer than the gross adverse move that would consume posted margin.
        // This is deliberately conservative and is NOT a venue liquidation-price calculation.
        uint256 grossMarginExhaustionMoveBps = uint256(BPS) * BPS / proposal.leverageBps;
        require(proposal.stopDistanceBps < grossMarginExhaustionMoveBps, "STOP_BUFFER");
    }

    function marketId(string calldata symbol) external pure returns (bytes32) {
        return keccak256(bytes(symbol));
    }

    function _setLimits(Limits memory nextLimits) internal {
        require(nextLimits.maxLeverageBps >= BPS && nextLimits.maxLeverageBps <= ABSOLUTE_MAX_LEVERAGE_BPS, "UNSAFE_LEVERAGE");
        require(nextLimits.maxAccountRiskBps > 0 && nextLimits.maxAccountRiskBps <= ABSOLUTE_MAX_ACCOUNT_RISK_BPS, "UNSAFE_ACCOUNT_RISK");
        require(nextLimits.maxMarginUtilizationBps > 0 && nextLimits.maxMarginUtilizationBps <= ABSOLUTE_MAX_MARGIN_UTILIZATION_BPS, "UNSAFE_MARGIN_UTILIZATION");
        require(nextLimits.maxNotionalUsdE18 > 0, "ZERO_NOTIONAL_CAP");
        limits = nextLimits;
        emit LimitsUpdated(nextLimits.maxLeverageBps, nextLimits.maxAccountRiskBps, nextLimits.maxMarginUtilizationBps, nextLimits.maxNotionalUsdE18);
    }

    function _withinOneWei(uint256 a, uint256 b) internal pure returns (bool) {
        return a == b || (a > b ? a - b : b - a) <= 1;
    }
}
