import * as anchor from "@coral-xyz/anchor";
import {
  getArciumEnv,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  awaitComputationFinalization,
} from "@arcium-hq/client";
import { deserializeLE, RescueCipher, x25519 } from "@arcium-hq/client";
import { randomBytes } from "crypto";
import type { Program } from "@coral-xyz/anchor";

export interface ArciumClient {
  env: ReturnType<typeof getArciumEnv>;
  privateKey: Uint8Array;
  publicKey:  Uint8Array;
  cipher: RescueCipher;
}

export interface ComputeLiquidationResult {
  encLiquidationPrice: number[];
  nonce: Uint8Array;
  liquidationPrice: bigint;
}

export interface ComputePnLResult {
  encPnl: number[];
  nonce: Uint8Array;
  pnl: bigint;
}

export async function buildArciumClient(
  provider: anchor.AnchorProvider,
  programId: anchor.web3.PublicKey,
): Promise<ArciumClient> {
  const env        = getArciumEnv();
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey  = x25519.getPublicKey(privateKey);
  const mxePub     = await getMXEPublicKey(provider, programId);
  const shared     = x25519.getSharedSecret(privateKey, mxePub);
  const cipher     = new RescueCipher(shared);
  return { env, privateKey, publicKey, cipher };
}

async function awaitProgramEvent<T>(
  program: Program<any>,
  eventName: string,
  timeoutMs = 300_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { program.removeEventListener(id); } catch {}
      reject(new Error(`Event ${eventName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    let id: number;
    const tryListen = () => {
      try {
        id = program.addEventListener(eventName, (event: T) => {
          clearTimeout(timer);
          try { program.removeEventListener(id); } catch {}
          resolve(event);
        });
      } catch (e) {
        setTimeout(tryListen, 2000);
      }
    };
    tryListen();
  });
}

function arciumQueueAccounts(
  env: ReturnType<typeof getArciumEnv>,
  programId: anchor.web3.PublicKey,
  computationOffset: anchor.BN,
  ixName: string,
) {
const [signPdaAccount] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("ArciumSignerAccount")],
  programId
);
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
    signPdaAccount,
    poolAccount:  getFeePoolAccAddress(),
    clockAccount: getClockAccAddress(),
  };
}

export async function initAllCompDefs(
  program: Program<any>,
  payer: anchor.web3.Keypair,
  env: ReturnType<typeof getArciumEnv>,
): Promise<void> {
  const programId  = program.programId;
  const mxeAccount = getMXEAccAddress(programId);

  const mxeAccountData = await (program.account as any).mxeAccount.fetch(mxeAccount);
  const lutOffsetSlot  = mxeAccountData.lutOffsetSlot as anchor.BN;
  const lutIndexBuffer = lutOffsetSlot.toArrayLike(Buffer, 'le', 8);
  const [addressLookupTable] = anchor.web3.PublicKey.findProgramAddressSync(
    [mxeAccount.toBuffer(), lutIndexBuffer],
    anchor.web3.AddressLookupTableProgram.programId
  );

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
      await (program.methods as any)[ixPair.method]()
        .accountsPartial({ payer: payer.publicKey, compDefAccount, mxeAccount, addressLookupTable })
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

export async function encryptPosition(
  program: Program<any>,
  provider: anchor.AnchorProvider,
  client: ArciumClient,
  positionPda: anchor.web3.PublicKey,
  positionIndex: bigint,
  collateral: bigint,
  entryPrice: bigint,
): Promise<{ computationOffset: anchor.BN; txSig: string }> {
  const nonce      = randomBytes(16);
  const nonceBN    = new anchor.BN(deserializeLE(nonce).toString());
  const ciphertext = client.cipher.encrypt([collateral, entryPrice], nonce);
  const computationOffset = new anchor.BN(randomBytes(8), "hex");

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
    .rpc({ commitment: "confirmed" });

  console.log(`[arcium] encryptPosition queued: ${txSig}`);
  return { computationOffset, txSig };
}

export async function computeLiquidation(
  program: Program<any>,
  provider: anchor.AnchorProvider,
  client: ArciumClient,
  positionPda: anchor.web3.PublicKey,
  entryPrice: bigint,
  leverage: number,
  side: number,
): Promise<ComputeLiquidationResult> {
  const nonce      = randomBytes(16);
  const nonceBN    = new anchor.BN(deserializeLE(nonce).toString());
  const ciphertext = client.cipher.encrypt([entryPrice, BigInt(leverage)], nonce);
  const computationOffset = new anchor.BN(randomBytes(8), "hex");

  const eventPromise = awaitProgramEvent<{
    position: anchor.web3.PublicKey;
    encLiquidationPrice: number[];
    nonce: number[];
  }>(program, "liquidationComputedEvent");

  await program.methods
    .arciumComputeLiquidation(
      computationOffset,
      Array.from(ciphertext[0]),
      Array.from(ciphertext[1]),
      side,
      Array.from(client.publicKey),
      nonceBN,
    )
    .accountsPartial({
      payer:    provider.wallet.publicKey,
      position: positionPda,
      ...arciumQueueAccounts(client.env, program.programId, computationOffset, "compute_liquidation"),
    })
    .rpc({ commitment: "confirmed" });
  await awaitComputationFinalization(provider, computationOffset, program.programId, "confirmed", 300_000);
  const event       = await eventPromise;
  const resultNonce = new Uint8Array(event.nonce);
  const decrypted   = client.cipher.decrypt([event.encLiquidationPrice], resultNonce);

  return {
    encLiquidationPrice: event.encLiquidationPrice,
    nonce:               resultNonce,
    liquidationPrice:    decrypted[0],
  };
}

export async function computePnL(
  program: Program<any>,
  provider: anchor.AnchorProvider,
  client: ArciumClient,
  positionPda: anchor.web3.PublicKey,
  encCollateral: number[],
  encEntryPrice: number[],
  exitPrice: bigint,
  leverage: number,
  side: number,
): Promise<ComputePnLResult> {
  const nonce   = randomBytes(16);
  const nonceBN = new anchor.BN(deserializeLE(nonce).toString());
  const computationOffset = new anchor.BN(randomBytes(8), "hex");

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
    .rpc({ commitment: "confirmed" });
  await awaitComputationFinalization(provider, computationOffset, program.programId, "confirmed", 300_000);
  const event       = await eventPromise;
  const resultNonce = new Uint8Array(event.nonce);
  const raw = client.cipher.decrypt([event.encPnl], resultNonce)[0];
  const pnl = BigInt.asIntN(64, raw);

  return { encPnl: event.encPnl, nonce: resultNonce, pnl };
}
