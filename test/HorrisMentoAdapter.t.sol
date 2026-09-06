// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/adapters/HorrisMentoAdapter.sol";

contract AdapterToken is IERC20Adapter {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { require(balanceOf[msg.sender] >= amount); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount); allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

contract MockMentoRouter is IMentoRouter {
    AdapterToken public immutable output;
    constructor(AdapterToken output_) { output = output_; }
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata, address to, uint256) external returns (uint256 amountOut) {
        amountOut = amountIn;
        require(amountOut >= amountOutMin, "MIN");
        output.mint(to, amountOut);
    }
}

contract AdapterVaultCaller {
    AdapterToken public immutable input;
    HorrisMentoAdapter public adapter;
    constructor(AdapterToken input_) { input = input_; }
    function setAdapter(HorrisMentoAdapter adapter_) external { adapter = adapter_; input.approve(address(adapter_), type(uint256).max); }
    function execute(uint256 amount, uint256 minOut, bytes calldata routeData, uint256 deadline) external returns (uint256) { return adapter.executeSwap(amount, minOut, routeData, deadline); }
}

contract HorrisMentoAdapterTest {
    AdapterToken input;
    AdapterToken output;
    MockMentoRouter router;
    AdapterVaultCaller vault;
    HorrisMentoAdapter adapter;

    constructor() {
        input = new AdapterToken(); output = new AdapterToken(); router = new MockMentoRouter(output); vault = new AdapterVaultCaller(input);
        adapter = new HorrisMentoAdapter(address(vault), address(router), address(input), address(output)); vault.setAdapter(adapter); input.mint(address(vault), 100e6);
    }

    function route(address assetIn, address assetOut) internal view returns (bytes memory) {
        IMentoRouter.Route[] memory routes = new IMentoRouter.Route[](1);
        routes[0] = IMentoRouter.Route({ from: assetIn, to: assetOut, factory: address(router) });
        return abi.encode(routes);
    }

    function testSwapReturnsOutputToVault() public {
        uint256 amountOut = vault.execute(10e6, 9e6, route(address(input), address(output)), block.timestamp + 5 minutes);
        require(amountOut == 10e6, "amount out"); require(output.balanceOf(address(vault)) == 10e6, "vault output");
    }

    function testRejectsBadOutput() public {
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, route(address(input), address(input)), block.timestamp + 5 minutes)));
        require(!ok, "bad output should revert");
    }

    function testRejectsLongDeadline() public {
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, route(address(input), address(output)), block.timestamp + 31 minutes)));
        require(!ok, "long deadline should revert");
    }
}
