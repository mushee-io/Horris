// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HorisPolicyVault
/// @notice Minimal policy layer for the Horis testnet MVP.
/// @dev This contract is intentionally small and unaudited. Do not use with production funds.
contract HorisPolicyVault {
    address public immutable owner;
    address public agent;
    bool public paused;
    uint16 public maxDrawdownBps;

    mapping(address => bool) public allowedAssets;
    mapping(address => bool) public allowedTargets;

    event AgentUpdated(address indexed agent);
    event PauseUpdated(bool paused);
    event RiskUpdated(uint16 maxDrawdownBps);
    event AssetPolicyUpdated(address indexed asset, bool allowed);
    event TargetPolicyUpdated(address indexed target, bool allowed);
    event ExecutionAuthorized(address indexed target, address indexed asset, uint256 amount, bytes data);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "NOT_AGENT");
        _;
    }

    constructor(address initialAgent, uint16 initialMaxDrawdownBps) {
        require(initialMaxDrawdownBps <= 10_000, "BAD_BPS");
        owner = msg.sender;
        agent = initialAgent;
        maxDrawdownBps = initialMaxDrawdownBps;
    }

    function setAgent(address newAgent) external onlyOwner {
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseUpdated(value);
    }

    function setMaxDrawdownBps(uint16 value) external onlyOwner {
        require(value <= 10_000, "BAD_BPS");
        maxDrawdownBps = value;
        emit RiskUpdated(value);
    }

    function setAllowedAsset(address asset, bool allowed) external onlyOwner {
        allowedAssets[asset] = allowed;
        emit AssetPolicyUpdated(asset, allowed);
    }

    function setAllowedTarget(address target, bool allowed) external onlyOwner {
        allowedTargets[target] = allowed;
        emit TargetPolicyUpdated(target, allowed);
    }

    function authorizeExecution(address target, address asset, uint256 amount, bytes calldata data)
        external
        onlyAgent
    {
        require(!paused, "PAUSED");
        require(allowedAssets[asset], "ASSET_BLOCKED");
        require(allowedTargets[target], "TARGET_BLOCKED");
        require(amount > 0, "ZERO_AMOUNT");

        emit ExecutionAuthorized(target, asset, amount, data);
    }
}
