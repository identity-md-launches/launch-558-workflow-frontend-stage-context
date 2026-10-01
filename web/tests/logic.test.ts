import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountOf, minOutput, fundingFloor, explain } from '../src/logic';
import { swapInput } from '../src/protocol';
import { switchChain, VaultService } from '../src/service';
import { decodeAbiParameters, parseAbiParameters, zeroAddress, type Address } from 'viem';
import type { Config, PoolKey, Provider } from '../src/config';
const token='0x0000000000000000000000000000000000000002' as Address;
const pair='0x0000000000000000000000000000000000000003' as Address;
const key:PoolKey={currency0:zeroAddress,currency1:token,fee:12500,tickSpacing:60,hooks:pair};
test('amount validation rejects signs, exponents, overprecision and uint128 overflow',()=>{
 for(const value of ['','0','-1','1e3','1.0000001','NaN',String(2n**128n)])assert.equal(amountOf(value,6),null);
 assert.equal(amountOf('1.000001',6),1000001n);
});
test('slippage uses integer minimums and bounded precision',()=>{assert.equal(minOutput(10001n,'0.5'),9950n);for(const v of ['0','5.01','-1','1e0','.5','0.001'])assert.throws(()=>minOutput(1n,v));});
test('funding accounts for active leftover and rate-preservation',()=>{
 const s={minimumFunding:10n,timestamp:60n,periodFinish:100n,lastUpdateTime:50n,unallocatedRewards:0n,totalStaked:1n,rewardRate:2n,rewardsDuration:100n};
 assert.equal(fundingFloor(s),120n);assert.equal(fundingFloor({...s,totalStaked:0n}),100n);assert.equal(fundingFloor({...s,timestamp:110n}),100n);
});
test('native swap encodes exact attested key, three actions, settlement and minimum',()=>{
 const result=swapInput(key,zeroAddress,100n,90n);
 assert.equal(result.commands,'0x10');assert.equal(result.value,100n);
 const [actions,params]=decodeAbiParameters(parseAbiParameters('bytes,bytes[]'),result.inputs[0]);assert.equal(actions,'0x060c0f');assert.equal(params.length,3);
 const [swap]=decodeAbiParameters(parseAbiParameters('((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'),params[0]);
 assert.deepEqual(swap.poolKey,key);assert.equal(swap.zeroForOne,true);assert.equal(swap.amountIn,100n);assert.equal(swap.amountOutMinimum,90n);
 assert.deepEqual(decodeAbiParameters(parseAbiParameters('address,uint256'),params[1]),[zeroAddress,100n]);assert.deepEqual(decodeAbiParameters(parseAbiParameters('address,uint256'),params[2]),[token,90n]);
});
test('token sells and ERC20 paired buys send zero ETH and sort direction from pool key',()=>{
 assert.equal(swapInput(key,token,100n,90n).value,0n);
 const encoded=swapInput({...key,currency0:token,currency1:pair},pair,100n,90n);
 assert.equal(encoded.value,0n);
 const [,params]=decodeAbiParameters(parseAbiParameters('bytes,bytes[]'),encoded.inputs[0]);
 const [swap]=decodeAbiParameters(parseAbiParameters('((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'),params[0]);assert.equal(swap.zeroForOne,false);
 assert.throws(()=>swapInput(key,pair,1n,1n));
});
test('unknown chain adds exact handoff parameters then switches again',async()=>{
 const calls:any[]=[];const add={chainId:'0xaa36a7',chainName:'Sepolia',rpcUrls:['https://example.invalid'],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}};
 const provider={request:async(call:any)=>{calls.push(call);if(calls.length===1)throw {code:4902};}} as unknown as Provider;
 await switchChain(provider,{chain:{id:11155111},deployment:{walletAddChain:add}} as Config);
 assert.deepEqual(calls.map(c=>c.method),['wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain']);assert.deepEqual(calls[1].params,[add]);
});
test('rejected switching does not attempt to add chain',async()=>{let calls=0;await assert.rejects(()=>switchChain({request:async()=>{calls++;throw {code:4001};}} as unknown as Provider,{chain:{id:1}} as Config));assert.equal(calls,1);});
test('wallet rejection is actionable',()=>{assert.match(explain({code:4001}),/try again/);});
test('Permit2 approvals are exact, separate, and only requested when short',()=>{
 const service=new VaultService({network:{uniswapV4:{permit2:pair,universalRouter:token}}} as Config);
 const quote:any={input:{address:token},amount:100n,tokenAllowance:0n,routerAllowance:0n,expiration:0n};
 assert.deepEqual(service.approval(quote)?.args,[pair,100n]);
 quote.tokenAllowance=100n;assert.equal(service.approval(quote)?.address,pair);
 quote.routerAllowance=100n;quote.expiration=BigInt(Math.floor(Date.now()/1000)+1000);assert.equal(service.approval(quote),null);
 quote.input.address=zeroAddress;quote.tokenAllowance=0n;assert.equal(service.approval(quote),null);
});
test('simulation failure prevents wallet signing',async()=>{
 let sends=0;const provider={request:async({method}:any)=>method==='eth_chainId'?'0x1':method==='eth_accounts'?[token]:(sends++,null)} as Provider;
 const service=new VaultService({chain:{id:1},client:{simulateContract:async()=>{throw Error('simulation reverted');}}} as unknown as Config);
 await assert.rejects(()=>service.transact(provider,token,{address:pair,abi:[],functionName:'stake'},()=>{}),/simulation reverted/);assert.equal(sends,0);
});
