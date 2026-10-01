# Vault Stake frontend

A Vite + React + TypeScript frontend for the deployed LaunchToken and StakingVault. The static site supports browser-wallet connection, stake approval and staking, locked/unlocked withdrawals, reward claims, exit, permissionless reward funding, and native/ERC-20 Uniswap v4 swaps. All transactions require the visitor's wallet. No server, keys, deployment or publishing step is included.

## Install, run and export

Node 22.12+ (validated with Node 24.9.0) and npm are required. From the repository root:

```sh
npm ci --prefix web --cache /tmp/vault-stake-npm-cache
npm run typecheck --prefix web
npm run test --prefix web
npm run build --prefix web
npm run preview --prefix web
```

`preview` serves the committed production output; Vite prints the URL. `npm run dev --prefix web` serves source and reads its configuration/ABIs from the committed `dist/` through a development-only middleware. The delivered `dist/` works under a gateway subpath with relative assets and one page; no rewrites or build server are needed. Publish **all** of `dist/` together, including its manifest and `abi/` directory.

## Deployment source of truth

`dist/imd-deployment.json` is the only persisted runtime deployment configuration. `src/config.ts` fetches that file and every referenced implementation ABI. There is no independent address, RPC or chain table in the application. Protocol interfaces in `src/protocol.ts` carry no addresses.

The export script reads the pinned deployment/network inputs when present, extracts each `docs/abi/<Contract>.json` with `git show <sourceCommit>:...`, and checks the handoff's canonical Keccak-256 ABI hashes. Canonicalization recursively sorts object keys and preserves array order. The copied ABI bytes remain identical to the pinned Git blobs. Vite builds the site; the script then emits ABIs and a fresh manifest containing SHA-256 hashes of **every other exported file**. It preserves the complete contract set, exact pool key (including its nonzero initialization guard), network and wallet-add-chain parameters. The older fee in the handoff's descriptive manifest is not used in place of its attested pool key.

When the ephemeral inputs have been removed, rebuilding uses the committed manifest as the deployment handoff and still obtains and verifies ABIs from its pinned Git source commit. Keep that commit in Git history. To build for a different release, supply its authoritative handoff/network inputs; do not edit addresses in components. Never run plain `vite build` for a delivery: use `npm run build --prefix web` so the manifest is regenerated after the last export change.

```sh
npm run verify --prefix web
npm run check:chain --prefix web
```

Verification checks the schema whitelist, exact handoff/network match when available, canonical ABI hashes against pinned Git exports, full asset inventory and hashes, relative paths, file-count and size limits. `check:chain` performs public reads only, records chain ID, contract/protocol code presence, vault state, pool state and an `eth_call` quote in `docs/evidence/chain-check.json`.

## Wallet and transaction behavior

- Connect an injected EIP-1193 browser wallet (for example MetaMask, Rabby, or a wallet's in-app browser). No WalletConnect project ID was provided, so no QR/mobile WalletConnect connector is configured. With multiple extensions, the wallet exposed as `window.ethereum` is used. Disconnect clears this application's session; it does not revoke token permissions in the wallet.
- The single wrong-network action attempts switching, adds the exact provided chain parameters on error 4902/unknown-chain, then switches again. Account, chain and disconnect events invalidate quotes and update eligibility.
- Public RPCs are tried in manifest order. Each snapshot checks chain ID, nonempty contract code, the vault's token binding, and all required reads at one block. Snapshots refresh every 12 seconds while visible, on demand, and after confirmation. Actions pause when reads fail or are more than 45 seconds old. Public RPC transport batches requests; there is no private RPC credential or wallet-signing fallback through a public provider.
- Amounts use token decimals and integer units. Approvals authorize the exact amount, remain pending until receipt confirmation, and refresh allowances before showing the next action. The entire signing flow is guarded against double clicks; unrelated controls are disabled without borrowing the active control's progress label.
- Adding stake requires acknowledgment that the whole position relocks for seven days. Claims remain available while locked. Withdraw/exit remain disabled until the latest chain timestamp reaches the unlock time.
- Funding requires acknowledgment that it cannot be withdrawn. The displayed minimum includes the immutable floor, remaining emissions, parked rewards and the active rate-preservation requirement. It can increase before inclusion. Simulation remains authoritative.
- Quotes use `simulateContract(quoteExactInputSingle)` and expire after 30 seconds. Slippage is 0.1–5%, with at most two decimal places. The exact handoff pool key goes into both quotes and swaps. StateView supplies the pool fee; no price feed or USD estimate is invented.
- Universal Router uses command `0x10`, actions `0x060c0f`, exact input and the calculated minimum output. Native input attaches exactly `amountIn`; token input sends no native value. ERC-20 input uses two separate approval steps when allowances are short: token → Permit2, then Permit2 → the configured router (exact amount, 30-minute expiry). All routing addresses are loaded from `network.uniswapV4`.
- Every write is publicly simulated before requesting the wallet signature; the wallet's current account/chain are rechecked. Receipt monitoring has no fixed timeout and detects replacements and cancellation. Explorer links, progress, rejection and revert messages appear beside the originating action. Reloading loses the in-memory pending state: consult the explorer before resubmitting a transaction whose result is unknown.

The runtime checks validate ABI binding, chain, code presence and token linkage, not bytecode equivalence or an independent contract audit. The attested handoff remains the trust anchor.

## Browser and interaction validation

The supplied browser MCP could not launch its missing `chrome-for-testing` binary. A locally installed Playwright Chromium performs the rendered and interaction validation instead, from a bounded foreground script that starts and closes its own HTTP preview at `/preview/`.

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/vault-stake-browsers npm exec --prefix web -- playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/vault-stake-browsers npm run test:browser --prefix web
```

The browser suite uses the real production JS and ABI encodings with mocked EIP-1193/RPC responses for transactions, plus an unmocked public-RPC read check. It writes screenshots and results to `docs/evidence/`. A failure screenshot is temporary under `/tmp`. No mocked transaction can reach a public RPC or real wallet. Node tests cover amount precision, funding arithmetic, native/ERC-20 swap encoding, slippage, approval progression and wallet/simulation failures.

See [validation](../docs/VALIDATION.md), [implemented design](../docs/DESIGN.md) and [evidence](../docs/evidence/). Screenshots named `mock-*` contain test balances, not live balances. Native screen-reader sessions, physical devices, browser-native zoom, other wallet implementations and funded live transactions were not tested. IPFS pinning, naming and publication checks belong to the publisher. Absolute social preview URLs await the final site URL.

## Scope and packaging

Source, build configuration, package manifest and lockfile live under `web/`; the committed static export is under root `dist/`; documentation/evidence is under `docs/`. `docs/DESIGN.md` satisfies the design-document deliverable within the overriding write scope; root `DESIGN.md` was not permitted. The explicitly allowed `web/.gitignore` excludes nested dependencies, caches and browser-test packaging artifacts. No dependency archives, browser binaries, vendored npm registry, new submodule, root configuration or deployed Solidity changes are included.
