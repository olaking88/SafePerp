/**
 * arcium-perp test suite — Phase 1/2/3.
 *
 * Phase 1/2 tests: initialize_user, deposit (skip), open_position, close_position.
 * Phase 3 tests:   initAllCompDefs, encryptPosition, computeLiquidation, computePnL.
 *
 * Run:  ./test.sh  (or: yarn ts-mocha -p ./tsconfig.json -t 1000000 'tests/**\/*.ts')
 * Requires: arcium localnet running in another terminal (`arcium localnet`)
 */

import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import * as fs from "fs";
import * as os from "os";
import { assert } from "chai";
import {
  buildArciumClient,
  initAllCompDefs,
  encryptPosition,
  computeLiquidation,
  computePnL,
} from "../src/lib/arcium";
import { awaitComputationFinalization } from "@arcium-hq/client";

// ─── Setup ────────────────────────────────────────────────────────────────────

const programId = new anchor.web3.PublicKey(
  "7sm6PJZwQDanL3oK3bXVyvdk8MS3DjP34fTCy7MWfvYa"
);

const readKp = (path: string) =>
  anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(path, "utf-8")))
  );

describe("arcium_perp", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(process.cwd() + "/target/idl/arcium_perp.json", "utf-8")
  );
  const program = new anchor.Program(idl, provider);

  const [userAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), provider.wallet.publicKey.toBuffer()],
    programId
  );

  // Position PDA derived after init (index known from totalPositions)
  let positionPda: anchor.web3.PublicKey;
  let positionIndex: BN;

  // Arcium client initialised once for Phase 3 tests
  let arciumClient: Awaited<ReturnType<typeof buildArciumClient>>;

  // ─── Phase 1/2: existing tests ────────────────────────────────────────────

  it("initializes a user (skips if already exists)", async () => {
    const existing = await provider.connection.getAccountInfo(userAccountPda);

    if (existing) {
      console.log("Account already exists, skipping init");
    } else {
      const tx = await program.methods
        .initializeUser()
        .accounts({
          userAccount:   userAccountPda,
          owner:         provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("TX:", tx);
    }

    const account = await (program.account as any).userAccount.fetch(userAccountPda);
    console.log("User account:", account);
  });

  it("deposits", async () => {
    const USER_TOKEN_ACCOUNT = new anchor.web3.PublicKey("78NobwUrfCy9mz3ehJH4LUxnx9wgFDFxkbJEXBbapDMx");
    const VAULT_TOKEN_ACCOUNT = new anchor.web3.PublicKey("ERTt43t8fi9Akwz34pTREVznNrAUCbwjfaA7qsG7ZVMc");
    const amount = new BN(1_000_000); // $1 USDC
    const tx = await program.methods
      .deposit(amount)
      .accounts({
        userAccount: userAccountPda,
        userTokenAccount: USER_TOKEN_ACCOUNT,
        vaultTokenAccount: VAULT_TOKEN_ACCOUNT,
        owner: provider.wallet.publicKey,
        tokenProgram: new anchor.web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .rpc();
    console.log("Deposit TX:", tx);
    const ua = await (program.account as any).userAccount.fetch(userAccountPda);
    console.log("Protocol balance after deposit:", ua.protocolBalance.toString());
  });

  it("opens a position", async () => {
    const userBefore = await (program.account as any).userAccount.fetch(userAccountPda);
    positionIndex = userBefore.totalPositions as BN;
    console.log("Opening position at index:", positionIndex.toString());

    const positionIndexBuffer = Buffer.alloc(8);
    positionIndexBuffer.writeBigUInt64LE(BigInt(positionIndex.toString()));

    [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        provider.wallet.publicKey.toBuffer(),
        positionIndexBuffer,
      ],
      programId
    );

    const collateral = new BN(1_000_000);       // $1 (6 decimals)
    const entryPrice = new BN(150_000_000);     // $150
    const size       = collateral.muln(10);     // 10x

    try {
      const tx = await program.methods
        .openPosition("SOL/USDC", 0, 10, collateral, entryPrice, size)
        .accounts({
          userAccount:   userAccountPda,
          position:      positionPda,
          owner:         provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Open position TX:", tx);

      const pos = await (program.account as any).positionAccount.fetch(positionPda);
      console.log("Position account:", pos);

      assert.equal(pos.market, "SOL/USDC");
      assert.equal(pos.side, 0);
      assert.equal(pos.leverage, 10);
      assert.equal(pos.status, 0, "Position should be open");
      assert.ok(pos.liquidationPrice.gt(new BN(0)), "Liquidation price should be set");

      const userAfter = await (program.account as any).userAccount.fetch(userAccountPda);
      assert.ok(
        (userAfter.totalPositions as BN).eq(positionIndex.addn(1)),
        "totalPositions should increment"
      );
    } catch (err: any) {
      if (err.message?.includes("InsufficientBalance")) {
        console.log("⚠️  Skipped: protocol_balance is 0. Deposit USDC first to test open_position.");
      } else {
        throw err;
      }
    }
  });

  it("closes a position", async () => {
    if (!positionPda) {
      console.log("Skipping close: no position was opened in this run");
      return;
    }

    const posBefore = await (program.account as any).positionAccount
      .fetch(positionPda).catch(() => null);

    if (!posBefore || posBefore.status !== 0) {
      console.log("Skipping close: position does not exist or is already closed");
      return;
    }

    const exitPrice = new BN(165_000_000); // $165 — 10% gain on Long

    const tx = await program.methods
      .closePosition(exitPrice)
      .accounts({
        userAccount: userAccountPda,
        position:    positionPda,
        owner:       provider.wallet.publicKey,
      })
      .rpc();
    console.log("Close position TX:", tx);

    const posAfter = await (program.account as any).positionAccount.fetch(positionPda);
    assert.equal(posAfter.status, 1, "Position should be closed");

    // PnL = 1_000_000 * 10 * (165 - 150) / 150 = 1_000_000
    const expectedPnl = new BN(1_000_000);
    assert.ok(
      (posAfter.pnl as BN).eq(expectedPnl),
      `PnL mismatch: got ${posAfter.pnl}, expected ${expectedPnl}`
    );
    console.log("PnL:", posAfter.pnl.toString(), "✓");

    const userAfter = await (program.account as any).userAccount.fetch(userAccountPda);
    console.log("User balance after close:", userAfter.protocolBalance.toString());
  });

  // ─── Phase 3: Arcium MXE tests ────────────────────────────────────────────
  //
  // These tests require:
  //   1. `arcium localnet` running in a separate terminal
  //   2. The program deployed via `anchor deploy`
  //   3. Circuits compiled & deployed via `arcium deploy`
  //
  // They are grouped so CI can skip them with SKIP_ARCIUM=1 ./test.sh.

  const skipArcium = process.env.SKIP_ARCIUM === "1";

  (skipArcium ? it.skip : it)("Phase 3 — initialises Arcium computation defs", async () => {
    const payer = readKp(`${os.homedir()}/.config/solana/id.json`);

    arciumClient = await buildArciumClient(provider, programId);
    console.log("[arcium] MXE client ready, public key:", Buffer.from(arciumClient.publicKey).toString("hex"));

    await initAllCompDefs(program, payer, arciumClient.env);
    console.log("[arcium] All computation defs initialised");
  });

  (skipArcium ? it.skip : it)("Phase 3 — encrypts position secrets via MXE", async () => {
    if (!positionPda) {
      console.log("Skipping: positionPda not set (open_position did not run)");
      return;
    }
    if (!arciumClient) {
      arciumClient = await buildArciumClient(provider, programId);
    }

    const collateral = BigInt(1_000_000);
    const entryPrice = BigInt(150_000_000);

    const { computationOffset } = await encryptPosition(
      program,
      provider,
      arciumClient,
      positionPda,
      BigInt(positionIndex.toString()),
      collateral,
      entryPrice,
    );

    // Wait for MXE to call back and store ciphertexts on-chain
    await awaitComputationFinalization(provider, computationOffset, programId, "confirmed");

    const posAfter = await (program.account as any).positionAccount.fetch(positionPda);
    const zeroBytes = new Array(32).fill(0);

    assert.notDeepEqual(
      Array.from(posAfter.encCollateral),
      zeroBytes,
      "enc_collateral should be non-zero after MXE encrypt"
    );
    assert.notDeepEqual(
      Array.from(posAfter.encEntryPrice),
      zeroBytes,
      "enc_entry_price should be non-zero after MXE encrypt"
    );
    console.log("[arcium] Position encrypted on-chain ✓");
  });

  (skipArcium ? it.skip : it)("Phase 3 — computes liquidation price via MXE", async () => {
    if (!positionPda || !arciumClient) return;

    const result = await computeLiquidation(
      program,
      provider,
      arciumClient,
      positionPda,
      BigInt(150_000_000), // entry_price
      10,                  // leverage
      0,                   // Long
    );

    // Expected: 150_000_000 * (10-1) / 10 = 135_000_000
    const expected = BigInt(135_000_000);
    assert.equal(result.liquidationPrice, expected,
      `Liq price mismatch: got ${result.liquidationPrice}, expected ${expected}`);
    console.log("[arcium] computeLiquidation result:", result.liquidationPrice.toString(), "✓");
  });

  (skipArcium ? it.skip : it)("Phase 3 — computes PnL via MXE", async () => {
    if (!positionPda || !arciumClient) return;

    // Fetch stored ciphertexts from the position account
    const pos = await (program.account as any).positionAccount.fetch(positionPda);
    const encCollateral  = Array.from(pos.encCollateral  as Uint8Array) as number[];
    const encEntryPrice  = Array.from(pos.encEntryPrice  as Uint8Array) as number[];

    const result = await computePnL(
      program,
      provider,
      arciumClient,
      positionPda,
      encCollateral,
      encEntryPrice,
      BigInt(165_000_000), // exit_price = $165
      10,                  // leverage
      0,                   // Long
    );

    // Expected PnL: 1_000_000 * 10 * (165 - 150) / 150 = 1_000_000
    const expected = BigInt(1_000_000);
    assert.equal(result.pnl, expected,
      `PnL mismatch: got ${result.pnl}, expected ${expected}`);
    console.log("[arcium] computePnL result:", result.pnl.toString(), "✓");
  });
});
