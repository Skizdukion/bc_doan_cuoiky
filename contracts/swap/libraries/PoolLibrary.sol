pragma solidity >=0.5.0;
import "./SafeMath.sol";
import "../interfaces/IPoolPair.sol";
import "../interfaces/IPoolFactory.sol";
import "hardhat/console.sol";

library PoolLibrary {
    using SafeMath for uint256;

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        require(tokenA != tokenB, "WineryLibrary: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "WineryLibrary: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (address pair) {
        pair = IPoolFactory(factory).getPair(tokenA, tokenB);
        // console.log(pair);
    }

    function getSwapFee(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 swapFee) {
        swapFee = IPoolPair(pairFor(factory, tokenA, tokenB)).swapFee();
    }

    // fetches and sorts the reserves for a pair
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        // console.log("This get reserve is pair(%s,%s) in factory %s", tokenA, tokenB, factory);
        (uint256 reserve0, uint256 reserve1, ) = IPoolPair(pairFor(factory, tokenA, tokenB))
            .getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amountB) {
        require(amountA > 0, "WineryLibrary: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "WineryLibrary: INSUFFICIENT_LIQUIDITY");
        amountB = amountA.mul(reserveB) / reserveA;
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 swapFee
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "WineryLibrary: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "WineryLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn.mul(uint256(10000).sub(swapFee));
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(10000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 swapFee
    ) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, "WineryLibrary: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "WineryLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn.mul(amountOut).mul(10000);
        uint256 denominator = reserveOut.sub(amountOut).mul(uint256(10000).sub(swapFee));
        amountIn = (numerator / denominator).add(1);
    }

    // performs chained getAmountOut calculations on any number of pairs
    function getAmountsOut(
        address factory,
        uint256 amountIn,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "WineryLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            // console.log(
            //     "This path is: from %s to %s with amount %s",
            //     path[i],
            //     path[i + 1],
            //     amounts[i]
            // );
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i], path[i + 1]);
            uint256 amountsOut;
            amountsOut = getAmountOut(
                amounts[i],
                reserveIn,
                reserveOut,
                getSwapFee(factory, path[i], path[i + 1])
            );
            amounts[i + 1] = amountsOut;
            // console.log("Amounts out is: ", TamountsOut);
        }
    }

    // performs chained getAmountIn calculations on any number of pairs
    function getAmountsIn(
        address factory,
        uint256 amountOut,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "WineryLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(
                amounts[i],
                reserveIn,
                reserveOut,
                getSwapFee(factory, path[i - 1], path[i])
            );
        }
    }
}
