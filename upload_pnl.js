const anchor = require('@coral-xyz/anchor');
const { uploadCircuit, buildFinalizeCompDefTx, getCompDefAccOffset } = require('@arcium-hq/client');
const fs = require('fs');
const os = require('os');

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const conn = new anchor.web3.Connection(RPC_URL, { commitment: 'confirmed' });
const payer = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json')))
);
const MXE_PROGRAM_ID = new anchor.web3.PublicKey('76C52sp1b4MbXW6H64H3zDXqaHbGqfT915NVcUm6oZXn');
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: 'confirmed' });

async function main() {
  const circuitData = fs.readFileSync('build/compute_pnl.arcis');
  const compDefOffset = Buffer.from(getCompDefAccOffset('compute_pnl')).readUInt32LE();
  
  console.log('Uploading compute_pnl...');
  await uploadCircuit(provider, 'compute_pnl', MXE_PROGRAM_ID, circuitData);
  console.log('✓ compute_pnl uploaded');
  
  const tx = await buildFinalizeCompDefTx(provider, compDefOffset, MXE_PROGRAM_ID);
  const sig = await provider.sendAndConfirm(tx, [payer]);
  console.log('✓ compute_pnl finalized:', sig);
}

main().catch(console.error);
