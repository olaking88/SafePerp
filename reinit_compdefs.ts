import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import { getCompDefAccAddress, getCompDefAccOffset } from "@arcium-hq/client";

const programId = new anchor.web3.PublicKey("CYY6JyBL9NzKmortP2rrePUiQG8ynmDCYakzzP6Yt3tY");
const mxeAccount = new anchor.web3.PublicKey("DU4ms1oiiawWK9e6H8m5CehYJztBmqp7Mq8y4nwS6ukg");
const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
const keypair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
);
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {});
const idl = JSON.parse(fs.readFileSync("target/idl/arcium_perp.json", "utf-8"));
const program = new anchor.Program(idl, provider);

async function main() {
  const mxeAccountData = await (program.account as any).mxeAccount.fetch(mxeAccount);
  const lutOffsetSlot = mxeAccountData.lutOffsetSlot as anchor.BN;
  const lutIndexBuffer = lutOffsetSlot.toArrayLike(Buffer, "le", 8);
  const [addressLookupTable] = anchor.web3.PublicKey.findProgramAddressSync(
    [mxeAccount.toBuffer(), lutIndexBuffer],
    anchor.web3.AddressLookupTableProgram.programId
  );
  for (const ixPair of [
    { method: "initEncryptPositionCompDef", name: "encrypt_position" },
    { method: "initComputeLiquidationCompDef", name: "compute_liquidation" },
    { method: "initComputePnlCompDef", name: "compute_pnl" },
  ]) {
    const compDefAccount = getCompDefAccAddress(
      programId,
      Buffer.from(getCompDefAccOffset(ixPair.name)).readUInt32LE(),
    );
    try {
      const tx = await (program.methods as any)[ixPair.method]()
        .accountsPartial({ payer: keypair.publicKey, compDefAccount, mxeAccount, addressLookupTable, arciumProgram: new (require('@coral-xyz/anchor').web3.PublicKey)('Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ') })
        .signers([keypair])
        .rpc({ commitment: "confirmed" });
      console.log("CompDef " + ixPair.name + " initialized: " + tx);
    } catch (e: any) {
      console.log("CompDef " + ixPair.name + " error: " + e.message);
    }
  }
}
main().catch(console.error);
