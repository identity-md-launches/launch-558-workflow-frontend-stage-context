import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { keccak256, toBytes } from 'viem';
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const abiHash = abi => keccak256(toBytes(canonical(abi))).slice(2);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function inventory(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(`${root}/${prefix}`, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await inventory(root, path + '/'));
    else if (entry.isFile() && path !== 'imd-deployment.json') files.push({ path, sha256: sha256(await readFile(`${root}/${path}`)) });
    else if (!entry.isFile()) throw Error('Non-file export entry: ' + path);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
