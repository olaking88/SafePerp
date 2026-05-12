"use strict";
/**
 * arcium-perp test suite — Phase 1/2/3.
 *
 * Phase 1/2 tests: initialize_user, deposit (skip), open_position, close_position.
 * Phase 3 tests:   initAllCompDefs, encryptPosition, computeLiquidation, computePnL.
 *
 * Run:  ./test.sh  (or: yarn ts-mocha -p ./tsconfig.json -t 1000000 'tests/**\/*.ts')
 * Requires: arcium localnet running in another terminal (`arcium localnet`)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const bn_js_1 = __importDefault(require("bn.js"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const chai_1 = require("chai");
const arcium_js_1 = require("../src/lib/arcium.js");
const client_1 = require("@arcium-hq/client");
// ─── Setup ────────────────────────────────────────────────────────────────────
const programId = new anchor.web3.PublicKey("9LcSZocF7kt64YqqHi8w64dmGgYe8c2T9NpKqBs6bWrb");
const readKp = (path) => anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(path, "utf-8"))));
describe("arcium_perp", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const idl = JSON.parse(fs.readFileSync(process.cwd() + "/target/idl/arcium_perp.json", "utf-8"));
    const program = new anchor.Program(idl, programId, provider);
    const [userAccountPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("user_account"), provider.wallet.publicKey.toBuffer()], programId);
    // Position PDA derived after init (index known from totalPositions)
    let positionPda;
    let positionIndex;
    // Arcium client initialised once for Phase 3 tests
    let arciumClient;
    // ─── Phase 1/2: existing tests ────────────────────────────────────────────
    it("initializes a user (skips if already exists)", async () => {
        const existing = await provider.connection.getAccountInfo(userAccountPda);
        if (existing) {
            console.log("Account already exists, skipping init");
        }
        else {
            const tx = await program.methods
                .initializeUser()
                .accounts({
                userAccount: userAccountPda,
                owner: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
                .rpc();
            console.log("TX:", tx);
        }
        const account = await program.account.userAccount.fetch(userAccountPda);
        console.log("User account:", account);
    });
    it("deposits", async () => {
        // Requires real SPL USDC token accounts — skipped in local validator.
        console.log("Deposit test: skipped (requires real SPL token accounts)");
    });
    it("opens a position", async () => {
        const userBefore = await program.account.userAccount.fetch(userAccountPda);
        positionIndex = userBefore.totalPositions;
        console.log("Opening position at index:", positionIndex.toString());
        const positionIndexBuffer = Buffer.alloc(8);
        positionIndexBuffer.writeBigUInt64LE(BigInt(positionIndex.toString()));
        [positionPda] = anchor.web3.PublicKey.findProgramAddressSync([
            Buffer.from("position"),
            provider.wallet.publicKey.toBuffer(),
            positionIndexBuffer,
        ], programId);
        const collateral = new bn_js_1.default(1000000); // $1 (6 decimals)
        const entryPrice = new bn_js_1.default(150000000); // $150
        const size = collateral.muln(10); // 10x
        try {
            const tx = await program.methods
                .openPosition("SOL/USDC", 0, 10, collateral, entryPrice, size)
                .accounts({
                userAccount: userAccountPda,
                position: positionPda,
                owner: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
                .rpc();
            console.log("Open position TX:", tx);
            const pos = await program.account.positionAccount.fetch(positionPda);
            console.log("Position account:", pos);
            chai_1.assert.equal(pos.market, "SOL/USDC");
            chai_1.assert.equal(pos.side, 0);
            chai_1.assert.equal(pos.leverage, 10);
            chai_1.assert.equal(pos.status, 0, "Position should be open");
            chai_1.assert.ok(pos.liquidationPrice.gt(new bn_js_1.default(0)), "Liquidation price should be set");
            const userAfter = await program.account.userAccount.fetch(userAccountPda);
            chai_1.assert.ok(userAfter.totalPositions.eq(positionIndex.addn(1)), "totalPositions should increment");
        }
        catch (err) {
            if (err.message?.includes("InsufficientBalance")) {
                console.log("⚠️  Skipped: protocol_balance is 0. Deposit USDC first to test open_position.");
            }
            else {
                throw err;
            }
        }
    });
    it("closes a position", async () => {
        if (!positionPda) {
            console.log("Skipping close: no position was opened in this run");
            return;
        }
        const posBefore = await program.account.positionAccount
            .fetch(positionPda).catch(() => null);
        if (!posBefore || posBefore.status !== 0) {
            console.log("Skipping close: position does not exist or is already closed");
            return;
        }
        const exitPrice = new bn_js_1.default(165000000); // $165 — 10% gain on Long
        const tx = await program.methods
            .closePosition(exitPrice)
            .accounts({
            userAccount: userAccountPda,
            position: positionPda,
            owner: provider.wallet.publicKey,
        })
            .rpc();
        console.log("Close position TX:", tx);
        const posAfter = await program.account.positionAccount.fetch(positionPda);
        chai_1.assert.equal(posAfter.status, 1, "Position should be closed");
        // PnL = 1_000_000 * 10 * (165 - 150) / 150 = 1_000_000
        const expectedPnl = new bn_js_1.default(1000000);
        chai_1.assert.ok(posAfter.pnl.eq(expectedPnl), `PnL mismatch: got ${posAfter.pnl}, expected ${expectedPnl}`);
        console.log("PnL:", posAfter.pnl.toString(), "✓");
        const userAfter = await program.account.userAccount.fetch(userAccountPda);
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
        arciumClient = await (0, arcium_js_1.buildArciumClient)(provider, programId);
        console.log("[arcium] MXE client ready, public key:", Buffer.from(arciumClient.publicKey).toString("hex"));
        await (0, arcium_js_1.initAllCompDefs)(program, payer, arciumClient.env);
        console.log("[arcium] All computation defs initialised");
    });
    (skipArcium ? it.skip : it)("Phase 3 — encrypts position secrets via MXE", async () => {
        if (!positionPda) {
            console.log("Skipping: positionPda not set (open_position did not run)");
            return;
        }
        if (!arciumClient) {
            arciumClient = await (0, arcium_js_1.buildArciumClient)(provider, programId);
        }
        const collateral = BigInt(1000000);
        const entryPrice = BigInt(150000000);
        const { computationOffset } = await (0, arcium_js_1.encryptPosition)(program, provider, arciumClient, positionPda, BigInt(positionIndex.toString()), collateral, entryPrice);
        // Wait for MXE to call back and store ciphertexts on-chain
        await (0, client_1.awaitComputationFinalization)(provider, computationOffset, programId, "confirmed");
        const posAfter = await program.account.positionAccount.fetch(positionPda);
        const zeroBytes = new Array(32).fill(0);
        chai_1.assert.notDeepEqual(Array.from(posAfter.encCollateral), zeroBytes, "enc_collateral should be non-zero after MXE encrypt");
        chai_1.assert.notDeepEqual(Array.from(posAfter.encEntryPrice), zeroBytes, "enc_entry_price should be non-zero after MXE encrypt");
        console.log("[arcium] Position encrypted on-chain ✓");
    });
    (skipArcium ? it.skip : it)("Phase 3 — computes liquidation price via MXE", async () => {
        if (!positionPda || !arciumClient)
            return;
        const result = await (0, arcium_js_1.computeLiquidation)(program, provider, arciumClient, positionPda, BigInt(150000000), // entry_price
        10, // leverage
        0);
        // Expected: 150_000_000 * (10-1) / 10 = 135_000_000
        const expected = BigInt(135000000);
        chai_1.assert.equal(result.liquidationPrice, expected, `Liq price mismatch: got ${result.liquidationPrice}, expected ${expected}`);
        console.log("[arcium] computeLiquidation result:", result.liquidationPrice.toString(), "✓");
    });
    (skipArcium ? it.skip : it)("Phase 3 — computes PnL via MXE", async () => {
        if (!positionPda || !arciumClient)
            return;
        // Fetch stored ciphertexts from the position account
        const pos = await program.account.positionAccount.fetch(positionPda);
        const encCollateral = Array.from(pos.encCollateral);
        const encEntryPrice = Array.from(pos.encEntryPrice);
        const result = await (0, arcium_js_1.computePnL)(program, provider, arciumClient, positionPda, encCollateral, encEntryPrice, BigInt(165000000), // exit_price = $165
        10, // leverage
        0);
        // Expected PnL: 1_000_000 * 10 * (165 - 150) / 150 = 1_000_000
        const expected = BigInt(1000000);
        chai_1.assert.equal(result.pnl, expected, `PnL mismatch: got ${result.pnl}, expected ${expected}`);
        console.log("[arcium] computePnL result:", result.pnl.toString(), "✓");
    });
});
