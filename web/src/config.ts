import { createPublicClient, defineChain, fallback, http, keccak256, toBytes, type Abi, type Address, type EIP1193Provider } from 'viem';
export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export type Deployment = {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[]; poolKey?: PoolKey;
  network?: { chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[];
    uniswapV4: Record<'poolManager'|'universalRouter'|'quoter'|'stateView'|'positionManager'|'permit2', Address> };
  walletAddChain?: { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: {name:string;symbol:string;decimals:number}; blockExplorerUrls: string[] };
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw Error(`Unable to load ${path}. Reload or check the static export.`);
  return response.json();
}
export async function loadConfig() {
  const deployment = await json('./imd-deployment.json') as Deployment;
  if (deployment.version !== 1 || !deployment.chainId || deployment.network?.chainId !== deployment.chainId) throw Error('Deployment configuration is invalid or the network is not vetted. Actions are disabled.');
  const contracts = await Promise.all(deployment.contracts.map(async c => {
    if (!/^abi\/[A-Za-z][A-Za-z0-9]*\.json$/.test(c.abiPath)) throw Error('Invalid ABI path.');
    const abi = await json('./' + c.abiPath) as Abi;
    if (!Array.isArray(abi) || keccak256(toBytes(canonical(abi))).slice(2) !== c.abiHash) throw Error(`${c.name} ABI verification failed. Actions are disabled.`);
    return { ...c, abi };
  }));
  const token = contracts.find(c => c.name === 'LaunchToken');
  const vault = contracts.find(c => c.name === 'StakingVault');
  if (!token || !vault) throw Error('Required contracts are missing.');
  const network = deployment.network!;
  const chain = defineChain({ id: deployment.chainId, name: network.name, nativeCurrency: network.nativeCurrency, rpcUrls: { default: { http: network.rpcUrls } }, testnet: network.testnet });
  const client = createPublicClient({ chain, transport: fallback(network.rpcUrls.map(url => http(url, { timeout: 10000, retryCount: 0, batch: { wait: 20 } })), { retryCount: 0 }) });
  return { deployment, network, contracts, token, vault, chain, client };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
export type Provider = EIP1193Provider & { on?: (event: string, listener: (...args: any[]) => void) => void; removeListener?: (event: string, listener: (...args: any[]) => void) => void };
declare global { interface Window { ethereum?: Provider } }
