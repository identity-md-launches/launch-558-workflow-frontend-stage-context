import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { formatUnits, zeroAddress, type Address, type Hash } from 'viem';
import { loadConfig, type Config } from './config';
import { VaultService, switchChain, checksum, type Quote, type Snapshot, type Currency, type TxCall } from './service';
import { amountOf, dateOf, explain, formatAmount, fundingFloor, minOutput } from './logic';
import './styles.css';

type Mode = 'stake' | 'unstake' | 'swap' | 'fund';
const title:Record<Mode,string>={stake:'Stake tokens',unstake:'Withdraw stake',swap:'Swap tokens',fund:'Fund rewards'};
function App({config}:{config:Config}) {
  const service=useMemo(()=>new VaultService(config),[config]);
  const [account,setAccount]=useState<Address>();
  const [walletChain,setWalletChain]=useState<number>();
  const [walletPending,setWalletPending]=useState(false);
  const [walletError,setWalletError]=useState('');
  const [snapshot,setSnapshot]=useState<Snapshot>();
  const [readError,setReadError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const [mode,setMode]=useState<Mode>('stake');
  const [amount,setAmount]=useState('');
  const [consent,setConsent]=useState(false);
  const [buy,setBuy]=useState(true);
  const [currencies,setCurrencies]=useState<{input:Currency;outputCurrency:Currency}>();
  const [slippage,setSlippage]=useState('0.5');
  const [quote,setQuote]=useState<Quote>();
  const [pending,setPending]=useState('');
  const [feedbackLocation,setFeedbackLocation]=useState<'action'|'position'>('action');
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [txHash,setTxHash]=useState<Hash>();
  const [clock,setClock]=useState(Date.now());
  const requestSequence=useRef(0), quoteSequence=useRef(0), busy=useRef(false);
  const currentAccount=useRef(account); currentAccount.current=account;
  const refresh=useCallback(async()=>{
    const seq=++requestSequence.current;
    setRefreshing(true);
    try { const s=await service.snapshot(account); if(seq===requestSequence.current){setSnapshot(s);setReadError('');} return s; }
    catch(e) { if(seq===requestSequence.current){setReadError(explain(e));setSnapshot(undefined);} throw e; }
    finally { if(seq===requestSequence.current)setRefreshing(false); }
  },[service,account]);
  useEffect(()=>{
    setSnapshot(undefined); void refresh().catch(()=>{});
    const timer=setInterval(()=>{if(!document.hidden)void refresh().catch(()=>{});},12000);
    return ()=>{clearInterval(timer);requestSequence.current++;};
  },[refresh]);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const p=window.ethereum;
    const changed=(accounts:string[])=>{setAccount(accounts[0] as Address|undefined);setQuote(undefined);setConsent(false);setStatus('');setError('');quoteSequence.current++;};
    const chainChanged=(id:string)=>{setWalletChain(Number(BigInt(id)));setQuote(undefined);quoteSequence.current++;};
    const disconnected=()=>changed([]);
    p?.on?.('accountsChanged',changed);p?.on?.('chainChanged',chainChanged);p?.on?.('disconnect',disconnected);
    return()=>{p?.removeListener?.('accountsChanged',changed);p?.removeListener?.('chainChanged',chainChanged);p?.removeListener?.('disconnect',disconnected);};
  },[]);
  useEffect(()=>{
    let ignore=false;setCurrencies(undefined);setQuote(undefined);quoteSequence.current++;
    if(account&&mode==='swap')service.currencies(account,buy).then(c=>{if(!ignore)setCurrencies(c);}).catch(e=>{if(!ignore)setError(explain(e));});
    return()=>{ignore=true;};
  },[account,buy,mode,service]);
  const rightChain=walletChain===config.chain.id;
  const fresh=!!snapshot && clock-snapshot.receivedAt<45000;
  const ready=!!account&&rightChain&&fresh&&!readError;
  const s=snapshot;
  const symbol=s?.symbol??'VSTK';
  const decimals=mode==='swap'?currencies?.input.decimals:s?.decimals;
  const units=mode==='swap'?(currencies?.input.symbol??'…'):symbol;
  const parsed=decimals===undefined?null:amountOf(amount,decimals);
  const locked=!!s&&s.timestamp<s.lockedUntil;
  const balance=mode==='unstake'?s?.stake:mode==='swap'?currencies?.input.balance:s?.balance;
  const floor=s?fundingFloor(s):undefined;
  const quoteFresh=!!quote&&clock-quote.created<30000&&quote.amount===parsed&&quote.account===account;
  const approval=quote?service.approval(quote):null;
  let minimum:bigint|undefined;
  let slippageError='';
  try{minimum=minOutput(quote?.output??0n,slippage);}catch(e){slippageError=explain(e);}
  const amountError=amount&&!parsed?'Enter a positive amount using no more than the token’s decimals.':parsed&&balance!==undefined&&parsed>balance?'This amount exceeds your available balance.':mode==='fund'&&parsed&&floor&&parsed<floor?`Enter at least ${formatUnits(floor,s!.decimals)} ${symbol}. The minimum can rise while a period is active.`:'';
  const blocked=!!pending||!ready||!parsed||!!amountError||(mode==='unstake'&&locked)||((mode==='stake'||mode==='fund')&&!consent)||(mode==='swap'&&(!currencies||!!slippageError||!config.deployment.poolKey||(!!quote&&minimum===0n)));
  const changeMode=(next:Mode)=>{setMode(next);setTxHash(undefined);setAmount('');setConsent(false);setQuote(undefined);setError('');setStatus('');quoteSequence.current++;};
  async function connect(){
    if(walletPending)return;setWalletPending(true);setWalletError('');
    try {
      const p=window.ethereum;if(!p)throw Error('No browser wallet found. Install an Ethereum browser wallet, or open this site in your wallet’s browser, then reload.');
      const accounts=await p.request({method:'eth_requestAccounts'});
      if(!accounts[0])throw Error('No wallet account was shared. Unlock your wallet and try again.');
      setAccount(accounts[0]);setWalletChain(Number(BigInt(await p.request({method:'eth_chainId'}))));
    }catch(e){setWalletError(explain(e));}finally{setWalletPending(false);}
  }
  async function switchNetwork(){
    if(walletPending||!window.ethereum)return;setWalletPending(true);setWalletError('');
    try{await switchChain(window.ethereum,config);setWalletChain(Number(BigInt(await window.ethereum.request({method:'eth_chainId'}))));await refresh();}catch(e){setWalletError(explain(e));}finally{setWalletPending(false);}
  }
  function disconnect(){setAccount(undefined);setWalletChain(undefined);setQuote(undefined);setWalletError('');setStatus('');setTxHash(undefined);}
  async function transact(key:string,call:TxCall,after?:()=>Promise<void>){
    if(busy.current||!ready||!account||!window.ethereum)return;
    busy.current=true;setFeedbackLocation(key==='claim'||key==='exit'?'position':'action');setPending(key);setError('');setTxHash(undefined);setStatus('Checking current contract state…');
    const signingAccount=account;
    try{
      await refresh();
      if(currentAccount.current!==signingAccount)throw Error('Wallet account changed. Review your new position before continuing.');
      await service.transact(window.ethereum,signingAccount,call,(message,hash)=>{setStatus(message);if(hash)setTxHash(hash);});
      await refresh();if(after)await after();setStatus('Transaction confirmed. Balances are up to date.');
    }catch(e){setError(explain(e));setStatus('');}
    finally{setPending('');busy.current=false;}
  }
  async function getQuote(){
    if(busy.current||!account||!parsed||blocked)return;
    busy.current=true;setFeedbackLocation('action');setTxHash(undefined);setPending('quote');setError('');setStatus('Simulating a quote…');setQuote(undefined);
    const seq=++quoteSequence.current;
    try{const q=await service.quote(account,buy,parsed);if(seq===quoteSequence.current){setQuote(q);setStatus('Quote ready. Review the minimum received before continuing.');}}
    catch(e){if(seq===quoteSequence.current){setError(explain(e));setStatus('');}}
    finally{setPending('');busy.current=false;}
  }
  async function primary(){
    if(!account){await connect();return;}if(!rightChain){await switchNetwork();return;}if(blocked||!parsed)return;
    const {token,vault}=config;
    if(mode==='swap'){
      if(!quoteFresh){await getQuote();return;}
      if(approval){await transact(approval.address===config.network.uniswapV4.permit2?'permit':'approve-swap',approval,async()=>{setQuote(await service.quote(account,buy,parsed));});return;}
      if(quote&&minimum&&minimum>0n)await transact('swap',service.swap(quote,minimum),async()=>{setQuote(undefined);setCurrencies(await service.currencies(account,buy));});
      return;
    }
    if((mode==='stake'||mode==='fund')&&s!.allowance<parsed){await transact('approve-vault',{address:token.address,abi:token.abi,functionName:'approve',args:[vault.address,parsed]});return;}
    await transact(mode,{address:vault.address,abi:vault.abi,functionName:mode==='fund'?'fundRewards':mode,args:[parsed]});
  }
  const primaryLabel=!account?'Connect wallet':!rightChain?`Switch to ${config.network.name}`:pending&&feedbackLocation==='action'?({quote:'Getting quote…','approve-vault':'Approving tokens…','approve-swap':'Approving Permit2…',permit:'Authorizing router…',stake:'Staking…',unstake:'Withdrawing…',fund:'Funding rewards…',swap:'Swapping…',claim:'Claiming…',exit:'Exiting…'}[pending]??'Working…'):mode==='swap'?(!quoteFresh?'Get quote':approval?(approval.address===config.network.uniswapV4.permit2?'Authorize router · step 2':'Approve Permit2 · step 1'):'Confirm swap'):(mode==='stake'||mode==='fund')&&parsed&&s&&s.allowance<parsed?`Approve ${symbol}`:title[mode];
  const inputHint=mode==='stake'?`Available ${formatAmount(s?.balance,s?.decimals)} ${symbol}`:mode==='unstake'?`Staked ${formatAmount(s?.stake,s?.decimals)} ${symbol}`:mode==='swap'?`Available ${formatAmount(currencies?.input.balance,decimals)} ${units}`:`Available ${formatAmount(s?.balance,s?.decimals)} ${symbol}`;
  const feedback=<div className="transaction-feedback" role="region" aria-label="Transaction status"><p role="status">{status}</p>{error&&<p className="notice error" role="alert">{error}</p>}{txHash&&<a className="transaction-link" href={`${config.network.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction ↗ <span>{txHash}</span></a>}</div>;
  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header wrap">
      <a href="#" className="brand" aria-label="Vault Stake home"><span className="brand-mark" aria-hidden="true">V</span><span>Vault Stake<span className="brand-caption">Community staking</span></span></a>
      <div className="wallet-controls"><span className="network-pill"><span aria-hidden="true">◈</span> {config.network.name} <span className="testnet">Testnet</span></span>{account?<><a className="wallet-address" title={checksum(account)} href={`${config.network.explorer}/address/${account}`} target="_blank" rel="noreferrer">{checksum(account).slice(0,6)}…{account.slice(-4)} ↗</a><button className="quiet small" disabled={!!pending} onClick={disconnect}>Disconnect</button></>:<button className="quiet" onClick={connect} disabled={walletPending}>{walletPending?'Connecting…':'Connect wallet'} <span aria-hidden="true">↗</span></button>}</div>
    </header>
    <main id="main" className="wrap">
      <section className="intro"><div><p className="eyebrow">A shared stake. A steady stream.</p><h1>Put your tokens<br/><em>to work.</em></h1><p className="intro-copy">Stake {symbol}, share in community-funded rewards.<br className="desktop-break"/> One transparent vault. A seven-day commitment.</p></div><div className="vault-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core"><span>V</span></div><span className="art-label">Locked principal · Open rewards</span></div></section>
      <section className="metrics" aria-label="Vault overview"><Metric label="Current APR" value={s?`${formatAmount(s.aprWad,16,2)}%`:'—'} detail="Variable · annualized, not guaranteed"/><Metric label="Total staked" value={formatAmount(s?.totalStaked,s?.decimals)} unit={symbol} detail="Principal held in the vault"/><Metric label="Lock period" value={s?String(Number(s.lockDuration)/86400):'7'} unit="days" detail="Restarts with every added stake"/></section>
      <div className="read-status"><span>{readError?'Contract reads unavailable':!s?'Checking deployment and reading the vault…':`Live from block ${s.block.toLocaleString()} · ${Math.max(0,Math.floor((clock-s.receivedAt)/1000))}s ago`}{s&&!fresh?' · Stale; actions paused':''}</span><button className="text-button" onClick={()=>void refresh().catch(()=>{})} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh data ↻'}</button></div>
      {readError&&<p role="alert" className="notice error">{readError} Use Refresh data to retry. Transactions stay disabled until reads recover.</p>}
      {walletError&&<p role="alert" className="notice error">{walletError}</p>}
      {account&&!rightChain&&<div className="notice warning"><span>Your wallet is on a different network. Switch to {config.network.name} to continue.</span></div>}
      <div className="workspace"><section className="action-panel panel" aria-labelledby="action-heading">
        <div className="panel-heading"><span className="eyebrow">The vault</span><span className="section-number">01 / Participate</span></div>
        <div className="mode-controls" role="group" aria-label="Choose an action">{(['stake','unstake','swap','fund'] as Mode[]).map(m=><button key={m} disabled={!!pending} aria-pressed={mode===m} onClick={()=>changeMode(m)}>{m==='unstake'?'Withdraw':m==='fund'?'Fund rewards':m==='swap'?'Swap':'Stake'}</button>)}</div>
        <h2 id="action-heading">{title[mode]}</h2>
        <p className="muted action-intro">{mode==='stake'?'Receive a share of rewards, proportional to your stake.':mode==='unstake'?'Withdraw unlocked principal. Your rewards remain claimable.':mode==='fund'?'Contribute tokens to the shared reward stream. Anyone can fund it.':'Trade through the attested Uniswap v4 pool.'}</p>
        {mode==='swap'&&<div className="swap-direction" role="group" aria-label="Swap direction"><button aria-pressed={buy} disabled={!!pending} onClick={()=>{setBuy(true);setAmount('');}}>Buy {symbol}</button><button aria-pressed={!buy} disabled={!!pending} onClick={()=>{setBuy(false);setAmount('');}}>Sell {symbol}</button></div>}
        <form onSubmit={e=>{e.preventDefault();void primary();}}>
          <label className="field-label" htmlFor="amount">{mode==='swap'?'You pay':mode==='fund'?'Contribution':'Amount'} <span>{units}</span></label>
          <div className={`amount-box ${amountError?'invalid':''}`}><input id="amount" name="amount" autoComplete="off" inputMode="decimal" placeholder="0.00" value={amount} disabled={!!pending} aria-invalid={!!amountError} aria-describedby="amount-hint amount-error" onChange={e=>{setAmount(e.target.value);setQuote(undefined);setError('');quoteSequence.current++;}}/><span className="token-badge"><span aria-hidden="true">{units==='ETH'?'♦':'V'}</span>{units}</span></div>
          <div className="balance-row"><span id="amount-hint">{account?inputHint:'Connect your wallet to see your balance'}</span>{account&&balance!==undefined&&!(mode==='swap'&&currencies?.input.address===zeroAddress)&&<button type="button" className="text-button" disabled={!!pending} onClick={()=>{setAmount(formatUnits(balance,decimals??18));setQuote(undefined);}}>Use max</button>}</div>
          <p id="amount-error" className="field-error">{amountError}</p>
          {mode==='stake'&&<div className="context-box"><span className="context-icon" aria-hidden="true">◷</span><div><strong>Your full stake locks for seven days</strong><p>Adding tokens restarts the lock on your entire balance. You can claim rewards during the lock.</p>{s&&<p>Estimated new unlock: {dateOf(s.timestamp+s.lockDuration)}. The confirmed block sets the exact time.</p>}</div></div>}
          {mode==='unstake'&&<div className="context-box"><span className="context-icon" aria-hidden="true">◷</span><div><strong>{account&&s?(locked?'Your principal is still locked':'Your principal is available'):'Check your unlock time'}</strong><p>{account&&s&&s.stake>0n?`Unlock time: ${dateOf(s.lockedUntil)}`:'Connect your wallet and stake tokens to create a position.'}</p></div></div>}
          {mode==='fund'&&<div className="context-box"><span className="context-icon" aria-hidden="true">↗</span><div><strong>Funding is a contribution, not a deposit</strong><p>Tokens cannot be withdrawn by the funder. This restarts a {s?Number(s.rewardsDuration)/86400:'—'}-day reward period.</p><p>Current minimum: {s&&floor?formatUnits(floor,s.decimals):'—'} {symbol}. The active rate must be preserved; the minimum can increase before inclusion.</p></div></div>}
          {(mode==='stake'||mode==='fund')&&<label className="consent"><input type="checkbox" checked={consent} disabled={!!pending} onChange={e=>setConsent(e.target.checked)}/><span>{mode==='stake'?'I understand that my entire stake will be locked for seven days.':'I understand this contribution cannot be withdrawn.'}</span></label>}
          {mode==='swap'&&<><label className="slippage-label" htmlFor="slippage">Slippage tolerance <span><input id="slippage" inputMode="decimal" value={slippage} disabled={!!pending} onChange={e=>{setSlippage(e.target.value);setQuote(undefined);}} aria-describedby="slippage-hint" aria-invalid={!!slippageError}/> %</span></label><p id="slippage-hint" className={slippageError?'field-error':'muted small-text'}>{slippageError||'Allowed: 0.1–5%. Quotes expire after 30 seconds.'}</p><div className="quote-box">{quote&&minimum===0n&&<p className="field-error">This quote is too small for a positive minimum. Increase the input amount.</p>}<span>You receive {quote?.outputCurrency.symbol??currencies?.outputCurrency.symbol??symbol}</span><strong>{quote?formatAmount(quote.output,quote.outputCurrency.decimals,6):'—'}</strong>{quote&&<><p>Minimum received: {minimum!==undefined?formatUnits(minimum,quote.outputCurrency.decimals):'—'} {quote.outputCurrency.symbol}</p><p>1 {quote.input.symbol} ≈ {formatAmount(quote.output*10n**BigInt(quote.input.decimals)/quote.amount,quote.outputCurrency.decimals,6)} {quote.outputCurrency.symbol} · Pool fee {quote.poolFee/10000}%</p><p>{quoteFresh?'Quote is current.':'Quote expired. Get a new quote.'} Gas is paid separately in {config.network.nativeCurrency.symbol}.</p></>}</div>{quote&&approval&&<p className="muted small-text">{approval.address===config.network.uniswapV4.permit2?'Authorize the router for this exact amount, expiring in 30 minutes. Swap is a separate transaction.':'Approve this exact token amount to Permit2. Then authorize the router and confirm the swap separately.'}</p>}</>}
          <button className="primary" type="submit" disabled={!account?walletPending:!rightChain?walletPending||!!pending:blocked} aria-busy={!!pending}>{primaryLabel}<span aria-hidden="true">{pending?'◌':'↗'}</span></button>
          <p className="action-footnote">{account&&rightChain?(!fresh?'Waiting for verified, current contract reads.':`You sign each transaction in your wallet. Gas is paid in ${config.network.nativeCurrency.symbol}.`):'Your wallet stays in your control. No account required.'}</p>
        </form>
        {feedbackLocation==='action'&&feedback}
      </section>
      <aside className="position-panel panel" aria-labelledby="position-heading"><div className="panel-heading"><span className="eyebrow">Your position</span><span aria-hidden="true">↗</span></div><h2 id="position-heading">A little patience.<br/>A shared return.</h2><p className="muted">{account?'Your balances, read directly from the vault.':'Connect a wallet to follow your stake and claimable rewards.'}</p>
        <dl className="position-values"><div><dt>Staked balance</dt><dd>{account?formatAmount(s?.stake,s?.decimals):'—'} <span>{symbol}</span></dd></div><div><dt>Claimable rewards</dt><dd>{account?formatAmount(s?.earned,s?.decimals,6):'—'} <span>{symbol}</span></dd></div></dl>
        <div className="lock-state"><span aria-hidden="true">◷</span><span>{account&&s?(s.stake===0n?'No active stake':locked?`Locked until ${dateOf(s.lockedUntil)}`:'Principal unlocked'):'Your unlock time will appear here'}</span></div>
        <button className="quiet full" disabled={!ready||!!pending||!s?.earned} onClick={()=>void transact('claim',{address:config.vault.address,abi:config.vault.abi,functionName:'claim'})}>{pending==='claim'?'Claiming rewards…':'Claim rewards'} <span aria-hidden="true">↗</span></button><p className="small-text muted">Claiming sends all earned rewards to your wallet. It does not restart your lock.</p>
        <button className="text-button exit-button" disabled={!ready||!!pending||locked||!s?.stake} onClick={()=>void transact('exit',{address:config.vault.address,abi:config.vault.abi,functionName:'exit'})}>{pending==='exit'?'Withdrawing and claiming…':'Withdraw all + claim rewards ↗'}</button>
        {feedbackLocation==='position'&&feedback}
        <div className="position-bottom"><span className="mini-mark" aria-hidden="true">V</span><p>No owner. No privileged withdrawals.<br/>Principal and rewards are accounted for separately.</p></div>
      </aside></div>

      <section className="stream-section" aria-labelledby="stream-heading"><div><p className="eyebrow">Powered by participation</p><h2 id="stream-heading">Rewards come from<br/>the community.</h2><p className="muted">Anyone can fund the vault. Rewards stream each second to stakers in proportion to their stake. The rate changes with funding and total stake.</p><button className="quiet" disabled={!!pending} onClick={()=>{changeMode('fund');document.getElementById('action-heading')?.scrollIntoView({block:'center'});}}>Fund the reward stream ↗</button></div><dl className="stream-stats"><div><dt>Reward reserve</dt><dd>{formatAmount(s?.rewardReserve,s?.decimals)} {symbol}</dd></div><div><dt>Rewards per day</dt><dd>{formatAmount(s?(s.timestamp<s.periodFinish?s.rewardRate*86400n:0n):undefined,s?.decimals)} {symbol}</dd></div><div><dt>Current period ends</dt><dd>{s?dateOf(s.periodFinish):'—'}</dd></div><div><dt>Rewards paid · lifetime</dt><dd>{formatAmount(s?.totalRewardsPaid,s?.decimals)} {symbol}</dd></div></dl></section>
      <section className="details-section"><details><summary>Deployment & transparency <span>Contract addresses, network and verification ↗</span></summary><div className="deployment-details"><p>ABI hashes are checked at load. The RPC chain and deployed contract code are checked before actions are enabled. These checks do not constitute a security audit.</p>{config.contracts.map(c=><AddressRow key={c.name} name={c.name} address={c.address} config={config}/>)}{account&&<AddressRow name="Connected wallet" address={account} config={config}/>}<p>Source commit <code>{config.deployment.sourceCommit}</code></p><p>Attestation <code>{config.deployment.attestationHash}</code></p><p>Public RPCs: {config.network.rpcUrls.join(' · ')}</p><p>Pool fee parameter: {config.deployment.poolKey?.fee??'Unavailable'} · Tick spacing: {config.deployment.poolKey?.tickSpacing??'Unavailable'}</p><a href="./imd-deployment.json" target="_blank" rel="noreferrer">View deployment manifest ↗</a><p>Need test ETH? {config.network.faucets.map((url,i)=><a className="faucet" key={url} href={url} target="_blank" rel="noreferrer">Sepolia faucet {i+1} ↗</a>)}</p></div></details><p className="disclaimer">{config.network.name} testnet · Tokens have no represented monetary value. USD prices are unavailable. APR annualizes the current rate; it is not a promised return.</p></section>
    </main><footer className="wrap"><span>Vault Stake</span><span>Open contracts. Shared rewards.</span><a href="#main">Back to vault ↑</a></footer>
  </>;
}
function Metric({label,value,unit,detail}:{label:string;value:string;unit?:string;detail:string}){return <div className="metric"><p>{label}</p><strong>{value} {unit&&<span>{unit}</span>}</strong><span className="metric-detail">{detail}</span></div>;}
function AddressRow({name,address,config}:{name:string;address:Address;config:Config}){const [copied,setCopied]=useState('');return <div className="address-row"><strong>{name}</strong><a href={`${config.network.explorer}/address/${address}`} target="_blank" rel="noreferrer"><bdi>{checksum(address)}</bdi> ↗</a><button className="quiet small" onClick={()=>void navigator.clipboard.writeText(checksum(address)).then(()=>setCopied('Copied')).catch(()=>setCopied('Copy unavailable; select the address'))}>Copy {name}</button><span role="status">{copied}</span></div>;}
function Boot(){const [config,setConfig]=useState<Config>();const [error,setError]=useState('');useEffect(()=>{loadConfig().then(setConfig).catch(e=>setError(explain(e)));},[]);return config?<App config={config}/>:<main className="boot panel"><span className="brand-mark">V</span><h1>Vault Stake</h1>{error?<><p role="alert">{error}</p><button className="quiet" onClick={()=>location.reload()}>Reload deployment</button></>:<p role="status">Loading and verifying deployment…</p>}</main>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boot/></React.StrictMode>);
