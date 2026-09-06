// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title HorrisPolicyVault
/// @notice User-controlled vault with hard execution policies for Horris agents.
/// @dev Unaudited testnet code. Do not use with production funds.
contract HorrisPolicyVault {
    address public immutable owner;
    address public agent;
    bool public paused;

    uint256 public maxExecutionAmount;
    uint256 public dailyExecutionLimit;
    uint256 public spentToday;
    uint64 public spendingDay;
    uint16 public maxSlippageBps;

    mapping(address => bool) public allowedAssets;
    mapping(address => bool) public allowedAdapters;
    mapping(address => uint256) public depositedByAsset;

    event Deposited(address indexed asset, uint256 amount);
    event Withdrawn(address indexed asset, uint256 amount, address indexed recipient);
    event AgentUpdated(address indexed agent);
    event PauseUpdated(bool paused);
    event AssetPolicyUpdated(address indexed asset, bool allowed);
    event AdapterPolicyUpdated(address indexed adapter, bool allowed);
    event RiskPolicyUpdated(uint256 maxExecutionAmount, uint256 dailyExecutionLimit, uint16 maxSlippageBps);
    event ExecutionAuthorized(address indexed adapter, address indexed asset, uint256 amount, uint16 slippageBps);

    modifier onlyOwner() { require(msg.sender == owner, "NOT_OWNER"); _; }
    modifier onlyAgentOrOwner() { require(msg.sender == agent || msg.sender == owner, "NOT_AUTHORIZED"); _; }
    modifier whenNotPaused() { require(!paused, "PAUSED"); _; }

    constructor(address initialAgent, uint256 initialMaxExecution, uint256 initialDailyLimit, uint16 initialMaxSlippageBps) {
        require(initialMaxSlippageBps <= 2_000, "SLIPPAGE_TOO_HIGH");
        owner = msg.sender;
        agent = initialAgent;
        maxExecutionAmount = initialMaxExecution;
        dailyExecutionLimit = initialDailyLimit;
        maxSlippageBps = initialMaxSlippageBps;
        spendingDay = uint64(block.timestamp / 1 days);
    }

    function setAgent(address newAgent) external onlyOwner { agent = newAgent; emit AgentUpdated(newAgent); }
    function revokeAgent() external onlyOwner { agent = address(0); emit AgentUpdated(address(0)); }
    function setPaused(bool value) external onlyOwner { paused = value; emit PauseUpdated(value); }

    function setAllowedAsset(address asset, bool allowed) external onlyOwner {
        require(asset != address(0), "ZERO_ASSET");
        allowedAssets[asset] = allowed;
        emit AssetPolicyUpdated(asset, allowed);
    }

    function setAllowedAdapter(address adapter, bool allowed) external onlyOwner {
        require(adapter != address(0), "ZERO_ADAPTER");
        allowedAdapters[adapter] = allowed;
        emit AdapterPolicyUpdated(adapter, allowed);
    }

    function setRiskPolicy(uint256 executionCap, uint256 dailyLimit, uint16 slippageCapBps) external onlyOwner {
        require(slippageCapBps <= 2_000, "SLIPPAGE_TOO_HIGH");
        require(executionCap <= dailyLimit || dailyLimit == 0, "CAP_GT_DAILY");
        maxExecutionAmount = executionCap;
        dailyExecutionLimit = dailyLimit;
        maxSlippageBps = slippageCapBps;
        emit RiskPolicyUpdated(executionCap, dailyLimit, slippageCapBps);
    }

    function deposit(address asset, uint256 amount) external onlyOwner whenNotPaused {
        require(allowedAssets[asset], "ASSET_BLOCKED");
        require(amount > 0, "ZERO_AMOUNT");
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");
        depositedByAsset[asset] += amount;
        emit Deposited(asset, amount);
    }

    function withdraw(address asset, uint256 amount, address recipient) external onlyOwner {
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(amount > 0 && amount <= depositedByAsset[asset], "BAD_AMOUNT");
        depositedByAsset[asset] -= amount;
        require(IERC20(asset).transfer(recipient, amount), "TRANSFER_FAILED");
        emit Withdrawn(asset, amount, recipient);
    }

    function authorizeExecution(address adapter, address asset, uint256 amount, uint16 slippageBps)
        external onlyAgentOrOwner whenNotPaused
    {
        require(allowedAdapters[adapter], "ADAPTER_BLOCKED");
        require(allowedAssets[asset], "ASSET_BLOCKED");
        require(amount > 0 && amount <= depositedByAsset[asset], "BAD_AMOUNT");
        require(maxExecutionAmount == 0 || amount <= maxExecutionAmount, "EXECUTION_CAP");
        require(slippageBps <= maxSlippageBps, "SLIPPAGE_CAP");

        uint64 today = uint64(block.timestamp / 1 days);
        if (today != spendingDay) {
            spendingDay = today;
            spentToday = 0;
        }
        require(dailyExecutionLimit == 0 || spentToday + amount <= dailyExecutionLimit, "DAILY_CAP");
        spentToday += amount;

        emit ExecutionAuthorized(adapter, asset, amount, slippageBps);
    }

    function vaultBalance(address asset) external view returns (uint256) { return IERC20(asset).balanceOf(address(this)); }
}
