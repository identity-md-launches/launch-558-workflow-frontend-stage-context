import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, encodeAbiParameters, keccak256, zeroAddress } from 'viem';
import { keyParams, stateAbi, quoterAbi } from '../src/protocol.ts';
const manifest=JSON.parse(await readFile(new URL('../../dist/imd-deployment.json',import.meta.url),'utf8'));
const evidence={ checkedAt:new Date().toISOString(),chainId:manifest.chainId,endpoint:manifest.network.rpcUrls[0],transactionsSent:0,contracts:[],reads:{},errors:[] };
const client=createPublicClient({transport:http(evidence.endpoint,{timeout:20000,retryCount:0})});
try {
  evidence.rpcChainId=await client.getChainId();
  if(evidence.rpcChainId!==manifest.chainId)throw Error('Wrong RPC chain');
  const block=await client.getBlock(); evidence.block=Number(block.number); evidence.blockTime=new Date(Number(block.timestamp)*1000).toISOString();
  for(const c of manifest.contracts){
    const code=await client.getCode({address:c.address,blockNumber:block.number});
    if(!code||code==='0x')throw Error('Empty code: '+c.name);
    evidence.contracts.push({name:c.name,address:c.address,runtimeBytes:(code.length-2)/2});
    const abi=JSON.parse(await readFile(new URL('../../dist/'+c.abiPath,import.meta.url),'utf8'));
    for(const name of c.name==='LaunchToken'?['symbol','decimals','totalSupply']:['token','totalStaked','aprWad','rewardRate','periodFinish','minimumFunding','rewardsDuration','LOCK_DURATION']){
      evidence.reads[c.name+'.'+name]=String(await client.readContract({address:c.address,abi,functionName:name,blockNumber:block.number}));
    }
  }
  evidence.uniswap={};
  for(const [name,address] of Object.entries(manifest.network.uniswapV4)){
    const code=await client.getCode({address,blockNumber:block.number});evidence.uniswap[name]={address,runtimeBytes:code?(code.length-2)/2:0};
  }
  if(manifest.poolKey){
    const poolId=keccak256(encodeAbiParameters(keyParams,[manifest.poolKey]));
    const slot=await client.readContract({address:manifest.network.uniswapV4.stateView,abi:stateAbi,functionName:'getSlot0',args:[poolId]});
    evidence.pool={poolId,sqrtPriceX96:String(slot[0]),tick:slot[1],lpFee:slot[3]};
    try { const quote=await client.simulateContract({address:manifest.network.uniswapV4.quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey:manifest.poolKey,zeroForOne:true,exactAmount:1000000000000n,hookData:'0x'}],account:zeroAddress});evidence.pool.readOnlyQuote={amountIn:'1000000000000',amountOut:String(quote.result[0]),gasEstimate:String(quote.result[1])}; } catch(e){evidence.pool.quoteError=e.shortMessage??e.message;}
  }
}catch(e){evidence.errors.push(e.shortMessage??e.message);process.exitCode=1;}
await writeFile(new URL('../../docs/evidence/chain-check.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
