import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { abiHash, inventory } from './manifest-lib.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root + 'web');
let handoff, network;
try {
  handoff = JSON.parse(await readFile(root + '.imd/reads/deployment.json', 'utf8'));
  network = JSON.parse(await readFile(root + '.imd/reads/network.json', 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  handoff = JSON.parse(await readFile(root + 'dist/imd-deployment.json', 'utf8'));
  network = { network: handoff.network, walletAddChain: handoff.walletAddChain };
}
const { launchId, chainId, sourceCommit, attestationHash, poolKey } = handoff;
const abis = new Map();
const contracts = handoff.contracts.map(({ name, address, abiHash: expected }) => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw Error('Invalid contract name');
  const bytes = execFileSync('git', ['show', `${sourceCommit}:docs/abi/${name}.json`], { cwd: root });
  const abi = JSON.parse(bytes.toString());
  if (!Array.isArray(abi) || abiHash(abi) !== expected) throw Error(`${name}: pinned ABI hash mismatch`);
  abis.set(name, bytes);
  return { name, address, abiHash: expected, abiPath: `abi/${name}.json` };
});
await build();
await mkdir(root + 'dist/abi', { recursive: true });
for (const [name, bytes] of abis) await writeFile(root + `dist/abi/${name}.json`, bytes);
const manifest = { version: 1, launchId, chainId, sourceCommit, attestationHash, contracts, assets: await inventory(root + 'dist'), ...(poolKey ? { poolKey } : {}), ...network };
await writeFile(root + 'dist/imd-deployment.json', JSON.stringify(manifest, null, 2) + '\n');
await import('./verify.mjs');
