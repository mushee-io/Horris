// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
interface IHorrisAdapter {
    function tokenOut() external view returns (address);
    function quote(uint256 amountIn, bytes calldata routeData) external view returns (uint256 amountOut);
    function executeSwap(uint256 amountIn, uint256 amountOutMin, bytes calldata routeData, uint256 deadline) external returns (uint256 amountOut);
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
    uint256 private locked = 1;

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
    event ExecutionCompleted(address indexed adapter, address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut, uint16 slippageBps);

    modifier onlyOwner() { require(msg.sender == owner, "NOT_OWNER"); _; }
    modifier onlyAgentOrOwner() { require(msg.sender == agent || msg.sender == owner, "NOT_AUTHORIZED"); _; }
    modifier whenNotPaused() { require(!paused, "PAUSED"); _; }
    modifier nonReentrant() { require(locked == 1, "REENTRANT"); locked = 2; _; locked = 1; }

    constructor(address initialAgent, uint256 initialMaxExecution, uint256 initialDailyLimit, uint16 initialMaxSlippageBps) {
        require(initialMaxSlippageBps <= 2_000, "SLIPPAGE_TOO_HIGH");
        require(initialMaxExecution <= initialDailyLimit || initialDailyLimit == 0, "CAP_GT_DAILY");
        owner = msg.sender;
        agent = initialAgent;
        maxExecutionAmount = initialMaxExecution;
        dailyExecutionLimit = initialDailyLimit;
        maxSlippageBps = initialMaxSlippageBps;
        spendingDay = uint64(block.timestamp / 1 days);
    }

    function setAgent(address newAgent) external onlyOwner { require(newAgent != owner, "OWNER_IS_AGENT"); agent = newAgent; emit AgentUpdated(newAgent); }
    function revokeAgent() external onlyOwner { agent = address(0); emit AgentUpdated(address(0)); }
    function setPaused(bool value) external onlyOwner { paused = value; emit PauseUpdated(value); }
    function setAllowedAsset(address asset, bool allowed) external onlyOwner { require(asset != address(0), "ZERO_ASSET"); allowedAssets[asset] = allowed; emit AssetPolicyUpdated(asset, allowed); }
    function setAllowedAdapter(address adapter, bool allowed) external onlyOwner { require(adapter != address(0), "ZERO_ADAPTER"); allowedAdapters[adapter] = allowed; emit AdapterPolicyUpdated(adapter, allowed); }

    function setRiskPolicy(uint256 executionCap, uint256 dailyLimit, uint16 slippageCapBps) external onlyOwner {
        require(slippageCapBps <= 2_000, "SLIPPAGE_TOO_HIGH");
        require(executionCap <= dailyLimit || dailyLimit == 0, "CAP_GT_DAILY");
        maxExecutionAmount = executionCap;
        dailyExecutionLimit = dailyLimit;
        maxSlippageBps = slippageCapBps;
        emit RiskPolicyUpdated(executionCap, dailyLimit, slippageCapBps);
    }

    function deposit(address asset, uint256 amount) external onlyOwner whenNotPaused nonReentrant {
        require(allowedAssets[asset], "ASSET_BLOCKED");
        require(amount > 0, "ZERO_AMOUNT");
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");
        uint256 received = IERC20(asset).balanceOf(address(this)) - beforeBalance;
        require(received == amount, "FEE_TOKEN_UNSUPPORTED");
        depositedByAsset[asset] += received;
        emit Deposited(asset, received);
    }

    function withdraw(address asset, uint256 amount, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(amount > 0 && amount <= depositedByAsset[asset], "BAD_AMOUNT");
        depositedByAsset[asset] -= amount;
        require(IERC20(asset).transfer(recipient, amount), "TRANSFER_FAILED");
        emit Withdrawn(asset, amount, recipient);
    }

    function execute(address adapter, address assetIn, uint256 amountIn, uint256 amountOutMin, bytes calldata routeData, uint256 deadline)
        external onlyAgentOrOwner whenNotPaused nonReentrant returns (uint256 amountOut)
    {
        require(amountOutMin > 0, "ZERO_MIN_OUT");
        _consumePolicy(adapter, assetIn, amountIn, deadline);

        address assetOut = _validatedOutputAsset(adapter, assetIn);
        uint16 effectiveSlippageBps = _enforceQuotedSlippage(adapter, amountIn, amountOutMin, routeData);
        amountOut = _executeAdapter(adapter, assetIn, assetOut, amountIn, amountOutMin, routeData, deadline);

        depositedByAsset[assetIn] -= amountIn;
        depositedByAsset[assetOut] += amountOut;
        emit ExecutionCompleted(adapter, assetIn, assetOut, amountIn, amountOut, effectiveSlippageBps);
    }

    function _validatedOutputAsset(address adapter, address assetIn) internal view returns (address assetOut) {
        assetOut = IHorrisAdapter(adapter).tokenOut();
        require(assetOut != address(0) && assetOut != assetIn, "BAD_OUTPUT_ASSET");
        require(allowedAssets[assetOut], "OUTPUT_ASSET_BLOCKED");
    }

    function _enforceQuotedSlippage(address adapter, uint256 amountIn, uint256 amountOutMin, bytes calldata routeData)
        internal view returns (uint16 effectiveSlippageBps)
    {
        uint256 quotedOut = IHorrisAdapter(adapter).quote(amountIn, routeData);
        require(quotedOut > 0, "ZERO_QUOTE");
        uint256 minimumAllowed = (quotedOut * (10_000 - maxSlippageBps)) / 10_000;
        require(amountOutMin >= minimumAllowed, "SLIPPAGE_CAP");
        if (amountOutMin >= quotedOut) return 0;
        uint256 slippageRaw = ((quotedOut - amountOutMin) * 10_000) / quotedOut;
        require(slippageRaw <= type(uint16).max, "SLIPPAGE_OVERFLOW");
        return uint16(slippageRaw);
    }

    function _executeAdapter(
        address adapter,
        address assetIn,
        address assetOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes calldata routeData,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        uint256 beforeOut = IERC20(assetOut).balanceOf(address(this));
        require(IERC20(assetIn).approve(adapter, 0), "RESET_APPROVAL_FAILED");
        require(IERC20(assetIn).approve(adapter, amountIn), "APPROVAL_FAILED");
        amountOut = IHorrisAdapter(adapter).executeSwap(amountIn, amountOutMin, routeData, deadline);
        require(IERC20(assetIn).approve(adapter, 0), "CLEAR_APPROVAL_FAILED");
        require(amountOut >= amountOutMin, "MIN_OUT");
        uint256 receivedOut = IERC20(assetOut).balanceOf(address(this)) - beforeOut;
        require(receivedOut == amountOut, "OUTPUT_BALANCE_MISMATCH");
    }

    function _consumePolicy(address adapter, address asset, uint256 amount, uint256 deadline) internal {
        require(allowedAdapters[adapter], "ADAPTER_BLOCKED");
        require(allowedAssets[asset], "ASSET_BLOCKED");
        require(amount > 0 && amount <= depositedByAsset[asset], "BAD_AMOUNT");
        require(deadline >= block.timestamp && deadline <= block.timestamp + 30 minutes, "BAD_DEADLINE");
        require(maxExecutionAmount == 0 || amount <= maxExecutionAmount, "EXECUTION_CAP");
        uint64 today = uint64(block.timestamp / 1 days);
        if (today != spendingDay) { spendingDay = today; spentToday = 0; }
        require(dailyExecutionLimit == 0 || spentToday + amount <= dailyExecutionLimit, "DAILY_CAP");
        spentToday += amount;
    }

    function vaultBalance(address asset) external view returns (uint256) { return IERC20(asset).balanceOf(address(this)); }
}
