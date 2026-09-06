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
    IERC20 public immutable tokenIn;
    MockToken public immutable outputToken;
    address public immutable tokenOut;
    constructor(IERC20 tokenIn_, MockToken tokenOut_) { tokenIn = tokenIn_; outputToken = tokenOut_; tokenOut = address(tokenOut_); }
    function executeSwap(uint256 amountIn, uint256 amountOutMin, bytes calldata, uint256) external returns (uint256 amountOut) {
        require(tokenIn.transferFrom(msg.sender, address(this), amountIn));
        amountOut = amountIn;
        require(amountOut >= amountOutMin);
        outputToken.mint(msg.sender, amountOut);
    }
}

contract AgentCaller {
    function execute(HorrisPolicyVault vault, address adapter, address asset, uint256 amount) external returns (bool ok) {
        (ok,) = address(vault).call(abi.encodeCall(vault.execute, (adapter, asset, amount, amount - 1, 25, bytes(""), block.timestamp + 5 minutes)));
    }
}

contract HorrisPolicyVaultTest {
    MockToken token;
    MockToken outputToken;
    MockAdapter adapter;
    HorrisPolicyVault vault;

    constructor() {
        token = new MockToken();
        outputToken = new MockToken();
        vault = new HorrisPolicyVault(address(this), 100e6, 250e6, 50);
        adapter = new MockAdapter(token, outputToken);
        vault.setAllowedAsset(address(token), true);
        vault.setAllowedAsset(address(outputToken), true);
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

    function testApprovedExecutionAccountsOutput() public {
        vault.deposit(address(token), 200e6);
        vault.execute(address(adapter), address(token), 75e6, 70e6, 25, "", block.timestamp + 5 minutes);
        require(vault.spentToday() == 75e6, "daily spend");
        require(vault.depositedByAsset(address(token)) == 125e6, "input accounting");
        require(vault.depositedByAsset(address(outputToken)) == 75e6, "output accounting");
        require(outputToken.balanceOf(address(vault)) == 75e6, "output balance");
    }

    function testExecutionOutputCanBeWithdrawn() public {
        vault.deposit(address(token), 100e6);
        vault.execute(address(adapter), address(token), 50e6, 49e6, 25, "", block.timestamp + 5 minutes);
        uint256 beforeBalance = outputToken.balanceOf(address(this));
        vault.withdraw(address(outputToken), 50e6, address(this));
        require(outputToken.balanceOf(address(this)) == beforeBalance + 50e6, "output withdrawal");
        require(vault.depositedByAsset(address(outputToken)) == 0, "output cleared");
    }

    function testExecutionAboveCapReverts() public {
        vault.deposit(address(token), 200e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 101e6, 90e6, 25, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "execution cap should revert");
    }

    function testDailyCapReverts() public {
        vault.deposit(address(token), 300e6);
        vault.execute(address(adapter), address(token), 100e6, 99e6, 25, "", block.timestamp + 5 minutes);
        vault.execute(address(adapter), address(token), 100e6, 99e6, 25, "", block.timestamp + 5 minutes);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 51e6, 50e6, 25, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "daily cap should revert");
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

    function testBlockedAdapterReverts() public {
        MockAdapter blocked = new MockAdapter(token, outputToken);
        vault.deposit(address(token), 100e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(blocked), address(token), 50e6, 40e6, 25, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "blocked adapter should revert");
    }

    function testBlockedOutputAssetReverts() public {
        vault.setAllowedAsset(address(outputToken), false);
        vault.deposit(address(token), 100e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 50e6, 40e6, 25, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "blocked output should revert");
    }

    function testRevokedAgentCannotExecute() public {
        AgentCaller caller = new AgentCaller();
        vault.deposit(address(token), 100e6);
        vault.setAgent(address(caller));
        require(caller.execute(vault, address(adapter), address(token), 10e6), "agent should execute");
        vault.revokeAgent();
        require(!caller.execute(vault, address(adapter), address(token), 10e6), "revoked agent should fail");
    }

    function testPauseBlocksDepositAndExecution() public {
        vault.deposit(address(token), 100e6);
        vault.setPaused(true);
        (bool depositOk,) = address(vault).call(abi.encodeCall(vault.deposit, (address(token), 10e6)));
        (bool executeOk,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(token), 10e6, 9e6, 25, bytes(""), block.timestamp + 5 minutes)));
        require(!depositOk, "paused deposit should revert");
        require(!executeOk, "paused execution should revert");
    }
}
