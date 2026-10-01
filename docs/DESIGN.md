# Vault Stake design

## Overview

Vault Stake is a single-page staking interface for holders of the launch token on Sepolia. A warm, light surface, restrained green actions and serif display headings distinguish it from a trading terminal. The page prioritizes current vault metrics, an action form, a wallet position, then reward economics and deployment details. This is an inferred design direction for the assignment, not an externally approved brand system.

The canonical implementation is `web/src/styles.css`; page patterns and components are in `web/src/main.tsx`. This document lives under `docs/` because the assignment's overriding write scope does not allow a repository-root `DESIGN.md`.

## Colors

The stylesheet separates hexadecimal primitives from semantic roles. Use semantic properties in components.

| Semantic token | Value / primitive | Role |
| --- | --- | --- |
| `--color-bg` | `#f5f4ed` / cream-50 | Page |
| `--color-surface` | `#fffef9` / white | Primary action panel and fields |
| `--color-subtle` | `#eeeee3` / cream-100 | Position panel, contextual explanations, selector track |
| `--color-text` | `#243c33` / ink-900 | Primary text |
| `--color-muted` | `#5b685e` / ink-600 | Secondary text and helper copy |
| `--color-border` | `#ddded2` / cream-200 | Structural dividers and panels |
| `--color-control-border` | `#7d8b7f` | Inputs and secondary buttons |
| `--color-accent` | `#174f40` / green-800 | Primary action fill |
| `--color-accent-hover` | `#103e32` / green-900 | Primary action hover |
| `--color-on-accent` | `#fffef9` | Text on primary action |
| `--color-focus` | `#235bc2` | 3px focus perimeter, 4px offset |
| `--color-warning-bg`, `--color-warning` | `#f5ebce`, `#735313` | Wrong-network notice |
| `--color-error-bg`, `--color-error` | `#fceae5`, `#9a352b` | Persistent errors |

Only the active primary action uses a filled green button. Other actions are outlined or underlined; errors and eligibility states always have text as well as color. This is a deliberate light-only implementation, with `color-scheme: light` and no theme toggle. The decorative vault illustration uses a few local sage colors and is hidden from assistive technology.

Measured rendered contrast is recorded in `docs/evidence/browser-results.json`: body/page 10.77:1, muted text/position surface 5.01:1, primary text/button 9.33:1. These are specific measured pairs, not a claim that every possible state/background has been manually measured.

## Typography

- Body stack: `Avenir Next`, Avenir, `Segoe UI`, sans-serif. Display stack: `Iowan Old Style`, `Palatino Linotype`, `Book Antiqua`, Palatino, Georgia, serif. There are no downloaded fonts or remote font requests. The available system fallback varies by host; the CSS font stack is not evidence that Avenir is installed.
- Root: 16px, line-height 1.55. Body/helper text generally uses 0.8125–0.9375rem; form inputs remain at least 1rem. Large amount input: 2rem. Source retains small labels at 0.65–0.75rem; these were visually inspected at mobile widths, with root text enlargement tested separately.
- H1: `clamp(3.1rem, 6vw, 5rem)`, letter spacing -0.055em. At the compact breakpoint it is 3.6rem. The second line is italic. H2: 2rem, -0.035em; action-panel H2: 1.8rem. Display headings use weight 400 and line-height 1.1.
- Eyebrows: 0.6875rem, weight 600, uppercase with 0.14em tracking. Button labels use 500–600. No light body weights are requested.
- Metrics and balances use tabular numbers. Headings balance wrapping, descriptions use pretty wrapping, and IDs/addresses wrap rather than truncate essential details. The header wallet abbreviation has a full checksummed title and a full address in deployment details.
- `font-synthesis: none` is set; operating-system font availability and rendering were not exhaustively verified. No typography dependency is required for offline static resources.

## Layout

`.wrap` caps the content at 1120px with 80px total outer gutter on large screens. Internal grouping uses approximately 8–12px within small controls, 16–24px between related elements, 30px panel padding and 40–65px section spacing. Primary controls are in normal document flow, never overlaid on content.

The desktop workspace is a 1.35:1 grid with a 24px gap. The action panel precedes the position panel in both DOM and visual order. The three metric columns share an alignment grid, and reward stream details form a two-column section. Deployment metadata uses native `<details>`.

Implemented media breakpoints:

- 60rem: gutters shrink to 48px total, panel padding to 24px; workspace columns become 1.2:1 with an 18px gap.
- 48rem: workspace stacks; the vault illustration scales down; the decorative header network badge disappears but the network remains named in relevant states and the footer disclaimer.
- 35rem: 16px side gutters, wrapping header, no decorative illustration, stacked metric rows, 22px/18px panel padding and a single-column reward section. Metric values stay alongside their labels when they fit and can wrap units.

Rendered checks covered 1440, 768, 390 and 320 CSS pixels with no horizontal overflow; 200% root text enlargement was checked independently. Native browser zoom, arbitrary translated strings and RTL variants were not validated; the delivered copy is English. Most directional layout properties use logical CSS. This is not a localized product.

## Elevation & Depth

The interface is mostly flat. Fine borders mark structure; tonal fills group context and wallet state. Only the selected action segment has a tiny `0 1px 2px #243c330a` shadow. The decorative vault artwork uses an offset sage shadow; it is not a reusable interactive elevation convention. No dialog, drawer, modal backdrop or fixed action bar is present.

## Shapes

Panels have a 16px radius. Context/input/quote boxes use 9px. Buttons use 8px, the selector track 9px with 5px internal padding, and its selected segments 5px. The brand mark is a 43px square with a 12px radius (36×38px at the compact breakpoint). Circular token marks are decorative. Form borders are retained to distinguish editable controls.

## Components

`web/src/main.tsx` contains these real components/patterns:

- `Metric({label, value, unit, detail})`: a changing numeric read with an explicit label and explanation. Missing reads display an em dash; zero is reserved for a real zero result.
- `AddressRow({name, address, config})`: checksummed full address, explorer link, copy button and persistent copy feedback. Copy failure provides an instruction to select the visible address.
- `App`: controls the one-page workflow. The action selector uses ordinary native buttons with `aria-pressed`, not incomplete ARIA tabs. Native Tab/Enter/Space keyboard behavior applies.
- `.primary`: the full-width connect/switch/approve/execute control. It changes with transaction prerequisites. Invalid, unverified, locked or pending actions are natively disabled. Each transaction has an action key; claim/exit do not relabel the staking action as pending.
- `.quiet`: neutral outlined control; `.text-button`: underlined secondary action. Targets have a 44px minimum button height. Hover is gated to hover-capable devices.
- `.amount-box`: visible label, decimal keyboard hint, token units, available balance, optional exact max, precision validation and associated error/hint IDs. Focus is shown on the surrounding amount box; removing the inner input outline does not remove its visible focus indicator.
- `.context-box` plus `.consent`: consequential lock or irreversible funding explanation, followed by an acknowledgment checkbox before enabling submission.
- `.quote-box`: output, exact minimum, exchange rate, fee and expiry. No placeholder dollar valuation is used.
- `.transaction-feedback`: a named region containing a stable polite status, persistent alert on errors and explorer hash link. Rendered beside the action panel or the position controls that initiated the transaction.
- `Boot`: configuration/ABI verification loading and recoverable failure with a reload button. No transaction controls appear after ABI verification failure.

Focus uses `:focus-visible`; the skip link leads into `<main>`. Color is not the only state cue. Button press motion is `scale(.96)` with 120ms transitions only under `prefers-reduced-motion: no-preference`; reduced motion uses instant changes. Forced-color focus defers to `Highlight`. No automatic animation runs on page load.

## Do's and Don'ts

- Start an additional section with `.wrap`, the established heading hierarchy and a `.panel` only when it groups an actual task. Reuse semantic tokens and the existing button patterns.
- Keep exact amounts and contract consequences visible before signature. Keep quote, approval and swap separate.
- Use real chain reads for statistics. Do not fill missing state with demo APR or balances, invent USD prices, or introduce an independent address map.
- Give new controls native semantics, visible labels and persistent recovery instructions. Preserve the 320px reflow and keyboard path.
- Add a second page only with hash navigation or an explicitly exported file; static hosts do not provide server routing.

Design guidance attribution: adapted application of Jakub Krehel's Better Interface, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation method adapted from Paul Bakaus's Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. This document describes the new implementation, not a verbatim upstream guide. License texts are in `docs/licenses/`.
