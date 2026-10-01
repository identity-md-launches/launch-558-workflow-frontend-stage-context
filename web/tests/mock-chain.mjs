import { readFile } from 'node:fs/promises';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, parseAbi, toHex, zeroAddress } from 'viem';
const m=JSON.parse(await readFile(new URL('../../dist/imd-deployment.json',import.meta.url),'utf8'));
const token=m.contracts.find(c=>c.name==='LaunchToken');const vault=m.contracts.find(c=>c.name==='StakingVault');
const abiToken=JSON.parse(await readFile(new URL('../../dist/'+token.abiPath,import.meta.url),'utf8'));
const abiVault=JSON.parse(await readFile(new URL('../../dist/'+vault.abiPath,import.meta.url),'utf8'));
const abiQuoter=parseAbi(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)']);
const abiRouter=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
const abiPermit=parseAbi(['function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)','function approve(address token,address spender,uint160 amount,uint48 expiration)']);
const abiState=parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)']);
export const unit=10n**18n;
export const account='0x1234567890123456789012345678901234567890';
const hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32),bloom='0x'+'00'.repeat(256);
export function mockChain(){
 const now=BigInt(Math.floor(Date.now()/1000));
 const state={block:12000000n,chain:'0xaa36a7',connected:false,unknownChain:false,added:false,rejectConnect:false,rejectSend:false,revert:false,rpcFail:false,holdReceipt:false,receiptStatus:'0x1',zeroCode:false,quoteFail:false,tinyQuote:false,amount:10000n*unit,stake:100n*unit,earned:3n*unit,allowance:0n,permitToken:0n,permitAmount:0n,expiration:0n,lockedUntil:now-1n,totalStaked:100000n*unit,totalFunded:3000n*unit,totalPaid:200n*unit,transactions:[],calls:[],simulations:[],pending:null,hashIndex:0};
 function abiFor(address){const a=address.toLowerCase();if(a===token.address)return abiToken;if(a===vault.address)return abiVault;const n=m.network.uniswapV4;if(a===n.quoter)return abiQuoter;if(a===n.universalRouter)return abiRouter;if(a===n.permit2)return abiPermit;if(a===n.stateView)return abiState;throw Error('Unexpected contract '+a);}
 function block(){return {number:toHex(12000000n),hash:blockHash,parentHash:blockHash,nonce:'0x0000000000000000',sha3Uncles:hash,logsBloom:bloom,transactionsRoot:hash,stateRoot:hash,receiptsRoot:hash,miner:zeroAddress,difficulty:'0x0',totalDifficulty:'0x0',extraData:'0x',size:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',timestamp:toHex(now),transactions:[],uncles:[],baseFeePerGas:'0x3b9aca00',mixHash:hash};}
 function apply(tx){const {functionName:f,args:a}=decodeFunctionData({abi:abiFor(tx.to),data:tx.data});
  if(f==='approve') {if(tx.to.toLowerCase()===m.network.uniswapV4.permit2){state.permitAmount=a[2];state.expiration=a[3];}else if(a[0].toLowerCase()===vault.address)state.allowance=a[1];else state.permitToken=a[1];}
  if(f==='stake'){state.amount-=a[0];state.stake+=a[0];state.totalStaked+=a[0];state.allowance-=a[0];state.lockedUntil=now+604800n;}
  if(f==='unstake'||f==='exit'){const amount=f==='exit'?state.stake:a[0];state.amount+=amount;state.stake-=amount;state.totalStaked-=amount;}
  if(f==='claim'||f==='exit'){state.amount+=state.earned;state.totalPaid+=state.earned;state.earned=0n;}
  if(f==='fundRewards'){state.amount-=a[0];state.totalFunded+=a[0];state.allowance-=a[0];}
 }
 async function rpc(req){
  if(state.rpcFail)throw {code:-32000,message:'RPC is unavailable. Try again.'};
  const {method,params=[]}=req;
  switch(method){
   case 'eth_chainId':return '0xaa36a7';
   case 'eth_blockNumber':return toHex(++state.block);
   case 'eth_getBlockByNumber':return block();
   case 'eth_getCode':return state.zeroCode?'0x':'0x60006000';
   case 'eth_getBalance':return toHex(10n*unit);
   case 'eth_gasPrice':case 'eth_maxPriorityFeePerGas':return '0x3b9aca00';
   case 'eth_estimateGas':return '0x30d40';
   case 'eth_call':{
    const tx=params[0],abi=abiFor(tx.to),{functionName:f,args:a=[]}=decodeFunctionData({abi,data:tx.data});
    const write=abi.find(x=>x.name===f)?.stateMutability!=='view';
    if(write)state.simulations.push({to:tx.to,functionName:f,args:a,value:tx.value});
    if((write&&state.revert)||(f==='quoteExactInputSingle'&&state.quoteFail))throw {code:3,message:'execution reverted',data:encodeErrorResult({abi:abiVault,errorName:f==='fundRewards'?'RewardRateDecrease':'NothingToClaim',args:f==='fundRewards'?[1n,2n]:undefined})};
    let value;
    if(tx.to.toLowerCase()===token.address){value={symbol:'VSTK',decimals:18,balanceOf:state.amount,totalSupply:1000000000n*unit,approve:true,allowance:(typeof a[1]==='string'&&a[1].toLowerCase()===vault.address)?state.allowance:state.permitToken}[f];}
    else if(tx.to.toLowerCase()===vault.address){value={token:token.address,totalStaked:state.totalStaked,aprWad:315360000000000000n,rewardRate:1000000000000000n,rewardsDuration:2592000n,minimumFunding:1000n*unit,periodFinish:now+2591900n,lastUpdateTime:now-100n,unallocatedRewards:0n,rewardReserve:state.totalFunded-state.totalPaid,totalRewardsFunded:state.totalFunded,totalRewardsPaid:state.totalPaid,LOCK_DURATION:604800n,balanceOf:state.stake,earned:state.earned,lockedUntil:state.lockedUntil}[f];}
    else if(f==='quoteExactInputSingle'){if(JSON.stringify(a[0].poolKey).toLowerCase()!==JSON.stringify(m.poolKey).toLowerCase()){
      for(const k of Object.keys(m.poolKey))if(String(a[0].poolKey[k]).toLowerCase()!==String(m.poolKey[k]).toLowerCase())throw Error('Wrong pool '+k);
     }value=[state.tinyQuote?1n:a[0].exactAmount*2n,100000n];}
    else if(f==='getSlot0')value=[2n**96n,0,0,12500];
    else if(f==='allowance')value=[state.permitAmount,Number(state.expiration),0];
    return encodeFunctionResult({abi,functionName:f,result:value});
   }
   case 'eth_getTransactionReceipt':{
    if(state.holdReceipt||!state.pending)return null;
    const tx=state.pending;
    if(!tx.applied){if(state.receiptStatus==='0x1')apply(tx);tx.applied=true;}
    return {transactionHash:tx.hash,transactionIndex:'0x0',blockHash,blockNumber:toHex(12000000n),from:account,to:tx.to,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',contractAddress:null,logs:[],logsBloom:bloom,status:state.receiptStatus,effectiveGasPrice:'0x3b9aca00',type:'0x2'};
   }
   case 'eth_getTransactionByHash':return {...state.pending,blockHash,blockNumber:toHex(12000000n),from:account,gas:'0x5208',gasPrice:'0x3b9aca00',input:state.pending?.data,nonce:'0x0',transactionIndex:'0x0',value:state.pending?.value??'0x0',type:'0x2',chainId:'0xaa36a7',v:'0x1',r:hash,s:hash};
   default:throw Error('Unhandled RPC '+method);
  }
 }
 async function wallet(req){state.calls.push(req);switch(req.method){
  case 'eth_requestAccounts':if(state.rejectConnect)throw {code:4001,message:'User rejected connection'};state.connected=true;return [account];
  case 'eth_accounts':return state.connected?[account]:[];
  case 'eth_chainId':return state.chain;
  case 'wallet_switchEthereumChain':if(state.unknownChain&&!state.added)throw {code:4902,message:'Unknown chain'};state.chain=req.params[0].chainId;return null;
  case 'wallet_addEthereumChain':state.added=true;return null;
  case 'eth_sendTransaction':if(state.rejectSend)throw {code:4001,message:'User rejected request'};const tx={...req.params[0],hash:'0x'+(++state.hashIndex).toString(16).padStart(64,'0')};state.pending=tx;state.transactions.push(tx);return tx.hash;
  default:throw Error('Unhandled wallet '+req.method);
 }}
 return {state,manifest:m,rpc,wallet,account,token,vault};
}
export async function installMocks(page,mock){
 const fulfill=async(route,handler)=>{const payload=route.request().postDataJSON();const run=async req=>{try{return {jsonrpc:'2.0',id:req.id,result:await handler(req)};}catch(e){return {jsonrpc:'2.0',id:req.id,error:{code:e.code??-32603,message:e.message,data:e.data}};}};await route.fulfill({contentType:'application/json',body:JSON.stringify(Array.isArray(payload)?await Promise.all(payload.map(run)):await run(payload))});};
 await page.route('https://**',route=>fulfill(route,mock.rpc));
 await page.route('**/__wallet',route=>fulfill(route,mock.wallet));
 await page.addInitScript(()=>{
  const listeners={};window.ethereum={
   request:async req=>{const result=await fetch('/__wallet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)}).then(r=>r.json());if(result.error){const e=new Error(result.error.message);e.code=result.error.code;throw e;}return result.result;},
   on:(name,fn)=>(listeners[name]??=[]).push(fn),removeListener:(name,fn)=>{listeners[name]=(listeners[name]??[]).filter(f=>f!==fn);},
   emit:(name,payload)=>(listeners[name]??[]).forEach(fn=>fn(payload))
  };
 });
}
