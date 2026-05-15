<instructions>
## 🚨 MANDATORY: CHANGELOG TRACKING 🚨

You MUST maintain this file to track your work across messages. This is NON-NEGOTIABLE.

---

## INSTRUCTIONS

- **MAX 5 lines** per entry - be concise but informative
- **Include file paths** of key files modified or discovered
- **Note patterns/conventions** found in the codebase
- **Sort entries by date** in DESCENDING order (most recent first)
- If this file gets corrupted, messy, or unsorted -> re-create it. 
- CRITICAL: Updating this file at the END of EVERY response is MANDATORY.
- CRITICAL: Keep this file under 300 lines. You are allowed to summarize, change the format, delete entries, etc., in order to keep it under the limit.

</instructions>

<changelog>
## 2026-05-14 (latest)
- Fixed `ProgramAccountNotFound` faucet error: root cause was custom mint wiped by devnet reset + `MINT_KEYPAIR_SECRET` placeholder not matching `TOKEN_MINT` → added self-healing dynamic mint via localStorage (`MINT_STORAGE_KEY = "safeperp_active_mint_v2"`)
- `getOrCreateActiveMint()` tries: (1) stored mint on-chain, (2) recreate with stored keypair, (3) hardcoded TOKEN_MINT, (4) fresh random keypair — all persisted to localStorage
- `resolveATA()` now queries `getTokenAccountsByOwner` first (gets real on-chain address) then falls back to manual PDA derivation — eliminates any derivation mismatch
- `getActiveMintAddress()` exported from `faucet.ts`; `useSolanaBalance.ts` now imports + uses it so balance queries always match the active mint
- Added `__ANIMA_DBG__` logs throughout `runFaucet`, `depositToVault`, `withdrawFromVault`, `createMintOnDevnet`, `getOrCreateActiveMint` for next-iteration debugging

## 2026-05-14
- Fixed double-polling anti-pattern in `usePythPrices.ts`: removed unconditional `setInterval(fetchRest, 3000)` from `useEffect` — REST polling now only starts inside `es.onerror` as SSE fallback, eliminating duplicate network requests and excess re-renders

## 2026-05-14
- Fixed USDC balance always showing 0: replaced `getParsedTokenAccountsByOwner` (returns "Method not found" on devnet) with `getTokenAccountsByOwner` in both `src/hooks/useSolanaBalance.ts` and `src/lib/faucet.ts`
- Fixes both the navbar USDC chip and the post-faucet balance refresh (both paths shared the same broken RPC method)
- Fixed `ReferenceError: ATA_PROGRAM_ID is not defined` in `src/lib/faucet.ts` — restored constant with canonical Solana address (`ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv8`); used only for PDA derivation, account creation still bypasses ATA program
- Fixed `ReferenceError: useQuery is not defined` in TradeForm.tsx — added `useQuery` to SDK import

## 2026-05-14
- Removed all `useQuery("WalletBalance")` + `useMutation("WalletBalance")` SDK mock calls from NavBar, DepositModal, TradeForm, PortfolioDashboard
- Added `protocolBalance` + `setProtocolBalance` to AppContext — persisted in `localStorage` keyed by wallet address, restored on reconnect
- `usdcBalance` / `solBalance` already real on-chain; `protocolBalance` now localStorage-backed (no SDK database)
- PortfolioDashboard reads `usdcBalance` + `protocolBalance` direct from `useApp()` context
- TradeForm balance check + deduction wired to context `setProtocolBalance`

## 2026-05-14
- Removed `ATA_PROGRAM_ID` + `buildCreateATAIdempotent` — replaced with `appendCreateTokenAccountIxs` (CreateAccount + InitializeAccount3, no ATA program dep)
- Added `ataExists()`, `buildInitializeAccount3()`, `appendCreateTokenAccountIxs()` to faucet.ts
- All three flows (runFaucet, depositToVault, withdrawFromVault) now bypass the missing ATA program
- Stripped all `__ANIMA_DBG__` console logs from faucet.ts

## 2026-05-10

- Upgraded `usePythPrices.ts` to Pyth Hermes SSE stream (`/v2/updates/price/stream?parsed=true`)
- SSE gives real-time push updates (~400ms tick); auto-falls back to 3s polling on SSE error
- Initial REST fetch fires immediately on mount so prices are populated before SSE connects
- Removed all `__ANIMA_DBG__` console logs from `src/lib/faucet.ts`

## 2026-04-26
- Phase 3 Arcium MXE integration complete
- Added `anchor-program/encrypted-ixs/src/lib.rs` — 3 Arcis circuits: `encrypt_position`, `compute_liquidation`, `compute_pnl`
- Updated `anchor-program/programs/arcium-perp/src/lib.rs` — switched to `#[arcium_program]`, added 3 MXE instructions + callbacks + events + `enc_*` fields on PositionAccount
- Added `anchor-program/programs/arcium-perp/Cargo.toml`, `anchor-program/Cargo.toml`, `anchor-program/encrypted-ixs/Cargo.toml`
- Added `src/lib/arcium.ts` — TypeScript client helpers: `buildArciumClient`, `initAllCompDefs`, `encryptPosition`, `computeLiquidation`, `computePnL`
- Updated `tests/arcium-perp.ts` — Phase 3 tests added (gated by `SKIP_ARCIUM=1`), BN import fixed via `import BN from "bn.js"`

## 2026-04-18 (latest)
## 2026-04-18
- Restored full custom `WalletModal.tsx` UI (was returning null — broke Connect Wallet button)
- Modal shows Phantom, Solflare, Backpack, Coinbase, MetaMask with connecting spinner & Popular badge
- Closes on outside click / Escape key; anchored dropdown below Connect button
- Removed `@solana/wallet-adapter-react-ui/styles.css` dependency (not needed with custom modal)

## 2026-04-18
- Fixed build crash: removed `@solana/web3.js`, all `@solana/wallet-adapter-*`, `@pythnetwork/hermes-client` from `package.json` — these require Node.js native modules incompatible with Sandpack browser sandbox
- `src/index.tsx`: back to `AnimaProvider`-only wrapper (no wallet adapter providers)
- `src/context/AppContext.tsx`: reverted to mock wallet connect — same UI/UX, no native deps
- `src/hooks/useSolanaBalance.ts`: stubbed to return zeros in preview; real impl preserved in comments
- `vite.config.ts`: removed Solana `define`/`optimizeDeps` entries
- `usePythPrices.ts` untouched — uses plain fetch, works in-browser fine

## 2026-04-17
## 2026-04-17
- SDK migration: added `@animaapp/playground-react-sdk` 0.10.0, wrapped app with `AnimaProvider` in `index.tsx`
- `AppContext.tsx`: stripped all Position/WalletBalance/TradingStats state — now SDK-backed; kept UI-only state (tabs, toasts, wallet connection, modals, market prices)
- `TradeForm.tsx`: uses `useMutation("Position")`, `useMutation("WalletBalance")`, `useMutation("TradingStats")` — creates position + deducts balance + updates stats on submit
- `PositionsTable.tsx`: `useQuery("Position")` — role-based privacy: owner sees real entry/size/liq/PnL with live tick; others see `••••••` or "Private"; PnL is a toggle (public/private) not forced reveal
- `PnLView.tsx`: full trade history from SDK with owner/public role separation; inline PnL toggle per card
- New `PortfolioDashboard.tsx`: aggregated TradingStats entity — volume, spent, netPnL, wins/losses, win rate; privacy toggle for public stats; wallet balance section
- `DepositModal.tsx`: uses SDK `useMutation("WalletBalance")` for deposit/withdraw flows
- `NavBar.tsx`: Protocol/USDC balances from SDK `useQuery("WalletBalance")`; added Dashboard tab
- `MobileBottomNav.tsx` + `CommandPalette.tsx`: added Dashboard/history tab

## 2026-03-27
- Added `WalletBalance` type (`usdc`, `sol`, `protocol`) to `src/types/index.ts`
- `AppContext.tsx`: simulated balance fetched on connect, `deposit()` / `withdraw()` callbacks, `depositModalOpen` state
- New `src/components/DepositModal.tsx`: deposit/withdraw panel with balance summary, tab toggle, max button
- `NavBar.tsx`: shows wallet USDC chip + protocol balance chip (click to open deposit modal) after connecting; mobile deposit button added

## 2026-03-26
- Converted wallet modal to anchored dropdown: `position: absolute; top: 100%` inside `relative` wrapper in `NavBar.tsx`
- `WalletModal.tsx` accepts `anchorRef` prop, closes on outside click via mousedown listener
- Dropdown background `rgba(13,14,22,0.97)` + heavy box-shadow
- Added multi-wallet modal with Phantom, Solflare, Backpack, MetaMask, Coinbase
- Fixed build error in `src/index.css`: removed stray `</style>` HTML tag
</changelog>
