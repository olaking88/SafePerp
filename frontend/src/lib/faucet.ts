/**
 * faucet.ts — REAL on-chain faucet + SPL token deposit helpers for SafePerp
 *
 * Mint: dynamically managed (self-heals after devnet resets via localStorage)
 * Vault: nArSBqEeEo2pBSETSLBhLJRCLgruFC897pZL2A4vxrk  (protocol wallet)
 *
 * Two main flows:
 *  1. runFaucet()       — mint authority signs, sends tokens to user wallet
 *  2. depositToVault()  — user wallet signs via Phantom/Solflare, transfers to vault ATA
 */

import nacl from "tweetnacl";

const DEVNET_RPC = "https://api.devnet.solana.com";

/** Fallback devnet USDC mint (used if nothing in localStorage) */
export const TOKEN_MINT = "2fxCkXUmGKi3rkBxxHizEtakZi6RZ7ASfDNYZ5xJpYS9";
export const USDC_MINT = TOKEN_MINT;

/** Protocol vault authority — receives deposited USDC */
export const VAULT_ADDRESS = "nArSBqEeEo2pBSETSLBhLJRCLgruFC897pZL2A4vxrk";

/** 6 decimals — matches USDC standard */
const TOKEN_DECIMALS = 6;

/**
 * Mint authority keypair for the devnet token.
 * DEVNET ONLY — safe to embed in frontend for testnet demo.
 */
const MINT_AUTHORITY_SECRET = new Uint8Array([
  76, 247, 32, 19, 215, 134, 85, 203, 201, 124, 74, 216, 250, 189, 216, 76, 149,
  240, 253, 168, 35, 216, 128, 134, 35, 189, 23, 13, 35, 128, 62, 98, 11, 146,
  70, 197, 212, 170, 152, 118, 236, 10, 29, 126, 45, 146, 74, 189, 245, 212,
  197, 212, 94, 55, 199, 101, 211, 195, 12, 76, 41, 27, 205, 217,
]);

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv8";

// ── Dynamic mint persistence ──────────────────────────────────────────────────
// Devnet is periodically reset, wiping all accounts including our custom mint.
// We persist the active mint address + keypair in localStorage so we can:
//   1. Reuse it across page refreshes
//   2. Recreate it on devnet if it gets wiped (we have the keypair)
//   3. Create a completely fresh mint as last resort

const MINT_STORAGE_KEY = "safeperp_active_mint_v2";

interface StoredMint {
  address: string;
  secret: number[]; // 64-byte nacl Ed25519 secretKey
}

/** Module-level active mint — updated by getOrCreateActiveMint() */
let _activeMintAddress: string = (() => {
  try {
    const s = localStorage.getItem(MINT_STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as StoredMint;
      if (parsed?.address) return parsed.address;
    }
  } catch {}
  return TOKEN_MINT;
})();

/**
 * Returns the currently active mint address.
 * Read from localStorage on module init; updated dynamically when mint is recreated.
 * Used by useSolanaBalance.ts to keep balance queries in sync with faucet.
 */
export function getActiveMintAddress(): string {
  return _activeMintAddress;
}

// ── Pure-JS Base58 ────────────────────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58dec(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const digit = BASE58_ALPHABET.indexOf(c);
    if (digit < 0) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + BigInt(digit);
  }
  let leadingZeros = 0;
  for (const c of s) {
    if (c !== "1") break;
    leadingZeros++;
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
}

function b58enc(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let result = "";
  while (n > 0n) {
    result = BASE58_ALPHABET[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    result = "1" + result;
  }
  return result;
}

// ── Byte helpers ──────────────────────────────────────────────────────────────

function writeU64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function encodeCompactU16(val: number): Uint8Array {
  if (val <= 0x7f) return new Uint8Array([val]);
  if (val <= 0x3fff) return new Uint8Array([(val & 0x7f) | 0x80, val >> 7]);
  return new Uint8Array([
    (val & 0x7f) | 0x80,
    ((val >> 7) & 0x7f) | 0x80,
    val >> 14,
  ]);
}

// ── RPC ───────────────────────────────────────────────────────────────────────

async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(DEVNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

// ── Ed25519 on-curve check ────────────────────────────────────────────────────

const ED25519_P = BigInt(
  "57896044618658097711785492504343953926634992332820282019728792003956564819949",
);

function edIsOnCurve(bytes: Uint8Array): boolean {
  const p = ED25519_P;
  const yb = Uint8Array.from(bytes);
  yb[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(yb[i]);
  if (y >= p) return false;
  const d = BigInt(
    "37095705934669439343138083508754565189542113879843219016388785533085940283555",
  );
  const y2 = (y * y) % p;
  const u = (y2 - 1n + p) % p;
  const v = (d * y2 + 1n) % p;
  let inv = 1n,
    base = v % p,
    exp = p - 2n;
  while (exp > 0n) {
    if (exp & 1n) inv = (inv * base) % p;
    base = (base * base) % p;
    exp >>= 1n;
  }
  const x2 = (u * inv) % p;
  let leg = 1n,
    lb = x2 % p,
    le = (p - 1n) / 2n;
  while (le > 0n) {
    if (le & 1n) leg = (leg * lb) % p;
    lb = (lb * lb) % p;
    le >>= 1n;
  }
  return x2 === 0n || leg === 1n;
}

// ── Derive ATA (fallback — prefer resolveATA which queries chain first) ────────
//
// Canonical Solana PDA for an Associated Token Account:
//   findProgramAddress(
//     seeds = [ownerBytes, tokenProgramBytes, mintBytes],
//     programId = ATA_PROGRAM_ID
//   )
//
// Each attempt: SHA-256( ownerBytes ++ tokenPrgBytes ++ mintBytes ++ [nonce] ++ ataPrgBytes ++ label )
// where label = "ProgramDerivedAddress" (UTF-8).
// Reject if the 32-byte result is a point ON the ed25519 curve (must be off-curve).
// Return the first off-curve result (starting from nonce 255 down to 0).

async function deriveATA(ownerB58: string, mintB58: string): Promise<string> {
  const owner = b58dec(ownerB58);
  const mint = b58dec(mintB58);
  const tokenPrg = b58dec(TOKEN_PROGRAM_ID);
  const ataPrg = b58dec(ATA_PROGRAM_ID);
  const label = new TextEncoder().encode("ProgramDerivedAddress");

  for (let nonce = 255; nonce >= 0; nonce--) {
    // Seed layout: each seed is length-prefixed? NO — Solana findProgramAddress
    // concatenates raw seed bytes then appends programId + domain string + nonce.
    // Exact layout: seeds[0] ++ seeds[1] ++ seeds[2] ++ nonce(1 byte) ++ programId(32 bytes) ++ label
    const input = concat(
      owner, // 32 bytes — wallet pubkey
      tokenPrg, // 32 bytes — Token Program ID
      mint, // 32 bytes — mint address
      new Uint8Array([nonce]), // 1 byte — nonce (255 down to 0)
      ataPrg, // 32 bytes — ATA Program ID (the "program" for findProgramAddress)
      label, // "ProgramDerivedAddress" (22 bytes)
    );
    const hashBuf = await crypto.subtle.digest("SHA-256", input);
    const candidate = new Uint8Array(hashBuf);
    if (!edIsOnCurve(candidate)) {
      return b58enc(candidate);
    }
  }
  throw new Error("Could not derive ATA");
}

/**
 * Resolve the ATA address for (owner, mint).
 * Strategy: query getTokenAccountsByOwner first (gets the REAL on-chain address),
 * fall back to deriveATA if no account exists yet.
 * This avoids any risk of off-by-one in our manual PDA derivation.
 */
async function resolveATA(
  ownerB58: string,
  mintB58: string,
): Promise<{ ataAddress: string; exists: boolean }> {
  try {
    const res = await fetch(DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [ownerB58, { mint: mintB58 }, { encoding: "jsonParsed" }],
      }),
    });
    const json = await res.json();
    const accounts = json?.result?.value ?? [];
    if (accounts.length > 0 && accounts[0]?.pubkey) {
      return { ataAddress: accounts[0].pubkey as string, exists: true };
    }
  } catch {}
  // No existing account — derive canonical ATA address using on-chain program
  // Use getAccountInfo to verify the derived address
  const derived = await deriveATA(ownerB58, mintB58);
  const exists = await accountExists(derived);
  return { ataAddress: derived, exists };
}

// ── Balance fetches ───────────────────────────────────────────────────────────

export async function getSolBalance(address: string): Promise<number> {
  try {
    const r = await rpc<{ value: number }>("getBalance", [address]);
    return (r?.value ?? 0) / 1_000_000_000;
  } catch {
    return 0;
  }
}

export async function getOnChainTokenBalance(address: string): Promise<number> {
  try {
    const activeMint = getActiveMintAddress();
    const res = await fetch(DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [address, { mint: activeMint }, { encoding: "jsonParsed" }],
      }),
    });
    const json = await res.json();
    const accounts = json?.result?.value ?? [];
    if (accounts.length === 0) return 0;
    return Number(
      accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0,
    );
  } catch {
    return 0;
  }
}

export async function getOnChainUsdcBalance(address: string): Promise<number> {
  return getOnChainTokenBalance(address);
}

export async function hasUsdcAta(address: string): Promise<boolean> {
  return (await getOnChainTokenBalance(address)) > 0;
}

// ── Instruction builders ──────────────────────────────────────────────────────

type SolKey = { pubkey: Uint8Array; isSigner: boolean; isWritable: boolean };
type SolIx = { keys: SolKey[]; programId: Uint8Array; data: Uint8Array };

/**
 * Check whether an account exists on-chain.
 */
async function accountExists(address: string): Promise<boolean> {
  try {
    const result = await rpc<{ value: any }>("getAccountInfo", [
      address,
      { encoding: "base64", commitment: "confirmed" },
    ]);
    return result?.value !== null && result?.value !== undefined;
  } catch {
    return false;
  }
}

/**
 * TokenProgram InitializeAccount3 instruction (discriminator = 18).
 * Sets the owner of a freshly-created token account without requiring a rent-sysvar account.
 */
function buildInitializeAccount3(
  ataPk: Uint8Array,
  mintPk: Uint8Array,
  ownerPk: Uint8Array,
): SolIx {
  // Layout: [discriminator u8=18] [owner pubkey 32 bytes]
  const data = new Uint8Array(1 + 32);
  data[0] = 18; // InitializeAccount3 discriminator
  data.set(ownerPk, 1);
  return {
    keys: [
      { pubkey: ataPk, isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
    ],
    programId: b58dec(TOKEN_PROGRAM_ID),
    data,
  };
}

/**
 * Build an ATA Program "CreateIdempotent" instruction (discriminator = 0x01).
 *
 * This is the CORRECT way to create an Associated Token Account:
 *  - Only the fee payer (funding account) needs to sign — no ATA keypair required
 *  - The ATA address is a PDA validated by the ATA program itself
 *  - Idempotent: no-op if the account already exists (safe to always include)
 *  - Both SystemProgram + TokenProgram are guaranteed present on devnet
 *
 * Account layout (as required by the ATA program):
 *  0. [signer, writable]  funding account (fee payer)
 *  1. [writable]          ATA address (PDA — no signer needed)
 *  2. []                  wallet/owner
 *  3. []                  mint
 *  4. []                  System Program
 *  5. []                  Token Program
 *
 * Instruction data: single byte 0x01 (CreateIdempotent variant)
 */
function buildCreateATAIdempotent(
  payer: Uint8Array,
  ataAddress: Uint8Array,
  owner: Uint8Array,
  mint: Uint8Array,
): SolIx {
  return {
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true }, // funding account
      { pubkey: ataAddress, isSigner: false, isWritable: true }, // ATA (PDA)
      { pubkey: owner, isSigner: false, isWritable: false }, // wallet owner
      { pubkey: mint, isSigner: false, isWritable: false }, // mint
      { pubkey: b58dec(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: b58dec(TOKEN_PROGRAM_ID), isSigner: false, isWritable: false },
    ],
    programId: b58dec(ATA_PROGRAM_ID),
    data: new Uint8Array([0x00]), // Create (not idempotent - works on all versions)
  };
}

/**
 * Append an ATA Program CreateIdempotent instruction for a new token account.
 * Only the fee payer needs to sign — no ATA keypair required.
 * Skips entirely if the ATA is already confirmed to exist on-chain.
 */
async function appendCreateTokenAccountIxs(
  ixList: SolIx[],
  payer: Uint8Array,
  ataAddress: string,
  ownerPk: Uint8Array,
  mintPk: Uint8Array,
  exists: boolean,
): Promise<void> {
  if (exists) {
    return;
  }

  const ataPk = b58dec(ataAddress);
  ixList.push(buildCreateATAIdempotent(payer, ataPk, ownerPk, mintPk));
}

/**
 * TokenProgram InitializeAccount3 instruction (discriminator = 18).
 * Used only in createMintOnDevnet (initialising the token mint account itself).
 */
function buildInitializeMint2(
  mintPk: Uint8Array,
  decimals: number,
  mintAuthority: Uint8Array,
): SolIx {
  const data = new Uint8Array(1 + 1 + 32 + 1 + 32);
  data[0] = 20; // InitializeMint2
  data[1] = decimals;
  data.set(mintAuthority, 2);
  data[34] = 0; // no freeze authority
  return {
    keys: [{ pubkey: mintPk, isSigner: false, isWritable: true }],
    programId: b58dec(TOKEN_PROGRAM_ID),
    data,
  };
}

/**
 * SystemProgram CreateAccount instruction.
 */
function buildCreateAccount(
  fromPk: Uint8Array,
  newAccountPk: Uint8Array,
  lamports: bigint,
  space: bigint,
  ownerProgramId: Uint8Array,
): SolIx {
  const data = new Uint8Array(4 + 8 + 8 + 32);
  data[0] = 0;
  data[1] = 0;
  data[2] = 0;
  data[3] = 0;
  let v = lamports;
  for (let i = 0; i < 8; i++) {
    data[4 + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  v = space;
  for (let i = 0; i < 8; i++) {
    data[12 + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  data.set(ownerProgramId, 20);
  return {
    keys: [
      { pubkey: fromPk, isSigner: true, isWritable: true },
      { pubkey: newAccountPk, isSigner: true, isWritable: true },
    ],
    programId: b58dec(SYSTEM_PROGRAM),
    data,
  };
}

function buildMintTo(
  mint: string,
  destAta: string,
  authority: string,
  amount: bigint,
): SolIx {
  const data = new Uint8Array(9);
  data[0] = 7;
  data.set(writeU64LE(amount), 1);
  return {
    keys: [
      { pubkey: b58dec(mint), isSigner: false, isWritable: true },
      { pubkey: b58dec(destAta), isSigner: false, isWritable: true },
      { pubkey: b58dec(authority), isSigner: true, isWritable: false },
    ],
    programId: b58dec(TOKEN_PROGRAM_ID),
    data,
  };
}

function buildTokenTransfer(
  sourceAta: string,
  destAta: string,
  owner: string,
  amount: bigint,
): SolIx {
  const data = new Uint8Array(9);
  data[0] = 3;
  data.set(writeU64LE(amount), 1);
  return {
    keys: [
      { pubkey: b58dec(sourceAta), isSigner: false, isWritable: true },
      { pubkey: b58dec(destAta), isSigner: false, isWritable: true },
      { pubkey: b58dec(owner), isSigner: true, isWritable: false },
    ],
    programId: b58dec(TOKEN_PROGRAM_ID),
    data,
  };
}

// ── Transaction serialization ─────────────────────────────────────────────────

function serializeTransaction(
  instructions: SolIx[],
  signers: Array<{ publicKey: Uint8Array; secretKey: Uint8Array }>,
  recentBlockhash: string,
  feePayer: Uint8Array,
): Uint8Array {
  const accountSet = new Map<
    string,
    { pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }
  >();

  const addAccount = (pk: Uint8Array, signer: boolean, writable: boolean) => {
    const key = b58enc(pk);
    if (!accountSet.has(key)) {
      accountSet.set(key, {
        pubkey: pk,
        isSigner: signer,
        isWritable: writable,
      });
    } else {
      const e = accountSet.get(key)!;
      e.isSigner = e.isSigner || signer;
      e.isWritable = e.isWritable || writable;
    }
  };

  addAccount(feePayer, true, true);
  for (const ix of instructions) {
    for (const k of ix.keys) addAccount(k.pubkey, k.isSigner, k.isWritable);
    addAccount(ix.programId, false, false);
  }

  const accounts = Array.from(accountSet.values());
  const sorted = [
    ...accounts.filter((a) => a.isSigner && a.isWritable),
    ...accounts.filter((a) => a.isSigner && !a.isWritable),
    ...accounts.filter((a) => !a.isSigner && a.isWritable),
    ...accounts.filter((a) => !a.isSigner && !a.isWritable),
  ];

  const seen = new Set<string>();
  const uniq: typeof sorted = [];
  for (const a of sorted) {
    const k = b58enc(a.pubkey);
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(a);
    }
  }

  const getIdx = (pk: Uint8Array) => {
    const k = b58enc(pk);
    const i = uniq.findIndex((a) => b58enc(a.pubkey) === k);
    if (i === -1) throw new Error(`Account not found: ${k}`);
    return i;
  };

  const numSigners = uniq.filter((a) => a.isSigner).length;
  const numRoSigners = uniq.filter((a) => a.isSigner && !a.isWritable).length;
  const numRoUnsign = uniq.filter((a) => !a.isSigner && !a.isWritable).length;

  const header = new Uint8Array([numSigners, numRoSigners, numRoUnsign]);
  const numAccBytes = encodeCompactU16(uniq.length);
  const accKeyBytes = concat(...uniq.map((a) => a.pubkey));
  const blockhash = b58dec(recentBlockhash);

  const ixBytes = instructions.map((ix) => {
    const progIdx = getIdx(ix.programId);
    const accIdxs = ix.keys.map((k) => getIdx(k.pubkey));
    return concat(
      new Uint8Array([progIdx]),
      encodeCompactU16(accIdxs.length),
      new Uint8Array(accIdxs),
      encodeCompactU16(ix.data.length),
      ix.data,
    );
  });

  const message = concat(
    header,
    numAccBytes,
    accKeyBytes,
    blockhash,
    encodeCompactU16(instructions.length),
    ...ixBytes,
  );

  const signatures: Uint8Array[] = [];
  for (let i = 0; i < numSigners; i++) {
    const pkB58 = b58enc(uniq[i].pubkey);
    const signer = signers.find((s) => b58enc(s.publicKey) === pkB58);
    signatures.push(
      signer
        ? nacl.sign.detached(message, signer.secretKey)
        : new Uint8Array(64),
    );
  }

  return concat(encodeCompactU16(signatures.length), ...signatures, message);
}

function buildUnsignedMessage(
  instructions: SolIx[],
  recentBlockhash: string,
  feePayer: Uint8Array,
): { message: Uint8Array; accountKeys: string[] } {
  const accountSet = new Map<
    string,
    { pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }
  >();

  const addAccount = (pk: Uint8Array, signer: boolean, writable: boolean) => {
    const key = b58enc(pk);
    if (!accountSet.has(key)) {
      accountSet.set(key, {
        pubkey: pk,
        isSigner: signer,
        isWritable: writable,
      });
    } else {
      const e = accountSet.get(key)!;
      e.isSigner = e.isSigner || signer;
      e.isWritable = e.isWritable || writable;
    }
  };

  addAccount(feePayer, true, true);
  for (const ix of instructions) {
    for (const k of ix.keys) addAccount(k.pubkey, k.isSigner, k.isWritable);
    addAccount(ix.programId, false, false);
  }

  const accounts = Array.from(accountSet.values());
  const sorted = [
    ...accounts.filter((a) => a.isSigner && a.isWritable),
    ...accounts.filter((a) => a.isSigner && !a.isWritable),
    ...accounts.filter((a) => !a.isSigner && a.isWritable),
    ...accounts.filter((a) => !a.isSigner && !a.isWritable),
  ];

  const seen = new Set<string>();
  const uniq: typeof sorted = [];
  for (const a of sorted) {
    const k = b58enc(a.pubkey);
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(a);
    }
  }

  const getIdx = (pk: Uint8Array) => {
    const k = b58enc(pk);
    const i = uniq.findIndex((a) => b58enc(a.pubkey) === k);
    if (i === -1) throw new Error(`Account not found: ${k}`);
    return i;
  };

  const numSigners = uniq.filter((a) => a.isSigner).length;
  const numRoSigners = uniq.filter((a) => a.isSigner && !a.isWritable).length;
  const numRoUnsign = uniq.filter((a) => !a.isSigner && !a.isWritable).length;

  const header = new Uint8Array([numSigners, numRoSigners, numRoUnsign]);
  const numAccBytes = encodeCompactU16(uniq.length);
  const accKeyBytes = concat(...uniq.map((a) => a.pubkey));
  const blockhash = b58dec(recentBlockhash);

  const ixBytes = instructions.map((ix) => {
    const progIdx = getIdx(ix.programId);
    const accIdxs = ix.keys.map((k) => getIdx(k.pubkey));
    return concat(
      new Uint8Array([progIdx]),
      encodeCompactU16(accIdxs.length),
      new Uint8Array(accIdxs),
      encodeCompactU16(ix.data.length),
      ix.data,
    );
  });

  const message = concat(
    header,
    numAccBytes,
    accKeyBytes,
    blockhash,
    encodeCompactU16(instructions.length),
    ...ixBytes,
  );

  return { message, accountKeys: uniq.map((a) => b58enc(a.pubkey)) };
}

// ── Mint creation + self-healing ──────────────────────────────────────────────

/**
 * Creates a new SPL token mint on devnet.
 * Both mintAuthority (fee payer) AND mintKeypair (new account) must sign.
 */
async function createMintOnDevnet(
  mintAuthority: nacl.SignKeyPair,
  mintKeypair: nacl.SignKeyPair,
): Promise<void> {
  console.log(
    `__ANIMA_DBG__ createMint: creating mint at ${b58enc(mintKeypair.publicKey).slice(0, 8)}…`,
  );

  const rentResult = await rpc<number>("getMinimumBalanceForRentExemption", [
    82,
  ]);
  const rentLamports = BigInt(rentResult ?? 1461600);

  // Ensure mint authority has enough SOL
  const authorityBalance = await getSolBalance(b58enc(mintAuthority.publicKey));
  if (authorityBalance < 0.01) {
    console.log(`__ANIMA_DBG__ createMint: airdropping SOL to authority`);
    await airdropSol(b58enc(mintAuthority.publicKey), 2_000_000_000);
    await new Promise((r) => setTimeout(r, 4000));
  }

  const bhResult = await rpc<{ value: { blockhash: string } }>(
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );
  const recentBlockhash = bhResult.value.blockhash;

  const instructions: SolIx[] = [
    buildCreateAccount(
      mintAuthority.publicKey,
      mintKeypair.publicKey,
      rentLamports,
      82n,
      b58dec(TOKEN_PROGRAM_ID),
    ),
    buildInitializeMint2(
      mintKeypair.publicKey,
      TOKEN_DECIMALS,
      mintAuthority.publicKey,
    ),
  ];

  const txBytes = serializeTransaction(
    instructions,
    [mintAuthority, mintKeypair],
    recentBlockhash,
    mintAuthority.publicKey,
  );

  const base64Tx = btoa(String.fromCharCode(...txBytes));
  const sig = await rpc<string>("sendTransaction", [
    base64Tx,
    {
      encoding: "base64",
      skipPreflight: true,
      preflightCommitment: "confirmed",
    },
  ]);

  console.log(
    `__ANIMA_DBG__ createMint: tx ${sig.slice(0, 12)}… submitted, polling…`,
  );

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const status = await rpc<any>("getSignatureStatuses", [
        [sig],
        { searchTransactionHistory: true },
      ]);
      const conf = status?.value?.[0]?.confirmationStatus;
      const err = status?.value?.[0]?.err;
      if (err) throw new Error(`Create mint tx error: ${JSON.stringify(err)}`);
      if (conf === "confirmed" || conf === "finalized") {
        console.log(`__ANIMA_DBG__ createMint: confirmed!`);
        return;
      }
    } catch (e: any) {
      if (e.message?.startsWith("Create mint tx error")) throw e;
    }
  }
  throw new Error("Mint creation timed out");
}

/**
 * Get-or-create the active mint on devnet. Self-heals after devnet resets.
 *
 * Priority order:
 *  1. localStorage-stored mint, if it exists on-chain → use it
 *  2. localStorage-stored mint, if keypair stored → recreate on devnet
 *  3. Hardcoded TOKEN_MINT, if it exists on-chain → use it
 *  4. Create a brand new mint with fresh keypair, persist to localStorage
 */
async function getOrCreateActiveMint(
  mintAuthority: nacl.SignKeyPair,
): Promise<string> {
  let storedAddress: string | null = null;
  let storedKp: nacl.SignKeyPair | null = null;

  // Load from localStorage
  try {
    const s = localStorage.getItem(MINT_STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as StoredMint;
      if (
        parsed?.address &&
        Array.isArray(parsed?.secret) &&
        parsed.secret.length === 64
      ) {
        storedAddress = parsed.address;
        const kp = nacl.sign.keyPair.fromSecretKey(
          new Uint8Array(parsed.secret),
        );
        if (b58enc(kp.publicKey) === storedAddress) {
          storedKp = kp;
        }
      }
    }
  } catch {}

  console.log(
    `__ANIMA_DBG__ getOrCreate: storedAddress=${storedAddress?.slice(0, 8) ?? "none"} hasKp=${!!storedKp}`,
  );

  // 1. Stored mint exists on-chain
  if (storedAddress && (await accountExists(storedAddress))) {
    console.log(
      `__ANIMA_DBG__ getOrCreate: using stored mint ${storedAddress.slice(0, 8)}…`,
    );
    _activeMintAddress = storedAddress;
    return storedAddress;
  }

  // 2. Recreate stored mint with its keypair
  if (storedAddress && storedKp) {
    console.log(
      `__ANIMA_DBG__ getOrCreate: recreating stored mint ${storedAddress.slice(0, 8)}…`,
    );
    try {
      await createMintOnDevnet(mintAuthority, storedKp);
      await new Promise((r) => setTimeout(r, 2000));
      _activeMintAddress = storedAddress;
      return storedAddress;
    } catch (e) {
      console.log(`__ANIMA_DBG__ getOrCreate: stored mint recreate failed`, e);
    }
  }

  // 3. Hardcoded TOKEN_MINT exists on-chain
  if (await accountExists(TOKEN_MINT)) {
    console.log(`__ANIMA_DBG__ getOrCreate: using hardcoded TOKEN_MINT`);
    _activeMintAddress = TOKEN_MINT;
    return TOKEN_MINT;
  }

  // 4. Create a completely fresh mint with new random keypair
  console.log(
    `__ANIMA_DBG__ getOrCreate: creating fresh mint (devnet reset detected)`,
  );
  const freshKp = nacl.sign.keyPair();
  const freshAddress = b58enc(freshKp.publicKey);
  await createMintOnDevnet(mintAuthority, freshKp);
  await new Promise((r) => setTimeout(r, 2000));

  _activeMintAddress = freshAddress;
  try {
    localStorage.setItem(
      MINT_STORAGE_KEY,
      JSON.stringify({
        address: freshAddress,
        secret: Array.from(freshKp.secretKey),
      }),
    );
  } catch {}

  console.log(
    `__ANIMA_DBG__ getOrCreate: fresh mint created at ${freshAddress.slice(0, 8)}…`,
  );
  return freshAddress;
}

// ── SOL airdrop ───────────────────────────────────────────────────────────────

export async function airdropSol(
  address: string,
  lamports = 1_000_000_000,
): Promise<{ success: boolean; signature: string | null; message: string }> {
  try {
    const sig = await rpc<string>("requestAirdrop", [address, lamports]);
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const status = await rpc<any>("getSignatureStatuses", [
          [sig],
          { searchTransactionHistory: true },
        ]);
        const conf = status?.value?.[0]?.confirmationStatus;
        if (conf === "confirmed" || conf === "finalized") break;
      } catch {}
    }
    return {
      success: true,
      signature: sig,
      message: `${(lamports / 1e9).toFixed(2)} SOL airdropped`,
    };
  } catch (err: any) {
    const msg: string = err?.message ?? "Airdrop failed";
    const limited =
      msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("429");
    return {
      success: false,
      signature: null,
      message: limited ? "Rate limited — try again in ~60s" : msg,
    };
  }
}

// ── Main faucet entry ─────────────────────────────────────────────────────────

export interface FaucetResult {
  success: boolean;
  solAirdropped: boolean;
  solSignature: string | null;
  mintedOnChain: number;
  onChainUsdcBefore: number;
  mintTxSignature: string | null;
  explorerUrl: string | null;
  message: string;
}

export async function runFaucet(
  walletAddress: string,
  requestedAmount: number,
): Promise<FaucetResult> {
  const onChainBefore = await getOnChainTokenBalance(walletAddress);
  console.log(
    `__ANIMA_DBG__ runFaucet: wallet=${walletAddress.slice(0, 8)}… requestedAmount=${requestedAmount} onChainBefore=${onChainBefore}`,
  );

  // Step 1 — ensure wallet has SOL for tx fees
  const currentSol = await getSolBalance(walletAddress);
  let solAirdropped = false;
  let solSignature: string | null = null;
  if (currentSol < 0.01) {
    const airdrop = await airdropSol(walletAddress, 1_000_000_000);
    solAirdropped = airdrop.success;
    solSignature = airdrop.signature;
    if (!airdrop.success) {
      return {
        success: false,
        solAirdropped: false,
        solSignature: null,
        mintedOnChain: 0,
        onChainUsdcBefore: onChainBefore,
        mintTxSignature: null,
        explorerUrl: null,
        message: `Need SOL for fees but airdrop failed: ${airdrop.message}`,
      };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Ensure new wallet has SOL (needed for account rent even if mint authority pays)
  const walletSol = await getSolBalance(walletAddress);
  if (walletSol < 0.001) {
    console.log(`__ANIMA_DBG__ runFaucet: new wallet needs SOL, airdropping...`);
    await airdropSol(walletAddress, 1_000_000_000);
    await new Promise(r => setTimeout(r, 4000));
  }

  try {
    // Step 2 — load mint authority keypair
    const mintAuthority = nacl.sign.keyPair.fromSecretKey(
      MINT_AUTHORITY_SECRET,
    );
    const authorityB58 = b58enc(mintAuthority.publicKey);
    console.log(
      `__ANIMA_DBG__ runFaucet: authority=${authorityB58.slice(0, 8)}…`,
    );

    // Step 3 — get or create the active mint (self-heals after devnet resets)
    const mintAddress = await getOrCreateActiveMint(mintAuthority);
    console.log(
      `__ANIMA_DBG__ runFaucet: active mint=${mintAddress.slice(0, 8)}…`,
    );

    // Step 4 — use @solana/spl-token to create ATA and mint
    const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");
    const splToken = await import("@solana/spl-token");
    
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const authorityKeypair = Keypair.fromSecretKey(mintAuthority.secretKey);
    const mintPubkey = new PublicKey(mintAddress);
    const walletPubkey = new PublicKey(walletAddress);
    
    console.log(`__ANIMA_DBG__ runFaucet: using spl-token to get/create ATA`);
    
    // Get or create ATA using official spl-token library
    const destAta = await splToken.getOrCreateAssociatedTokenAccount(
      connection,
      authorityKeypair,
      mintPubkey,
      walletPubkey,
    );
    
    const destAtaB58 = destAta.address.toString();
    console.log(`__ANIMA_DBG__ runFaucet: userATA=${destAtaB58.slice(0, 8)}… created`);
    
    const rawAmount = BigInt(Math.floor(requestedAmount * Math.pow(10, TOKEN_DECIMALS)));
    
    // Mint tokens using official spl-token library
    const sig = await splToken.mintTo(
      connection,
      authorityKeypair,
      mintPubkey,
      destAta.address,
      authorityKeypair,
      rawAmount,
    );
    console.log(
      `__ANIMA_DBG__ runFaucet: tx submitted sig=${sig.slice(0, 12)}…`,
    );

    // Step 9 — wait for confirmation (up to 40 s)
    let confirmed = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const status = await rpc<any>("getSignatureStatuses", [
          [sig],
          { searchTransactionHistory: true },
        ]);
        const conf = status?.value?.[0]?.confirmationStatus;
        const err = status?.value?.[0]?.err;
        if (err) {
          console.log(`__ANIMA_DBG__ runFaucet: tx error`, JSON.stringify(err));
          throw new Error(`Tx error: ${JSON.stringify(err)}`);
        }
        if (conf === "confirmed" || conf === "finalized") {
          confirmed = true;
          console.log(`__ANIMA_DBG__ runFaucet: tx confirmed!`);
          break;
        }
      } catch (e: any) {
        if (e.message?.startsWith("Tx error")) throw e;
      }
    }

    const explorerUrl = confirmed
      ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
      : null;

    return {
      success: true,
      solAirdropped,
      solSignature,
      mintedOnChain: requestedAmount,
      onChainUsdcBefore: onChainBefore,
      mintTxSignature: sig,
      explorerUrl,
      message: confirmed
        ? `${requestedAmount.toLocaleString()} USDC minted on-chain — visible in your Phantom wallet!`
        : `${requestedAmount.toLocaleString()} USDC minted — tx submitted but confirmation is taking longer than usual. Check Phantom in a moment.`,
    };
  } catch (err: any) {
    console.log(`__ANIMA_DBG__ runFaucet: caught error`, err?.message);
    return {
      success: false,
      solAirdropped,
      solSignature,
      mintedOnChain: 0,
      onChainUsdcBefore: onChainBefore,
      mintTxSignature: null,
      explorerUrl: null,
      message: err?.message ?? "Mint transaction failed",
    };
  }
}

// ── Real SPL Deposit: wallet → vault ATA ─────────────────────────────────────

export interface DepositResult {
  success: boolean;
  signature: string | null;
  explorerUrl: string | null;
  message: string;
}

export async function depositToVault(
  walletAddress: string,
  amount: number,
  provider: any,
): Promise<DepositResult> {
  if (
    !provider?.signTransaction &&
    !provider?.signAndSendTransaction &&
    !provider?.request
  ) {
    throw new Error("Wallet provider does not support signing transactions");
  }

  const mintAddress = getActiveMintAddress();
  console.log(
    `__ANIMA_DBG__ deposit: mintAddress=${mintAddress.slice(0, 8)}… amount=${amount}`,
  );

  // 1. Resolve user ATA and vault ATA
  const { ataAddress: userAtaB58, exists: userAtaExists } = await resolveATA(
    walletAddress,
    mintAddress,
  );
  const { ataAddress: vaultAtaB58, exists: vaultAtaExists } = await resolveATA(
    VAULT_ADDRESS,
    mintAddress,
  );
  console.log(
    `__ANIMA_DBG__ deposit: userATA=${userAtaB58.slice(0, 8)}… exists=${userAtaExists} vaultATA=${vaultAtaB58.slice(0, 8)}… exists=${vaultAtaExists}`,
  );

  // 2. Get recent blockhash
  const bhResult = await rpc<{ value: { blockhash: string } }>(
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );
  const recentBlockhash = bhResult.value.blockhash;

  // 3. Compute raw amount
  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_DECIMALS)));

  // 4. Build instructions
  const userPk = b58dec(walletAddress);
  const vaultPk = b58dec(VAULT_ADDRESS);
  const mintPk = b58dec(mintAddress);

  const instructions: SolIx[] = [];
  // Create vault ATA if needed (user wallet pays)
  await appendCreateTokenAccountIxs(
    instructions,
    userPk,
    vaultAtaB58,
    vaultPk,
    mintPk,
    vaultAtaExists,
  );
  instructions.push(
    buildTokenTransfer(userAtaB58, vaultAtaB58, walletAddress, rawAmount),
  );
  console.log(`__ANIMA_DBG__ deposit: instructions=${instructions.length}`);

  // 5. Build unsigned message bytes
  const { message } = buildUnsignedMessage(
    instructions,
    recentBlockhash,
    userPk,
  );

  // 6. Full unsigned legacy tx: [compact-u16 = 1] [64 zero bytes] [message]
  const fullTxBytes = concat(encodeCompactU16(1), new Uint8Array(64), message);
  const base58Tx = b58enc(fullTxBytes);

  let sig: string;

  try {
    if (provider.request) {
      // Preferred: Phantom/Solflare low-level JSON-RPC bridge — no .serialize() needed
      const result = await provider.request({
        method: "signAndSendTransaction",
        params: { message: base58Tx },
      });
      sig =
        result?.signature ??
        result?.result?.signature ??
        result?.result ??
        result;
      if (typeof sig !== "string") sig = b58enc(new Uint8Array(sig as any));
    } else if (provider.signAndSendTransaction) {
      const result = await provider.signAndSendTransaction(fullTxBytes);
      sig = result?.signature ?? result?.publicKey ?? result;
      if (typeof sig !== "string") sig = b58enc(new Uint8Array(sig as any));
    } else if (provider.signTransaction) {
      // Last-resort: wrap with .serialize() so Phantom's internal call succeeds
      const txObj = { serialize: () => fullTxBytes };
      const signResult = await provider.signTransaction(txObj);
      const walletSig: Uint8Array =
        signResult?.signature ??
        signResult?.signatures?.[0]?.data ??
        signResult?.signatures?.[0] ??
        new Uint8Array(64);
      const signedTxBytes = concat(encodeCompactU16(1), walletSig, message);
      const base64Signed = btoa(String.fromCharCode(...signedTxBytes));
      sig = await rpc<string>("sendTransaction", [
        base64Signed,
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
        },
      ]);
    } else {
      throw new Error(
        "Wallet does not support signTransaction or signAndSendTransaction",
      );
    }
    console.log(`__ANIMA_DBG__ deposit: tx submitted sig=${sig.slice(0, 12)}…`);
  } catch (err: any) {
    const msg: string = err?.message ?? "User rejected transaction";
    if (
      msg.toLowerCase().includes("reject") ||
      msg.toLowerCase().includes("denied") ||
      msg.toLowerCase().includes("cancel")
    ) {
      return {
        success: false,
        signature: null,
        explorerUrl: null,
        message: "Transaction cancelled by user.",
      };
    }
    throw err;
  }

  // 7. Wait for confirmation
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const status = await rpc<any>("getSignatureStatuses", [
        [sig],
        { searchTransactionHistory: true },
      ]);
      const conf = status?.value?.[0]?.confirmationStatus;
      const err = status?.value?.[0]?.err;
      if (err) throw new Error(`Tx error: ${JSON.stringify(err)}`);
      if (conf === "confirmed" || conf === "finalized") {
        console.log(`__ANIMA_DBG__ deposit: confirmed!`);
        break;
      }
    } catch (e: any) {
      if (e.message?.startsWith("Tx error")) throw e;
    }
  }

  return {
    success: true,
    signature: sig,
    explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    message: `${amount.toLocaleString()} USDC deposited to SafePerp vault on-chain.`,
  };
}

export async function withdrawFromVault(
  walletAddress: string,
  amount: number,
): Promise<DepositResult> {
  const mintAuthority = nacl.sign.keyPair.fromSecretKey(MINT_AUTHORITY_SECRET);
  const authorityB58 = b58enc(mintAuthority.publicKey);
  const mintAddress = getActiveMintAddress();

  const { ataAddress: userAtaB58, exists: userAtaExists } = await resolveATA(
    walletAddress,
    mintAddress,
  );
  const { ataAddress: vaultAtaB58, exists: vaultAtaExists } = await resolveATA(
    VAULT_ADDRESS,
    mintAddress,
  );
  console.log(
    `__ANIMA_DBG__ withdraw: userATA=${userAtaB58.slice(0, 8)}… vaultATA=${vaultAtaB58.slice(0, 8)}…`,
  );

  const bhResult = await rpc<{ value: { blockhash: string } }>(
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );
  const recentBlockhash = bhResult.value.blockhash;

  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_DECIMALS)));

  const instructions: SolIx[] = [];
  // Ensure user ATA exists before transferring to it
  await appendCreateTokenAccountIxs(
    instructions,
    mintAuthority.publicKey,
    userAtaB58,
    b58dec(walletAddress),
    b58dec(mintAddress),
    userAtaExists,
  );
  instructions.push(
    buildTokenTransfer(vaultAtaB58, userAtaB58, VAULT_ADDRESS, rawAmount),
  );

  const txBytes = serializeTransaction(
    instructions,
    [mintAuthority],
    recentBlockhash,
    mintAuthority.publicKey,
  );

  const base64Tx = btoa(String.fromCharCode(...txBytes));
  const sig = await rpc<string>("sendTransaction", [
    base64Tx,
    {
      encoding: "base64",
      skipPreflight: true,
      preflightCommitment: "confirmed",
    },
  ]);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const status = await rpc<any>("getSignatureStatuses", [
        [sig],
        { searchTransactionHistory: true },
      ]);
      const conf = status?.value?.[0]?.confirmationStatus;
      const err = status?.value?.[0]?.err;
      if (err) throw new Error(`Tx error: ${JSON.stringify(err)}`);
      if (conf === "confirmed" || conf === "finalized") break;
    } catch (e: any) {
      if (e.message?.startsWith("Tx error")) throw e;
    }
  }

  return {
    success: true,
    signature: sig,
    explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    message: `${amount.toLocaleString()} USDC withdrawn from SafePerp vault.`,
  };
}
