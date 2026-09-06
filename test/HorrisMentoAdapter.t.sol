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
    function getAmountsOut(uint256 amountIn, Route[] calldata routes) external pure returns (uint256[] memory amounts) {
        amounts = new uint256[](routes.length + 1);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < routes.length; i++) amounts[i + 1] = amountIn;
    }
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256) external returns (uint256[] memory amounts) {
        require(amountIn >= amountOutMin, "MIN"); output.mint(to, amountIn);
        amounts = new uint256[](routes.length + 1); amounts[0] = amountIn;
        for (uint256 i = 0; i < routes.length; i++) amounts[i + 1] = amountIn;
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
    AdapterToken input; AdapterToken output; MockMentoRouter router; AdapterVaultCaller vault; HorrisMentoAdapter adapter;

    constructor() {
        input = new AdapterToken(); output = new AdapterToken(); router = new MockMentoRouter(output); vault = new AdapterVaultCaller(input);
        adapter = new HorrisMentoAdapter(address(vault), address(router), address(router), address(input), address(output));
        vault.setAdapter(adapter); input.mint(address(vault), 100e6);
    }

    function route(address assetIn, address assetOut) internal view returns (bytes memory) {
        IMentoRouter.Route[] memory routes = new IMentoRouter.Route[](1);
        routes[0] = IMentoRouter.Route({ from: assetIn, to: assetOut, factory: address(router) });
        return abi.encode(routes);
    }

    function testQuoteAndSwapReturnsOutputToVault() public {
        bytes memory data = route(address(input), address(output));
        require(adapter.quote(10e6, data) == 10e6, "quote");
        uint256 amountOut = vault.execute(10e6, 9e6, data, block.timestamp + 5 minutes);
        require(amountOut == 10e6, "amount out"); require(output.balanceOf(address(vault)) == 10e6, "vault output");
        require(input.allowance(address(adapter), address(router)) == 0, "router approval not cleared");
    }

    function testOnlyVaultCanExecute() public {
        (bool ok,) = address(adapter).call(abi.encodeCall(adapter.executeSwap, (1e6, 900_000, route(address(input), address(output)), block.timestamp + 5 minutes)));
        require(!ok, "non-vault execution should revert");
    }

    function testRejectsBadInputAndOutput() public {
        (bool badIn,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, route(address(output), address(output)), block.timestamp + 5 minutes)));
        (bool badOut,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, route(address(input), address(input)), block.timestamp + 5 minutes)));
        require(!badIn && !badOut, "bad route endpoints should revert");
    }

    function testRejectsUnapprovedFactory() public {
        IMentoRouter.Route[] memory routes = new IMentoRouter.Route[](1);
        routes[0] = IMentoRouter.Route({ from: address(input), to: address(output), factory: address(0xBEEF) });
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, abi.encode(routes), block.timestamp + 5 minutes)));
        require(!ok, "unapproved factory should revert");
    }

    function testRejectsBrokenMultiHopRoute() public {
        AdapterToken middle = new AdapterToken(); AdapterToken wrong = new AdapterToken();
        IMentoRouter.Route[] memory routes = new IMentoRouter.Route[](2);
        routes[0] = IMentoRouter.Route({ from: address(input), to: address(middle), factory: address(router) });
        routes[1] = IMentoRouter.Route({ from: address(wrong), to: address(output), factory: address(router) });
        (bool ok,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, abi.encode(routes), block.timestamp + 5 minutes)));
        require(!ok, "broken route should revert");
    }

    function testRejectsEmptyRouteAndLongDeadline() public {
        IMentoRouter.Route[] memory routes = new IMentoRouter.Route[](0);
        (bool emptyOk,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, abi.encode(routes), block.timestamp + 5 minutes)));
        (bool deadlineOk,) = address(vault).call(abi.encodeCall(vault.execute, (10e6, 9e6, route(address(input), address(output)), block.timestamp + 31 minutes)));
        require(!emptyOk && !deadlineOk, "route/deadline validation");
    }
}
