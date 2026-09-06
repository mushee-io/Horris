// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisPolicyVault.sol";

contract AdversarialToken is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "ALLOWANCE");
        allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
}

contract AdversarialAdapter is IHorrisAdapter {
    IERC20 public immutable input;
    AdversarialToken public immutable output;
    address public immutable tokenOut;
    bool public lieAboutOutput;
    bool public zeroQuote;

    constructor(IERC20 input_, AdversarialToken output_) {
        input = input_; output = output_; tokenOut = address(output_);
    }

    function setLieAboutOutput(bool value) external { lieAboutOutput = value; }
    function setZeroQuote(bool value) external { zeroQuote = value; }

    function quote(uint256 amountIn, bytes calldata) external view returns (uint256) {
        return zeroQuote ? 0 : amountIn;
    }

    function executeSwap(uint256 amountIn, uint256 amountOutMin, bytes calldata, uint256) external returns (uint256 amountOut) {
        require(input.transferFrom(msg.sender, address(this), amountIn), "PULL");
        amountOut = amountIn;
        require(amountOut >= amountOutMin, "MIN");
        if (!lieAboutOutput) output.mint(msg.sender, amountOut);
    }
}

contract HorrisPolicyVaultAdversarialTest {
    AdversarialToken input;
    AdversarialToken output;
    AdversarialAdapter adapter;
    HorrisPolicyVault vault;

    constructor() {
        input = new AdversarialToken();
        output = new AdversarialToken();
        vault = new HorrisPolicyVault(address(0), 100e6, 250e6, 50);
        adapter = new AdversarialAdapter(input, output);
        vault.setAllowedAsset(address(input), true);
        vault.setAllowedAsset(address(output), true);
        vault.setAllowedAdapter(address(adapter), true);
        input.mint(address(this), 500e6);
        input.approve(address(vault), type(uint256).max);
    }

    function testRejectsZeroMinimumOutput() public {
        vault.deposit(address(input), 10e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(input), 10e6, 0, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "zero minimum accepted");
    }

    function testRejectsExpiredDeadline() public {
        vault.deposit(address(input), 10e6);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(input), 10e6, 9_950_000, bytes(""), 0)));
        require(!ok, "expired deadline accepted");
    }

    function testRejectsZeroAdapterQuote() public {
        vault.deposit(address(input), 10e6);
        adapter.setZeroQuote(true);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(input), 10e6, 9_950_000, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "zero quote accepted");
    }

    function testRejectsAdapterThatLiesAboutOutput() public {
        vault.deposit(address(input), 10e6);
        adapter.setLieAboutOutput(true);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(input), 10e6, 9_950_000, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "output balance mismatch accepted");
        require(vault.depositedByAsset(address(input)) == 10e6, "revert changed accounting");
        require(vault.spentToday() == 0, "revert consumed daily budget");
    }

    function testBlockedInputCannotExecuteAfterDeposit() public {
        vault.deposit(address(input), 10e6);
        vault.setAllowedAsset(address(input), false);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(input), 10e6, 9_950_000, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "blocked input executed");
    }

    function testCannotSpendBeyondRemainingAccountedInput() public {
        vault.deposit(address(input), 50e6);
        vault.execute(address(adapter), address(input), 50e6, 49_750_000, "", block.timestamp + 5 minutes);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (address(adapter), address(input), 1, 1, bytes(""), block.timestamp + 5 minutes)));
        require(!ok, "spent depleted input");
        require(vault.depositedByAsset(address(input)) == 0, "input not depleted");
        require(vault.depositedByAsset(address(output)) == 50e6, "output accounting wrong");
    }
}
