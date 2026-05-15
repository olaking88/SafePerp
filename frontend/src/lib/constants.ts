/**
 * constants.ts — Shared on-chain constants for SafePerp / arcium-perp.
 *
 * Program ID and token mint taken directly from the deployed devnet program.
 * DO NOT re-run `anchor build` — it would generate a new program ID.
 */

/** Deployed arcium-perp program ID on Solana devnet */
export const PROGRAM_ID = "6XdYgQbf4s5WRLe3DQFobCMGTsREjDW1LQPrA6NHSUBp";

/**
 * USDC token mint on devnet (custom SafePerp mint).
 * Matches TOKEN_MINT in faucet.ts — source of truth for balance queries.
 */
export const USDC_MINT = "2fxCkXUmGKi3rkBxxHizEtakZi6RZ7ASfDNYZ5xJpYS9";

/** Legacy alias kept for backward-compat with arcium.ts references */
export const ARC_TOKEN_MINT = USDC_MINT;

/**
 * Vault authority PDA seed — matches lib.rs: b"vault_authority"
 */
export const VAULT_AUTHORITY_SEED = "vault_authority";

/**
 * User account PDA seed — matches lib.rs: b"user_account"
 */
export const USER_ACCOUNT_SEED = "user_account";

/**
 * Position account PDA seed — matches lib.rs: b"position"
 */
export const POSITION_SEED = "position";

/**
 * Deploying wallet (program upgrade authority) on devnet.
 */
export const PROGRAM_WALLET = "nArSBqEeEo2pBSETSLBhLJRCLgruFC897pZL2A4vxrk";

/**
 * Solana devnet RPC endpoint.
 */
export const DEVNET_RPC = "https://api.devnet.solana.com";

/**
 * Token decimal places — 6 (matches USDC standard).
 */
export const TOKEN_DECIMALS = 6;

/**
 * Arcium MXE program on devnet.
 */
export const MXE_PROGRAM = "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";

/**
 * Arcium cluster offset used in arcium.ts helpers.
 */
export const ARCIUM_CLUSTER_OFFSET = 456;

/**
 * Devnet SOL airdrop amount requested per faucet call (in SOL).
 */
export const FAUCET_SOL_AMOUNT = 2;
