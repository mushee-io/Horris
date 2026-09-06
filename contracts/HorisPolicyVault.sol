// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title HorrisPolicyVault
/// @notice User-controlled ERC20 vault for Horris testnet execution.
/// @dev Unaudited testnet code. Do not use with production funds.
contract HorrisPolicyVault {
    address public immutable owner;
    address public agent;
    bool public paused;

    mapping(address => bool) public allowedAssets;
    mapping(address => uint256) public depositedByAsset;

    event Deposited(address indexed asset, uint256 amount);
    event Withdrawn(address indexed asset, uint256 amount, address indexed recipient);
    event AgentUpdated(address indexed agent);
    event PauseUpdated(bool paused);
    event AssetPolicyUpdated(address indexed asset, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    constructor(address initialAgent) {
        owner = msg.sender;
        agent = initialAgent;
    }

    function setAgent(address newAgent) external onlyOwner {
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    function revokeAgent() external onlyOwner {
        agent = address(0);
        emit AgentUpdated(address(0));
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseUpdated(value);
    }

    function setAllowedAsset(address asset, bool allowed) external onlyOwner {
        require(asset != address(0), "ZERO_ASSET");
        allowedAssets[asset] = allowed;
        emit AssetPolicyUpdated(asset, allowed);
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
        require(amount > 0, "ZERO_AMOUNT");
        require(amount <= depositedByAsset[asset], "INSUFFICIENT_DEPOSIT");

        depositedByAsset[asset] -= amount;
        require(IERC20(asset).transfer(recipient, amount), "TRANSFER_FAILED");
        emit Withdrawn(asset, amount, recipient);
    }

    function vaultBalance(address asset) external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }
}
