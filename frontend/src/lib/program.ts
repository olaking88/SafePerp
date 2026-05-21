import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import idl from "./arcium_perp.json";
import { PROGRAM_ID, DEVNET_RPC, USER_ACCOUNT_SEED, POSITION_SEED } from "./constants";

export const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
export const CONNECTION = new Connection(DEVNET_RPC, "confirmed");

export function getProgram(walletProvider: any) {
  const publicKey = walletProvider.publicKey as PublicKey;

  // Build a proper Anchor-compatible wallet from raw Phantom/Solflare provider
  const wallet: anchor.Wallet = {
    publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      // Phantom expects a Transaction object with a serialize method
      if (tx instanceof VersionedTransaction) {
        return walletProvider.signTransaction(tx);
      }
      // For legacy transactions, Phantom needs the full Transaction object
      const signed = await walletProvider.signTransaction(tx);
      return signed as T;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      if (walletProvider.signAllTransactions) {
        return walletProvider.signAllTransactions(txs);
      }
      return Promise.all(txs.map(tx => wallet.signTransaction(tx)));
    },
    payer: anchor.web3.Keypair.generate(), // dummy, never used
  } as any;

  const provider = new anchor.AnchorProvider(CONNECTION, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: true,
  });
  anchor.setProvider(provider);
  return new anchor.Program(idl as any, provider);
}

export function getUserAccountPDA(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(USER_ACCOUNT_SEED), owner.toBuffer()],
    PROGRAM_PUBKEY,
  );
  return pda;
}

export function getPositionPDA(owner: PublicKey, index: number): PublicKey {
  const idxBuf = Buffer.alloc(8);
  idxBuf.writeBigUInt64LE(BigInt(index));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POSITION_SEED), owner.toBuffer(), idxBuf],
    PROGRAM_PUBKEY,
  );
  return pda;
}

export async function ensureUserAccount(program: any, owner: PublicKey): Promise<void> {
  const pda = getUserAccountPDA(owner);
  try {
    await program.account.userAccount.fetch(pda);
  } catch {
    console.log("[program] Creating UserAccount...");
    await program.methods.initializeUser().accounts({ owner }).rpc({ commitment: "confirmed" });
    console.log("[program] UserAccount created");
  }
}

export async function fetchUserAccount(program: any, owner: PublicKey): Promise<any | null> {
  try {
    const pda = getUserAccountPDA(owner);
    return await program.account.userAccount.fetch(pda);
  } catch {
    return null;
  }
}
