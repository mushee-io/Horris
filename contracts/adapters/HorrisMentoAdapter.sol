// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Adapter {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IMentoRouter {
    struct Route { address from; address to; address factory; }
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address recipient, uint256 deadline)
        external returns (uint256 amountOut);
}

/// @title HorrisMentoAdapter
/// @notice Narrow adapter that permits a Horris vault to execute one configured Mento v3 token pair.
contract HorrisMentoAdapter {
    address public immutable vault;
    address public immutable router;
    address public immutable tokenIn;
    address public immutable tokenOut;
    uint256 private locked = 1;

    event SwapExecuted(uint256 amountIn, uint256 amountOut, address indexed recipient);

    modifier onlyVault() { require(msg.sender == vault, "NOT_VAULT"); _; }
    modifier nonReentrant() { require(locked == 1, "REENTRANT"); locked = 2; _; locked = 1; }

    constructor(address vault_, address router_, address tokenIn_, address tokenOut_) {
        require(vault_ != address(0) && router_ != address(0) && tokenIn_ != address(0) && tokenOut_ != address(0), "ZERO_ADDRESS");
        require(tokenIn_ != tokenOut_, "SAME_TOKEN");
        vault = vault_;
        router = router_;
        tokenIn = tokenIn_;
        tokenOut = tokenOut_;
    }

    function executeSwap(uint256 amountIn, uint256 amountOutMin, bytes calldata routeData, uint256 deadline)
        external onlyVault nonReentrant returns (uint256 amountOut)
    {
        require(amountIn > 0, "ZERO_AMOUNT");
        require(amountOutMin > 0, "ZERO_MIN_OUT");
        require(deadline >= block.timestamp, "EXPIRED");
        require(deadline <= block.timestamp + 30 minutes, "DEADLINE_TOO_LONG");

        IMentoRouter.Route[] memory routes = abi.decode(routeData, (IMentoRouter.Route[]));
        require(routes.length > 0 && routes.length <= 3, "BAD_ROUTE_LENGTH");
        require(routes[0].from == tokenIn, "BAD_INPUT");
        require(routes[routes.length - 1].to == tokenOut, "BAD_OUTPUT");
        for (uint256 i = 0; i < routes.length; i++) {
            require(routes[i].factory != address(0), "ZERO_FACTORY");
            require(routes[i].from != address(0) && routes[i].to != address(0), "ZERO_ROUTE_ASSET");
            require(routes[i].from != routes[i].to, "SAME_ROUTE_ASSET");
            if (i + 1 < routes.length) require(routes[i].to == routes[i + 1].from, "BROKEN_ROUTE");
        }

        require(IERC20Adapter(tokenIn).transferFrom(vault, address(this), amountIn), "PULL_FAILED");
        require(IERC20Adapter(tokenIn).approve(router, 0), "RESET_APPROVAL_FAILED");
        require(IERC20Adapter(tokenIn).approve(router, amountIn), "APPROVAL_FAILED");

        uint256 beforeOut = IERC20Adapter(tokenOut).balanceOf(address(this));
        IMentoRouter(router).swapExactTokensForTokens(amountIn, amountOutMin, routes, address(this), deadline);
        require(IERC20Adapter(tokenIn).approve(router, 0), "CLEAR_APPROVAL_FAILED");

        amountOut = IERC20Adapter(tokenOut).balanceOf(address(this)) - beforeOut;
        require(amountOut >= amountOutMin, "MIN_OUT");
        require(IERC20Adapter(tokenOut).transfer(vault, amountOut), "RETURN_FAILED");
        emit SwapExecuted(amountIn, amountOut, vault);
    }
}
