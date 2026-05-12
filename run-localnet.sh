#!/bin/bash
sed -i '/warp_slot/d' Anchor.toml
sed -i '/^\[test\.validator\]/d' Anchor.toml

# Watch for changes and fix instantly
(inotifywait -m -e modify Anchor.toml 2>/dev/null | while read; do
    sed -i 's/warp_slot = 200/warp_slot = "200"/' Anchor.toml
done) &
WATCH_PID=$!

arcium localnet
kill $WATCH_PID 2>/dev/null
