<instructions>
This file will be automatically added to your context. 
It serves multiple purposes:
  1. Storing frequently used tools so you can use them without searching each time
  2. Recording the user's code style preferences (naming conventions, preferred libraries, etc.)
  3. Maintaining useful information about the codebase structure and organization
  4. Remembering tricky quirks from this codebase

When you spend time searching for certain configuration files, tricky code coupled dependencies, or other codebase information, add that to this CODER.md file so you can remember it for next time.
Keep entries sorted in DESC order (newest first) so recent knowledge stays in prompt context if the file is truncated.
</instructions>

<coder>
## Arcium Phase 3 Patterns (2026-04-26)
- Arcium circuits live in `anchor-program/encrypted-ixs/src/lib.rs` under `#[encrypted] mod circuits {}`
- Main program uses `#[arcium_program]` macro (wraps `#[program]`), imports from `arcium_anchor::prelude::*`
- Each MXE instruction has a matching `#[arcium_callback]` + an emitted event for decrypting on client
- TypeScript helpers in `src/lib/arcium.ts` — use `@arcium-hq/client` + `@arcium-hq/mpc-sdk`
- Phase 3 tests gated by `SKIP_ARCIUM=1` env var — skipped automatically if Arcium localnet not running
- `PositionAccount` gained 3 new `[u8;32]` fields: `enc_collateral`, `enc_entry_price`, `enc_liquidation_price`
- Test BN fix: `import BN from "bn.js"` (default import, NOT named from @coral-xyz/anchor)


## Project Structure
- `src/context/AppContext.tsx` — UI-only context (no data state)
- `src/components/PortfolioDashboard.tsx` — new aggregated stats page (history tab)
- `src/types/index.ts` — types aligned with SDK entities
- Privacy model: isOwner = `user?.id === position.createdByUserId`; PrivateValue component masks for non-owners
</coder>
