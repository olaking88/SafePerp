/**
 * arcium.ts — Phase 3 Arcium MXE client helpers for arcium-perp.
 *
 * Three async helpers mirror the on-chain MXE instructions:
 *   encryptPosition()     — encrypts (collateral, entry_price) and queues the
 *                           arcium_encrypt_position instruction
 *   computeLiquidation()  — encrypts (entry_price, leverage) and queues
 *                           arcium_compute_liquidation
 *   computePnL()          — re-uses stored ciphertexts and queues
 *                           arcium_compute_pnl; returns decrypted i64 PnL
 *
 * Usage (TypeScript test / client):
 *   import { buildArciumClient, encryptPosition, computePnL } from "./arcium";
 */

import * as anchor from "@coral-xyz/anchor";
import {
  getArciumEnv,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  awaitComputationFinalization,
} from "@arcium-hq/client";
import { deserializeLE, RescueCipher, x25519 } from "@arcium-hq/client";
import { randomBytes } from "@noble/hashes/utils";
import type { Program } from "@coral-xyz/anchor";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArciumClient {
  /** Arcium cluster environment (offsets, cluster pubkey) */
  env: ReturnType<typeof getArciumEnv>;
  /** Ephemeral x25519 keypair for this session */
  privateKey: Uint8Array;
  publicKey:  Uint8Array;
  /** Cipher initialised from sharedSecret = x25519(privateKey, mxePub) */
  cipher: RescueCipher;
}

export interface EncryptPositionResult {
  /** 16-byte nonce used to encrypt */
  nonce: Buffer;
  /** 32-byte ciphertext for collateral */
  encCollateral:  number[];
  /** 32-byte ciphertext for entry_price */
  encEntryPrice:  number[];
  /** Client public key sent to MXE */
  publicKey: number[];
  /** u128 nonce serialised as BN for Anchor */
  nonceBN: anchor.BN;
}

export interface ComputeLiquidationResult {
  /** Encrypted liquidation price (32 bytes) — decryptable with cipher */
  encLiquidationPrice: number[];
  /** Nonce from the MXE callback event */
  nonce: Uint8Array;
  /** Raw decrypted value */
  liquidationPrice: bigint;
}

export interface ComputePnLResult {
  /** Encrypted PnL (32 bytes) */
  encPnl: number[];
  /** Nonce from the MXE callback event */
  nonce: Uint8Array;
  /** Raw decrypted signed value (may be negative) */
  pnl: bigint;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * Initialise an ArciumClient for the current Anchor provider.
 * Call this once per test/session.
 *
 * @param provider  Anchor provider (pre-configured with wallet + connection)
 * @param programId Your deployed arcium-perp program ID
 */
export async function buildArciumClient(
  provider: anchor.AnchorProvider,
  programId: anchor.web3.PublicKey,
): Promise<ArciumClient> {
  const env = { arciumClusterOffset: 456, arciumBackupClusterOffset: NaN };
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey  = x25519.getPublicKey(privateKey);
  const mxePub = await getMXEPublicKey(provider, programId);
  const shared     = x25519.getSharedSecret(privateKey, mxePub);
  const cipher     = new RescueCipher(shared);

  return { env, privateKey, publicKey, cipher };
}

// ─── Helper: listen for a single program event then unsubscribe ───────────────

function awaitProgramEvent<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  eventName: string,
): Promise<T> {
  return new Promise((resolve) => {
    const id = program.addEventListener(eventName, (event: T) => {
      program.removeEventListener(id);
      resolve(event);
    });
  });
}

// ─── Helper: build Arcium PDA accounts for queue_computation ─────────────────

function arciumQueueAccounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env: ReturnType<typeof getArciumEnv>,
  programId: anchor.web3.PublicKey,
  computationOffset: anchor.BN,
  ixName: string,
) {
  return {
    computationAccount: getComputationAccAddress(env.arciumClusterOffset, computationOffset),
    clusterAccount:     getClusterAccAddress(env.arciumClusterOffset),
    mxeAccount:         getMXEAccAddress(programId),
    mempoolAccount:     getMempoolAccAddress(env.arciumClusterOffset),
    executingPool:      getExecutingPoolAccAddress(env.arciumClusterOffset),
    compDefAccount:     getCompDefAccAddress(
      programId,
      Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE(),
    ),
  };
}

// ─── One-time CompDef initialization ─────────────────────────────────────────

/**
 * Initialize all three Arcium computation-definition PDAs.
 * Must be called once after deploying the program (idempotent — fails silently
 * if already initialised due to Anchor's `init` constraint).
 */
export async function initAllCompDefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  payer: anchor.web3.Keypair,
  env: ReturnType<typeof getArciumEnv>,
): Promise<void> {
  const programId = program.programId;
  const mxeAccount = getMXEAccAddress(programId);

  for (const ixPair of [
    { method: "initEncryptPositionCompDef",    name: "encrypt_position" },
    { method: "initComputeLiquidationCompDef", name: "compute_liquidation" },
    { method: "initComputePnlCompDef",         name: "compute_pnl" },
  ]) {
    try {
      const compDefAccount = getCompDefAccAddress(
        programId,
        Buffer.from(getCompDefAccOffset(ixPair.name)).readUInt32LE(),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (program.methods as any)[ixPair.method]()
        .accountsPartial({ payer: payer.publicKey, compDefAccount, mxeAccount })
        .signers([payer])
        .rpc({ commitment: "confirmed" });
      console.log(`[arcium] CompDef '${ixPair.name}' initialised`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already in use")) {
        console.log(`[arcium] CompDef '${ixPair.name}' already exists — skipping`);
      } else {
        throw e;
      }
    }
  }
}

// ─── encryptPosition ─────────────────────────────────────────────────────────

/**
 * Encrypts (collateral, entry_price) client-side with Rescue cipher and queues
 * the arcium_encrypt_position MXE instruction.  The MXE will re-encrypt under
 * its own key and trigger the callback which stores ciphertexts in PositionAccount.
 *
 * Await `awaitComputationFinalization` after this call to confirm storage.
 */
export async function encryptPosition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  provider: anchor.AnchorProvider,
  client: ArciumClient,
  positionPda: anchor.web3.PublicKey,
  positionIndex: bigint,
  collateral: bigint,
  entryPrice: bigint,
): Promise<{ computationOffset: anchor.BN; txSig: string }> {
  const nonce      = randomBytes(16);
  const nonceBN    = new anchor.BN(deserializeLE(Buffer.from(nonce)).toString());
  const plaintext  = [collateral, entryPrice];
  const ciphertext = client.cipher.encrypt(plaintext, nonce);

  const computationOffset = new anchor.BN(Buffer.from(randomBytes(8)).toString("hex"), "hex");

  const txSig = await program.methods
    .arciumEncryptPosition(
      computationOffset,
      Array.from(ciphertext[0]),
      Array.from(ciphertext[1]),
      Array.from(client.publicKey),
      nonceBN,
    )
    .accountsPartial({
      payer:    provider.wallet.publicKey,
      position: positionPda,
      ...arciumQueueAccounts(client.env, program.programId, computationOffset, "encrypt_position"),
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  console.log(`[arcium] encryptPosition queued: ${txSig}`);
  return { computationOffset, txSig };
}

// ─── computeLiquidation ──────────────────────────────────────────────────────

/**
 * Encrypts (entry_price, leverage) and queues arcium_compute_liquidation.
 * Waits for MXE finalization, then decrypts the resulting liquidation price.
 */
export async function computeLiquidation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  provider: anchor.AnchorProvider,
  client: ArciumClient,
  positionPda:   anchor.web3.PublicKey,
  entryPrice:    bigint,
  leverage:      number,
  side:          number,  // 0 = Long, 1 = Short
): Promise<ComputeLiquidationResult> {
  const nonce      = randomBytes(16);
  const nonceBN    = new anchor.BN(deserializeLE(Buffer.from(nonce)).toString());
  const ciphertext = client.cipher.encrypt([entryPrice, BigInt(leverage)], nonce);

  const computationOffset = new anchor.BN(Buffer.from(randomBytes(8)).toString("hex"), "hex");

  // Listen for callback event before sending tx
  const eventPromise = awaitProgramEvent<{
    position: anchor.web3.PublicKey;
    encLiquidationPrice: number[];
    nonce: number[];
  }>(program, "liquidationComputedEvent");

  await program.methods
    .arciumComputeLiquidation(
      computationOffset,
      Array.from(ciphertext[0]),  // enc_entry_price
      Array.from(ciphertext[1]),  // enc_leverage
      side,
      Array.from(client.publicKey),
      nonceBN,
    )
    .accountsPartial({
      payer:    provider.wallet.publicKey,
      position: positionPda,
      ...arciumQueueAccounts(client.env, program.programId, computationOffset, "compute_liquidation"),
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  // Wait for MXE to finalise
  await awaitComputationFinalization(provider, computationOffset, program.programId, "confirmed");

  const event       = await eventPromise;
  const resultNonce = new Uint8Array(event.nonce);
  const decrypted   = client.cipher.decrypt([event.encLiquidationPrice], resultNonce);

  return {
    encLiquidationPrice: event.encLiquidationPrice,
    nonce:               resultNonce,
    liquidationPrice:    decrypted[0],
  };
}

// ─── computePnL ──────────────────────────────────────────────────────────────

/**
 * Queues arcium_compute_pnl using the ciphertexts already stored in
 * PositionAccount (via encryptPosition), along with a plaintext exit_price.
 * Waits for MXE finalization, then decrypts and returns the signed PnL.
 *
 * @param encCollateral   32-byte ciphertext from PositionAccount
 * @param encEntryPrice   32-byte ciphertext from PositionAccount
 */
export async function computePnL(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  provider: anchor.AnchorProvider,
  client: ArciumClient,
  positionPda:    anchor.web3.PublicKey,
  encCollateral:  number[],
  encEntryPrice:  number[],
  exitPrice:      bigint,
  leverage:       number,
  side:           number,
): Promise<ComputePnLResult> {
  const nonce   = randomBytes(16);
  const nonceBN = new anchor.BN(deserializeLE(nonce).toString());

  const computationOffset = new anchor.BN(Buffer.from(randomBytes(8)).toString("hex"), "hex");

  // Listen for callback event before sending tx
  const eventPromise = awaitProgramEvent<{
    position: anchor.web3.PublicKey;
    encPnl:   number[];
    nonce:    number[];
  }>(program, "pnlComputedEvent");

  await program.methods
    .arciumComputePnl(
      computationOffset,
      encCollateral,
      encEntryPrice,
      new anchor.BN(exitPrice.toString()),
      leverage,
      side,
      Array.from(client.publicKey),
      nonceBN,
    )
    .accountsPartial({
      payer:    provider.wallet.publicKey,
      position: positionPda,
      ...arciumQueueAccounts(client.env, program.programId, computationOffset, "compute_pnl"),
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  // Wait for MXE to finalise
  await awaitComputationFinalization(provider, computationOffset, program.programId, "confirmed");

  const event       = await eventPromise;
  const resultNonce = new Uint8Array(event.nonce);

  // PnL is i64 — cast from BigInt (may be negative)
  const raw = client.cipher.decrypt([event.encPnl], resultNonce)[0];
  const pnl = BigInt.asIntN(64, raw);

  return {
    encPnl: event.encPnl,
    nonce:  resultNonce,
    pnl,
  };
}
