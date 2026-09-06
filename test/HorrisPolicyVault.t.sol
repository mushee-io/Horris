// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisPolicyVault.sol";

contract MockToken is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { require(balanceOf[msg.sender] >= amount); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount); allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

contract MockAdapter is IHorrisAdapter {
    IERC20 public immutable token;
    constructor(IERC20 token_) { token = token_; }
    function executeSwap(uint256 amountIn, uint256, bytes calldata, uint256) external returns (uint256) {
        require(token.transferFrom(msg.sender, address(this), amountIn));
        return amountIn;
    }
}

contract HorrisPolicyVaultTest {
    MockToken token;
    MockAdapter adapter;
    HorrisPolicyVault vault;

    constructor() {
        token = new MockToken();
        vault = new HorrisPolicyVault(address(this), 100e6, 250e6, 50);
        adapter = new MockAdapter(token);
        vault.setAllowedAsset(address(token), true);
        vault.setAllowedAdapter(address(adapter), true);
        token.mint(address(this), 500e6);
        token.approve(address(vault), type(uint256).max);
    }

    function testDepositAndWithdraw() public {
        vault.deposit(address(token), 200e6);
        require(vault.depositedByAsset(address(token)) == 200e6, "deposit accounting");
        vault.withdraw(address(token), 50e6, address(this));
        require(vault.depositedByAsset(address(token)) == 150e6, "withdraw accounting");
    }

    function testApprovedExecutionConsumesDailyLimit() public {
        vault.deposit(address(token), 200e6);
        vault.execute(address(adapter), address(token), 75e6, 70e6, 25, "", block.timestamp + 5 minutes);
        require(vault.spentToday() == 75e6, "daily spend");
        require(vault.depositedByAsset(address(token)) == 125e6, "execution accounting");
    }

    function testExecutionAboveCapReverts() public {
        vault.deposit(address(token), 200e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 101e6, 90e6, 25, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "execution cap should revert");
    }

    function testSlippageAbovePolicyReverts() public {
        vault.deposit(address(token), 100e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 50e6, 40e6, 51, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "slippage cap should revert");
    }

    function testRejectsLongDeadline() public {
        vault.deposit(address(token), 100e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 50e6, 40e6, 25, bytes(""), block.timestamp + 31 minutes)));
        require(!ok, "long deadline should revert");
    }

    function testPauseBlocksDeposit() public {
        vault.setPaused(true);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.deposit, (address(token), 10e6)));
        require(!ok, "paused deposit should revert");
    }
}
