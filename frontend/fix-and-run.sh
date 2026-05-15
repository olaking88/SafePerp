#!/usr/bin/env bash
# ============================================================
# fix-and-run.sh
# Run this from ~/arcium-perp:  bash fix-and-run.sh
# ============================================================
set -e

echo ""
echo "========================================================"
echo "  STEP 1: Verify Rust is up to date (need 1.85+)"
echo "========================================================"
rustup update stable
rustc --version
cargo --version

echo ""
echo "========================================================"
echo "  STEP 2: Clear any stale Cargo lock / registry cache"
echo "========================================================"
# Remove cached bad zeroize version
rm -rf ~/.cargo/registry/src/*/toml_datetime-1.1.1+spec-1.1.0 2>/dev/null || true
# Remove old lock so Cargo re-resolves from scratch
rm -f anchor-program/Cargo.lock 2>/dev/null || true

echo ""
echo "========================================================"
echo "  STEP 3: Copy fixed Cargo files from anchor-program/"
echo "  into the ROOT programs/ directory that anchor uses"
echo "========================================================"

# Make sure root programs/arcium-perp exists
mkdir -p programs/arcium-perp/src

# Copy our fixed program Cargo.toml to ROOT location
cp anchor-program/programs/arcium-perp/Cargo.toml programs/arcium-perp/Cargo.toml

# Copy lib.rs too
cp anchor-program/programs/arcium-perp/src/lib.rs programs/arcium-perp/src/lib.rs

# Copy root workspace Cargo.toml patch (zeroize pin)
cat > Cargo.toml << 'CARGOEOF'
[workspace]
members = [
  "programs/arcium-perp",
  "encrypted-ixs",
]

[profile.release]
overflow-checks = true
lto = "thin"
strip = "symbols"

[profile.test]
overflow-checks = true

[patch.crates-io]
zeroize = { version = "=1.8.1" }
CARGOEOF

echo "  Done copying files."

echo ""
echo "========================================================"
echo "  STEP 4: Build the Anchor program (from project root)"
echo "========================================================"
anchor build

echo ""
echo "========================================================"
echo "  STEP 5: Instructions for next steps"
echo "========================================================"
echo ""
echo "  Build succeeded! Now open TWO terminals:"
echo ""
echo "  TERMINAL 1:"
echo "    arcium localnet"
echo ""
echo "  TERMINAL 2 (wait for localnet to be ready, then run):"
echo "    anchor deploy --provider.cluster localnet"
echo "    arcium deploy \\"
echo "      --keypair-path ~/.config/solana/id.json \\"
echo "      --cluster-offset 0 \\"
echo "      --recovery-set-size 1 \\"
echo "      --cluster-url http://127.0.0.1:8899"
echo ""
echo "  Then run tests:"
echo "    ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \\"
echo "    ANCHOR_WALLET=~/.config/solana/id.json \\"
echo "    anchor test --skip-local-validator"
echo ""
echo "========================================================"
echo "  ALL DONE"
echo "========================================================"
