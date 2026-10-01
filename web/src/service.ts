import { createWalletClient, custom, erc20Abi, getAddress, encodeAbiParameters, keccak256, zeroAddress, type Abi, type Address, type Hash } from 'viem';
import type { Config, Provider } from './config';
import { keyParams, permitAbi, quoterAbi, routerAbi, stateAbi, swapInput } from './protocol';
export type Snapshot = {
  block: bigint; timestamp: bigint; receivedAt: number; symbol: string; decimals: number;
  totalStaked: bigint; aprWad: bigint; rewardRate: bigint; rewardsDuration: bigint; minimumFunding: bigint;
  periodFinish: bigint; lastUpdateTime: bigint; unallocatedRewards: bigint; rewardReserve: bigint; totalRewardsFunded: bigint; totalRewardsPaid: bigint; lockDuration: bigint;
  balance: bigint; stake: bigint; earned: bigint; lockedUntil: bigint; allowance: bigint; nativeBalance: bigint;
};
export type Currency = { address: Address; symbol: string; decimals: number; balance: bigint };
export type Quote = { amount: bigint; output: bigint; created: number; account: Address; input: Currency; outputCurrency: Currency; tokenAllowance: bigint; routerAllowance: bigint; expiration: bigint; poolFee: number };
export type TxCall = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
export class VaultService {
  constructor(public config: Config) {}
  async snapshot(account?: Address): Promise<Snapshot> {
    const { client, token, vault, deployment } = this.config;
    const chainId = await client.getChainId();
    if (chainId !== deployment.chainId) throw Error('RPC returned the wrong chain. Transactions are disabled.');
    const block = await client.getBlock();
    const code = await Promise.all(this.config.contracts.map(c => client.getCode({ address: c.address, blockNumber: block.number })));
    if (code.some(c => !c || c === '0x')) throw Error('A deployed contract has no code on this RPC. Transactions are disabled.');
    const read = (contract: typeof vault, functionName: string, args: readonly unknown[] = []): Promise<unknown> => client.readContract({ address: contract.address, abi: contract.abi, functionName, args, blockNumber: block.number });
    const names = ['totalStaked','aprWad','rewardRate','rewardsDuration','minimumFunding','periodFinish','lastUpdateTime','unallocatedRewards','rewardReserve','totalRewardsFunded','totalRewardsPaid','LOCK_DURATION'] as const;
    const [values, symbol, decimals, vaultToken, personal] = await Promise.all([
      Promise.all(names.map(n => read(vault,n))), read(token,'symbol'), read(token,'decimals'), read(vault,'token'),
      account ? Promise.all([read(token,'balanceOf',[account]),read(vault,'balanceOf',[account]),read(vault,'earned',[account]),read(vault,'lockedUntil',[account]),read(token,'allowance',[account,vault.address]),client.getBalance({address:account,blockNumber:block.number})]) : Promise.resolve([0n,0n,0n,0n,0n,0n]),
    ]);
    if (String(vaultToken).toLowerCase() !== token.address.toLowerCase()) throw Error('Vault token does not match the deployment. Transactions are disabled.');
    const [totalStaked,aprWad,rewardRate,rewardsDuration,minimumFunding,periodFinish,lastUpdateTime,unallocatedRewards,rewardReserve,totalRewardsFunded,totalRewardsPaid,lockDuration] = values as bigint[];
    const [balance,stake,earned,lockedUntil,allowance,nativeBalance] = personal as bigint[];
    return { block:block.number,timestamp:block.timestamp,receivedAt:Date.now(),symbol:String(symbol),decimals:Number(decimals),totalStaked,aprWad,rewardRate,rewardsDuration,minimumFunding,periodFinish,lastUpdateTime,unallocatedRewards,rewardReserve,totalRewardsFunded,totalRewardsPaid,lockDuration,balance,stake,earned,lockedUntil,allowance,nativeBalance };
  }
  async currency(address: Address, account: Address): Promise<Currency> {
    const {client,network} = this.config;
    if(address === zeroAddress) return {address, symbol:network.nativeCurrency.symbol,decimals:network.nativeCurrency.decimals,balance:await client.getBalance({address:account})};
    const [symbol,decimals,balance] = await Promise.all([
      client.readContract({address,abi:erc20Abi,functionName:'symbol'}),client.readContract({address,abi:erc20Abi,functionName:'decimals'}),client.readContract({address,abi:erc20Abi,functionName:'balanceOf',args:[account]})]);
    return {address,symbol,decimals,balance};
  }
  async currencies(account: Address, buy: boolean) {
    const {deployment,token} = this.config;
    const key = deployment.poolKey;
    if (!key || ![key.currency0.toLowerCase(),key.currency1.toLowerCase()].includes(token.address.toLowerCase())) throw Error('The attested pool is unavailable. Swaps are disabled.');
    const pair = key.currency0.toLowerCase() === token.address.toLowerCase() ? key.currency1 : key.currency0;
    const [input,outputCurrency] = await Promise.all([this.currency(buy?pair:token.address,account),this.currency(buy?token.address:pair,account)]);
    return {input,outputCurrency};
  }
  async quote(account: Address, buy: boolean, amount: bigint): Promise<Quote> {
    const {client,network,deployment} = this.config;
    const poolKey = deployment.poolKey!;
    const {input,outputCurrency} = await this.currencies(account,buy);
    const codes = await Promise.all([network.uniswapV4.quoter,network.uniswapV4.universalRouter,network.uniswapV4.permit2,network.uniswapV4.stateView].map(address => client.getCode({address})));
    if(codes.some(c=>!c||c==='0x')) throw Error('Swap infrastructure could not be verified. Try another configured RPC.');
    const poolId = keccak256(encodeAbiParameters(keyParams,[poolKey]));
    const [sqrtPriceX96,,,poolFee] = await client.readContract({address:network.uniswapV4.stateView,abi:stateAbi,functionName:'getSlot0',args:[poolId]});
    if(sqrtPriceX96===0n) throw Error('This pool has not been initialized. Swapping is unavailable.');
    const {result} = await client.simulateContract({address:network.uniswapV4.quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey,zeroForOne:input.address.toLowerCase()===poolKey.currency0.toLowerCase(),exactAmount:amount,hookData:'0x'}],account});
    if(result[0] <= 0n || result[0] >= 2n**128n) throw Error('The pool returned no usable quote. Try a smaller amount or check liquidity.');
    let tokenAllowance=0n,routerAllowance=0n,expiration=0n;
    if(input.address!==zeroAddress) {
      tokenAllowance=await client.readContract({address:input.address,abi:erc20Abi,functionName:'allowance',args:[account,network.uniswapV4.permit2]});
      [routerAllowance,expiration]= (await client.readContract({address:network.uniswapV4.permit2,abi:permitAbi,functionName:'allowance',args:[account,input.address,network.uniswapV4.universalRouter]})).map(BigInt);
    }
    return {amount,output:result[0],created:Date.now(),account,input,outputCurrency,tokenAllowance,routerAllowance,expiration,poolFee};
  }
  approval(q:Quote): TxCall | null {
    const {network} = this.config;
    if(q.input.address===zeroAddress) return null;
    if(q.tokenAllowance<q.amount) return {address:q.input.address,abi:erc20Abi,functionName:'approve',args:[network.uniswapV4.permit2,q.amount]};
    if(q.routerAllowance<q.amount || q.expiration<BigInt(Math.floor(Date.now()/1000)+300)) return {address:network.uniswapV4.permit2,abi:permitAbi,functionName:'approve',args:[q.input.address,network.uniswapV4.universalRouter,q.amount,BigInt(Math.floor(Date.now()/1000)+1800)]};
    return null;
  }
  swap(q:Quote,minimum:bigint): TxCall {
    const encoded=swapInput(this.config.deployment.poolKey!,q.input.address,q.amount,minimum);
    return {address:this.config.network.uniswapV4.universalRouter,abi:routerAbi,functionName:'execute',args:[encoded.commands,encoded.inputs,BigInt(Math.floor(Date.now()/1000)+300)],value:encoded.value};
  }
  async transact(provider:Provider,account:Address,call:TxCall,onStatus:(s:string,hash?:Hash)=>void) {
    const {client,chain} = this.config;
    const check=async()=>{
      const [chainHex,accounts] = await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);
      if(Number(BigInt(chainHex))!==chain.id || accounts[0]?.toLowerCase()!==account.toLowerCase()) throw Error('Wallet account or network changed. Refresh and review the action again.');
    };
    await check();
    onStatus('Simulating transaction…');
    const {request}=await client.simulateContract({...call,account});
    await check();
    onStatus('Confirm this action in your wallet.');
    const wallet=createWalletClient({chain,transport:custom(provider)});
    const hash=await wallet.writeContract(request);
    onStatus('Transaction submitted. Waiting for confirmation…',hash);
    let cancelled=false;
    const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:0,onReplaced:({transaction,reason})=>{cancelled=reason==='cancelled';onStatus('Replacement transaction pending…',transaction.hash);}});
    if(cancelled)throw Error('Transaction cancelled in your wallet. No action was completed.');
    if(receipt.status!=='success') throw Error('Transaction reverted on chain. Open the explorer, refresh, and review before retrying.');
    onStatus('Confirmed on chain. Refreshing balances…',receipt.transactionHash);
    return receipt;
  }
}
export async function switchChain(provider:Provider,config:Config) {
  const params: [{chainId: string}]=[{chainId:`0x${config.chain.id.toString(16)}`}];
  try { await provider.request({method:'wallet_switchEthereumChain',params}); }
  catch(error) {
    const e=error as {code?:number;message?:string;data?:{originalError?:{code?:number}}};
    if(e.code!==4902 && e.data?.originalError?.code!==4902 && !/unknown chain|unrecognized chain|not added/i.test(e.message??'')) throw error;
    if(!config.deployment.walletAddChain) throw Error('This network cannot be added automatically. Add the network from the deployment details.');
    await provider.request({method:'wallet_addEthereumChain',params:[config.deployment.walletAddChain]});
    await provider.request({method:'wallet_switchEthereumChain',params});
  }
}
export const checksum = (address:Address) => getAddress(address);
