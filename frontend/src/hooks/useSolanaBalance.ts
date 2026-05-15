// Fetches real SOL + USDC (SafePerp token) balances from Solana devnet via plain JSON-RPC.
// No @solana/web3.js needed — uses raw RPC calls directly.
// TOKEN_MINT: 2fxCkXUmGKi3rkBxxHizEtakZi6RZ7ASfDNYZ5xJpYS9 (6 decimals)

import { useState, useEffect, useCallback } from "react";
import { getActiveMintAddress } from "../lib/faucet";

const DEVNET_RPC = "https://api.devnet.solana.com";

export async function fetchSolBalanceRaw(address: string): Promise<number> {
  try {
    const res = await fetch(DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address],
      }),
    });
    const json = await res.json();
    const lamports: number = json?.result?.value ?? 0;
    return parseFloat((lamports / 1_000_000_000).toFixed(6));
  } catch {
    return 0;
  }
}

/** Returns real on-chain USDC token balance for the active SafePerp devnet mint */
export async function fetchUsdcBalanceRaw(address: string): Promise<number> {
  try {
    // Use getActiveMintAddress() so balance queries stay in sync with whatever
    // mint the faucet is currently using (self-heals after devnet resets).
    const activeMint = getActiveMintAddress();
    const res = await fetch(DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [address, { mint: activeMint }, { encoding: "jsonParsed" }],
      }),
    });
    const json = await res.json();
    const accounts = json?.result?.value ?? [];
    if (accounts.length === 0) return 0;
    const uiAmount =
      accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    return parseFloat(Number(uiAmount).toFixed(6));
  } catch {
    return 0;
  }
}

export function useSolanaBalance(walletAddress: string | null) {
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (address: string) => {
    const [sol, usdc] = await Promise.all([
      fetchSolBalanceRaw(address),
      fetchUsdcBalanceRaw(address),
    ]);
    setSolBalance(sol);
    setUsdcBalance(usdc);
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setSolBalance(0);
      setUsdcBalance(0);
      return;
    }
    setLoading(true);
    refresh(walletAddress).finally(() => setLoading(false));
    const interval = setInterval(() => refresh(walletAddress), 15000);
    return () => clearInterval(interval);
  }, [walletAddress, refresh]);

  return { solBalance, usdcBalance, loading, refresh };
}
