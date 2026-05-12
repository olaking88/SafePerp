const anchor = require('@coral-xyz/anchor');
const { uploadCircuit, buildFinalizeCompDefTx, getCompDefAccOffset } = require('@arcium-hq/client');
const fs = require('fs');
const os = require('os');

const conn = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
const payer = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json')))
);
const MXE_PROGRAM_ID = new anchor.web3.PublicKey('76C52sp1b4MbXW6H64H3zDXqaHbGqfT915NVcUm6oZXn');
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: 'confirmed' });

async function main() {
  const circuits = [
    { name: 'encrypt_position', file: 'build/encrypt_position.arcis' },
    { name: 'compute_liquidation', file: 'build/compute_liquidation.arcis' },
    { name: 'compute_pnl', file: 'build/compute_pnl.arcis' },
  ];

  for (const circuit of circuits) {
    console.log(`\nUploading ${circuit.name}...`);
    const circuitData = fs.readFileSync(circuit.file);
    const compDefOffset = Buffer.from(getCompDefAccOffset(circuit.name)).readUInt32LE();
    
    try {
      await uploadCircuit(provider, circuit.name, MXE_PROGRAM_ID, circuitData);
      console.log(`✓ ${circuit.name} uploaded`);
      
      const tx = await buildFinalizeCompDefTx(provider, compDefOffset, MXE_PROGRAM_ID);
      const sig = await provider.sendAndConfirm(tx, [payer]);
      console.log(`✓ ${circuit.name} finalized: ${sig}`);
    } catch(e) {
      console.error(`Error with ${circuit.name}:`, e.message);
    }
  }
}

main().catch(console.error);
