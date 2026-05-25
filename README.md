# SafePerp — Private Perpetuals DEX on Solana

SafePerp is a privacy-preserving perpetual futures exchange built on Solana, powered by Arcium's Multi-Party Computation (MPC) network. Traders can open leveraged positions on SOL, BTC, ETH, and JTO without exposing their trading strategy, position size, or PnL to anyone on-chain.

## Program ID (Devnet)
76C52sp1b4MbXW6H64H3zDXqaHbGqfT915NVcUm6oZXn

## The Problem

Traditional on-chain perpetual exchanges expose everything publicly:

| What's Exposed | Risk |
|---|---|
| Entry price and size | Copy-trading attacks |
| Leverage ratio | Liquidation hunting |
| Liquidation price | Targeted manipulation |
| Unrealized PnL | Strategy theft |

This makes serious on-chain trading impossible for professional traders.

## How Arcium is Integrated

SafePerp uses three custom Arcium circuits running inside the MXE (Multi-party eXecution Environment):

### 1. encrypt_position
When a trader opens a position, collateral and entry price are encrypted client-side using X25519 key exchange, then re-encrypted by the MXE. Only the trader can decrypt their own data.

### 2. compute_liquidation
The liquidation price is computed entirely inside the MXE using encrypted inputs. Liquidation bots cannot read it, preventing targeted attacks.

### 3. compute_pnl
PnL is computed privately inside the MXE. Traders can selectively reveal their PnL using the Make PnL Public feature — proving performance without exposing strategy.

## Privacy Architecture

Trader Browser encrypts collateral and entry price using X25519 shared secret, sends to Arcium MXE cluster, which re-encrypts and stores ciphertexts on Solana blockchain.

On-chain position data:
- enc_collateral: 32 bytes encrypted — only trader can read
- enc_entry_price: 32 bytes encrypted — only trader can read
- enc_liquidation_price: 32 bytes encrypted — protects from hunters

## Features

- Private Positions — Entry price, size, leverage, and liquidation price are encrypted end-to-end
- Selective PnL Disclosure — Traders choose when to make their PnL public
- Real On-chain Trading — Actual USDC deposits and withdrawals via Solana program
- Live Price Feeds — Pyth Network oracle integration
- Wallet Support — Phantom, Solflare, Backpack, Coinbase Wallet
- Devnet Faucet — Get test USDC instantly to start trading

## Technical Stack

| Layer | Technology |
|---|---|
| Blockchain | Solana with Anchor framework |
| Privacy Layer | Arcium MXE (MPC) |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Oracles | Pyth Network |
| Token Standard | SPL Token (USDC) |
| Encryption | X25519 + Rescue Cipher |

## Smart Contract Instructions

- initialize_user — Creates user account PDA
- deposit — Transfers USDC from wallet to vault
- withdraw — Returns USDC from vault to wallet
- open_position — Opens leveraged position, deducts collateral
- close_position — Closes position, returns collateral plus PnL
- arcium_encrypt_position — Queues MXE encryption job
- arcium_compute_liquidation — Queues MXE liquidation computation
- arcium_compute_pnl — Queues MXE PnL computation

## Getting Started

cd frontend
npm install
npm run dev

Open http://localhost:5173

## Security Model

- Position data is encrypted before leaving the client browser
- The Arcium MXE cluster uses threshold MPC — no single node can decrypt
- The Solana program validates all computations via cryptographic callback verification
- PnL reveal is opt-in and controlled entirely by the trader

## License

MIT

## Known Limitations

### Arcium MXE Callback Timeouts (Devnet)

The `encrypt_position` circuit is fully working end-to-end on devnet — positions are successfully encrypted via Arcium MXE when opened.

However, `compute_liquidation` and `compute_pnl` MXE callbacks are timing out on devnet:

| Circuit | Status |
|---|---|
| encrypt_position | Working on devnet |
| compute_liquidation | MXE callback timing out |
| compute_pnl | MXE callback timing out |

All three circuits are correctly implemented and deployed. The instructions reach the chain successfully but the MXE nodes are not returning callback results for the liquidation and PnL computations. We believe this is a network-level issue with Arcium devnet infrastructure rather than a circuit implementation problem.

As a result, live PnL in the frontend uses a client-side formula while the encrypted on-chain PnL computation is pending MXE resolution.

### Price Feed

Pyth Network price feeds may be unavailable depending on network conditions. The app falls back to recent hardcoded prices when Pyth is unreachable.
