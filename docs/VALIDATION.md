# Frontend validation

Worker report, 2026-10-01. These checks were performed locally by the contributor; they are not independent certification or publisher acceptance.

## Delivered scope and decisions

Vite 7 / React 19 / TypeScript, with viem for ABI decoding, public reads, simulations and wallet requests. Source, package manifest, lockfile, build scripts and tests are under `web/`. Root `dist/` contains the complete static export and its deployment manifest. Documentation and screenshots are under `docs/`. No deployed Solidity source, Foundry settings, root build configuration, existing ABI exports, protected libraries or CI files were changed.

The application implements the approved seven-day vault: live APR and total stake, connected wallet balances/stake/earned rewards/unlock time, exact approval, stake, partial unstake, claim, exit and permissionless funding. It also provides the required attested-pool swap controls. The nonzero initialization guard and fee **12500** in the handoff's exact pool key take precedence over the older descriptive manifest's fee. USD context is explicitly unavailable. The interface is English and deliberately light-only. No live write was authorized or performed.

A root `DESIGN.md` conflicts with the overriding write budget. The complete design document is `docs/DESIGN.md`; no root design file was created. The only new ignore file is the explicitly budgeted `web/.gitignore`.

## Commands and results

All paths below are relative to the repository root.

| Command/check | Observed result |
| --- | --- |
| `npm install --prefix web --cache /tmp/vault-stake-npm-cache --no-audit --no-fund` | Dependencies installed; npm lockfile written under `web/`. Dependencies and caches excluded from delivery. |
| `npm run typecheck --prefix web` | Passed, exit 0 after final source change. |
| `npm run build --prefix web` | Passed, exit 0 after final source change; production output and manifest rebuilt. Seven declared assets, 523,786 bytes excluding the manifest. |
| `npm run test --prefix web` | Passed, exit 0; 10 Node tests. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/vault-stake-browsers npm run test:browser --prefix web` | Passed, exit 0; 15 browser scenarios including unmocked public reads. Results in `docs/evidence/browser-results.json`. |
| `npm run verify --prefix web` | Passed; pinned handoff/network, pinned implementation ABIs, complete asset inventory and SHA-256 hashes match. |
| `npm run check:chain --prefix web` | Passed, exit 0. Exact publicnode endpoint from the network input; Sepolia chain ID and nonempty contract code verified; read-only quote succeeded. |
| `git diff --check` | Passed for existing tracked content; final new-file whitespace/path audit is documented in packaging evidence. |
| `git add -- web dist docs` | Blocked: `.git/index.lock` could not be created because `.git` is a read-only filesystem. No commit could be created in this worker checkout. |

The exported files are one HTML file, one CSS file, two JavaScript chunks, a favicon, and the two implementation ABI JSON arrays. `imd-deployment.json` excludes itself from its inventory. It copies exactly the handoff identifiers/contracts/pool key and the network and wallet-add-chain objects, with no extra top-level keys. ABI bytes are obtained using `git show` at source commit `a81d8c485161368aa46b3170ac55b7a54acd9e2e`; canonical Keccak hashes match both attested values. No ABI was reconstructed from a guessed interface for either deployed contract.

## Interaction coverage

The suite serves the actual production export under `/preview/`, using a bounded foreground HTTP server and Chromium process that close when the suite finishes. Mock RPC/wallet traffic is intercepted and cannot broadcast. Encoded calls use the real implementation ABIs and protocol interfaces. The tests assert behavior and decoded transaction contents, not just the presence of buttons.

1. Static subpath loading, disconnected controls, four viewport sizes, automated accessibility checks, visible keyboard focus, reduced motion and 200% root text enlargement.
2. Keyboard connection, approval and stake using Tab/Enter/Space.
3. Tampered implementation ABI rejected before wallet actions appear.
4. Missing browser wallet, connection rejection and recovery.
5. Wrong network, the single switch action, exact `wallet_addEthereumChain` parameters and second switch after error 4902.
6. Approval remains disabled across the wallet-to-receipt gap; receipt refresh reveals staking; staking relocks the whole balance; claim remains possible while locked.
7. Partial withdrawal and exit update principal/rewards correctly.
8. Funding minimum, irreversible-contribution consent, exact approval and separate contribution.
9. Wallet rejection, simulation revert and reverted receipt never produce a success report.
10. Native buy quote never signs; swap uses the configured router, exact pool key, commands `0x10`, actions `0x060c0f`, ETH value and slippage minimum.
11. Token sell performs token approval, then Permit2 approval, then a zero-value router swap.
12. Failed quote and zero-minimum dust quote cannot submit a swap.
13. Quote expiry, invalid slippage, changed amount and account disconnect invalidate the quote.
14. Missing contract code/RPC failure disable writes; a successful refresh recovers.
15. Unmocked Chromium page loads the export, manifest and ABIs and reads live state over the public RPC.

Node tests additionally cover six-decimal precision, integer slippage rounding, active/ended funding arithmetic, both currency orderings for ERC-20 paired pools, exact settlement/take parameters, short/sufficient allowance handling and simulation-before-signature. Full browser ERC-20 paired **buy** behavior was not tested because this deployment pairs with native ETH; encoding/direction/zero-value behavior is covered by Node tests.

## Public-chain evidence

`docs/evidence/chain-check.json` records the read-only check at block **11,820,217**, returned by the RPC rather than manually converted to hex. RPC chain ID was **11155111**. Runtime sizes were 1,753 bytes for LaunchToken and 4,212 bytes for StakingVault; all six configured Uniswap contracts also had code. Live reads confirmed VSTK/18 decimals, the vault's token binding, 604,800-second lock, 2,592,000-second reward period and 1,000 VSTK absolute funding floor.

At that check the vault had zero principal, APR and reward rate, and no active reward period. Pool StateView reported an initialized price and fee 12500. A public `eth_call` quote for 1,000,000,000,000 wei input returned 49,157,255,177,983,259,368 VSTK base units. This is a historical quote, not a current execution guarantee. There were **zero broadcast transactions**. The browser later read its own latest block, recorded in `browser-results.json` and `live-desktop.jpg`.

Code presence and ABI binding do not prove deployed-bytecode equivalence. No explorer source verification, contract security audit, real-wallet confirmation, live approval/stake/fund/claim/swap, receipt replacement/cancellation on a real wallet, or long-running RPC resilience test was performed.

## Better Interface consolidated review

The pinned workflow and core principles of all six domains were read and applied while building. Supporting material covered focus, forms, typography, surfaces and documenting the actual implementation. The pinned Ethereum UX reference was also applied. Source licenses and attribution are in `docs/licenses/`.

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility | **Checked.** Native controls/labels, one main landmark, skip link, associated field hints/errors, named status region, persistent errors, disabled prerequisites. Axe WCAG A/AA/2.1 AA scans found zero violations at 1440, 768, 390 and 320px and in a connected swap quote. Keyboard connect/approve/stake completed; the refresh focus ring was visually inspected in `keyboard-focus.jpg`. Reduced-motion transitions were checked. | No native screen-reader session, physical device, browser-native 200% zoom or visual forced-colors inspection. Focus styling was not visually inspected on every control/background. Axe is not a compliance certification. |
| Layout | **Checked.** Screenshot inspection at desktop and mobile, DOM reading order, visible disclosure, inset actions and grids. Measured document width equaled viewport width at all four tested sizes. 200% root text enlargement did not overflow. | Intermediate 768px reflow was measured/automatically checked, not manually screenshot-inspected. No exhaustive width sweep, translated strings or RTL test. |
| Writing | **Checked.** Action verbs, explicit entire-stake lock and irreversible funding language, variable APR explanation, recoverable wallet/contract errors, quote expiry and no invented USD price. Labels reviewed against handlers. | English only; no localization research. |
| Typography | **Checked.** Source sizes/weights/line heights, tabular changing numbers, ID wrapping, labeled amount fields. Actual desktop/mobile screenshots inspected for clipping and hierarchy. | System font availability differs by OS. No claim that an optional named font is installed on all clients. |
| Colors | **Checked.** Role tokens, distinct warnings/errors, text cues, actual rendered colors collected in the browser. Measured body/page 10.77:1, muted/position 5.01:1, primary button 9.33:1. Automated scans passed the tested states. | No dark theme is offered. All possible dynamic pairs and forced-color combinations were not manually measured. |
| UI | **Checked.** Primary vs secondary emphasis, selected/disabled/loading/empty/error states, transaction-specific progress labels, receipt lock, quote progression and reduced-motion behavior. Desktop/mobile screenshots inspected. | No 10%-speed animation-panel replay. No overlay patterns apply; there are no modals, carousels or automatic motion. |

### Findings, corrections and rechecks

Source references identify the final locations; the observations describe defects found during implementation/review.

| Severity / owner | Source | Finding and correction | Recheck |
| --- | --- | --- | --- |
| High / accessibility | `web/src/main.tsx:128` | Axe reported `aria-prohibited-attr`: the transaction wrapper used `aria-label` on an unroled div. Added a named region around the stable status and errors. | All final axe scans passed. |
| Medium / layout, writing | `web/src/main.tsx:28`, `web/src/main.tsx:96`, `web/src/main.tsx:128` | A single feedback area after both desktop panels placed errors far below the initiating form on mobile. Feedback now appears within the initiating action/position panel. | Rejection, simulation error, receipt failure and mobile screenshots rechecked. |
| Medium / UI | `web/src/main.tsx:126` | A shared pending branch could relabel the stake button while the separate claim action was running. Progress text now follows its action location while other transaction controls remain disabled. | Approval/claim flow passes; claim during lock remains available after stake confirmation. |
| Medium / writing, UI | `web/src/main.tsx:141` | Wrong-chain notice and primary action initially both offered switching. The notice now explains the state and the primary button is the single switch control. | Browser test asserts exactly one switch button and exact add-chain fallback. |
| Medium / UI | `web/src/main.tsx:78`, swap quote rendering | A one-base-unit quote rounded to a zero minimum, leaving a silent no-op confirm path. Such quotes now explain that a larger amount is required and disable confirmation. | Failed/dust quote scenario passes with zero wallet submissions. |

Early test harness failures were also repaired: waiting for initial app readiness before keyboard assertions, resolving inherited page backgrounds for contrast measurement, handling bigint approval arguments in the RPC mock, and advancing mocked blocks for receipt polling. These were harness defects, not silently reclassified application passes. Final evidence was regenerated after the application fixes.

### Screenshots

- `docs/evidence/live-desktop.jpg`: actual public-RPC state, 1440×1100 viewport, full page.
- `docs/evidence/mock-1440.jpg`: 1440×1000, realistic mocked funded state, disconnected wallet.
- `docs/evidence/mock-390.jpg`, `mock-320.jpg`: mobile full-page reflow with mocked state.
- `docs/evidence/mock-swap.jpg`: connected native buy quote with mocked values.
- `docs/evidence/keyboard-focus.jpg`: visible focus after using the skip link and Tab.

The supplied MCP browser returned “chrome-for-testing is not installed” and there was no tool-managed preview descriptor. The fallback used the installed Playwright Chromium under `/tmp`; the actual production export was rendered, screenshots were opened and inspected, and browser/interaction checks were run. Merely reading source was not used as evidence of rendered behavior.

## Packaging and completion

See `docs/evidence/packaging.json` for the final file/path/size audit. The full tracked-plus-new source/export/evidence payload and existing packed Git history fit comfortably under the 8 MiB submission limit. No `node_modules`, nested dependency caches, tarballs, browser binaries, npm mirrors or new submodule are in the deliverable inventory. Runtime assets and the committed-source ABI copies remain complete.

**Source, static export and worker validation are complete for the allowed paths. Git commit is blocked by the read-only `.git` directory.** The files are left ready for the publisher/control plane to capture. No remote push, site publication, IPFS pinning, naming, CID validation or contract redeployment was attempted. Absolute Open Graph URLs and the publisher's immutable/named-site checks remain publication-stage work, not evidence claimed by this worker.
