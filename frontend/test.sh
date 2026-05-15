#!/usr/bin/env bash
# Run this AFTER arcium localnet is running and program is deployed

export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
export ANCHOR_WALLET=~/.config/solana/id.json

echo "Running tests against localnet..."
echo "ANCHOR_PROVIDER_URL=$ANCHOR_PROVIDER_URL"
echo "ANCHOR_WALLET=$ANCHOR_WALLET"
echo ""

anchor test --skip-local-validator
