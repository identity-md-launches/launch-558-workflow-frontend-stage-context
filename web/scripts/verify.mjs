import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { abiHash, inventory, canonical } from './manifest-lib.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const m = JSON.parse(await readFile(root + 'dist/imd-deployment.json', 'utf8'));
const allowed = ['version','launchId','chainId','sourceCommit','attestationHash','contracts','assets','poolKey','network','walletAddChain'];
assert(Object.keys(m).every(k => allowed.includes(k)));
assert.equal(m.version, 1);
assert.equal(m.chainId, m.network.chainId);
assert.equal(m.chainId, Number(BigInt(m.walletAddChain.chainId)));
assert.match(m.attestationHash, /^[0-9a-f]{64}$/);
assert(m.assets.length <= 128);
assert.deepEqual(m.assets, await inventory(root + 'dist'));
let total = 0;
for (const a of m.assets) {
  assert(!a.path.includes('..') && !a.path.startsWith('/') && !a.path.includes(':'));
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  const size = (await stat(root + 'dist/' + a.path)).size;
  assert(size <= 8388608); total += size;
}
assert(total < 32 * 1024 * 1024);
for (const c of m.contracts) {
  assert.equal(abiHash(JSON.parse(await readFile(root + 'dist/' + c.abiPath, 'utf8'))), c.abiHash);
  const pinned = JSON.parse(execFileSync('git', ['show', `${m.sourceCommit}:docs/abi/${c.name}.json`], { cwd: root }));
  assert.equal(abiHash(pinned), c.abiHash);
}
try {
  const h = JSON.parse(await readFile(root + '.imd/reads/deployment.json', 'utf8'));
  for (const k of ['launchId','chainId','sourceCommit','attestationHash','poolKey']) assert.equal(canonical(m[k]), canonical(h[k]));
  assert.deepEqual(m.contracts.map(({name,address,abiHash})=>({name,address,abiHash})), h.contracts.map(({name,address,abiHash})=>({name,address,abiHash})));
  const n = JSON.parse(await readFile(root + '.imd/reads/network.json', 'utf8'));
  assert.equal(JSON.stringify(m.network), JSON.stringify(n.network));
  assert.equal(JSON.stringify(m.walletAddChain), JSON.stringify(n.walletAddChain));
  console.log('Pinned handoff and network: exact match.');
} catch (e) { if (e.code !== 'ENOENT') throw e; console.log('Pinned inputs absent; validated committed configuration and pinned Git ABIs.'); }
console.log(`Export verified: ${m.assets.length} assets, ${total} bytes; all SHA-256 and canonical Keccak ABI hashes valid.`);
