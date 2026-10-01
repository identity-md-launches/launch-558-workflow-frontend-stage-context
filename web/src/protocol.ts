import { encodeAbiParameters, parseAbi, parseAbiParameters, zeroAddress, type Address } from 'viem';
import type { PoolKey } from './config';
// Protocol interfaces have no deployment addresses. Addresses come only from the runtime manifest.
export const quoterAbi = parseAbi(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)']);
export const routerAbi = parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
export const permitAbi = parseAbi(['function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)', 'function approve(address token,address spender,uint160 amount,uint48 expiration)']);
export const stateAbi = parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)']);
export const keyParams = parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)');
export function swapInput(poolKey: PoolKey, input: Address, amount: bigint, minimum: bigint) {
  const zeroForOne = input.toLowerCase() === poolKey.currency0.toLowerCase();
  if (!zeroForOne && input.toLowerCase() !== poolKey.currency1.toLowerCase()) throw Error('Input is outside the attested pool.');
  const output = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const params = [
    encodeAbiParameters(parseAbiParameters('((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'), [{ poolKey, zeroForOne, amountIn: amount, amountOutMinimum: minimum, hookData: '0x' }]),
    encodeAbiParameters(parseAbiParameters('address,uint256'), [input, amount]),
    encodeAbiParameters(parseAbiParameters('address,uint256'), [output, minimum]),
  ];
  return { commands: '0x10' as const, inputs: [encodeAbiParameters(parseAbiParameters('bytes,bytes[]'), ['0x060c0f', params])], value: input === zeroAddress ? amount : 0n };
}
