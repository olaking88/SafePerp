// UI-only context — wallet connection via real browser extension (window.phantom / window.solflare).
// Real SOL + USDC balances fetched from Solana devnet via plain JSON-RPC (no npm packages needed).

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { MarketData, Toast, Market, TabView } from "../types";
import { usePythPrices } from "../hooks/usePythPrices";
import {
  fetchSolBalanceRaw,
  fetchUsdcBalanceRaw,
} from "../hooks/useSolanaBalance";

interface AppContextType {
  walletConnected: boolean;
  walletAddress: string | null;
  connectedWalletName: string | null;
  /** Raw Phantom/Solflare provider — used for signing deposit transactions */
  walletProvider: any | null;
  connectWallet: () => void;
  selectWallet: (walletId: string, walletName: string) => Promise<void>;
  disconnectWallet: () => void;
  walletModalOpen: boolean;
  setWalletModalOpen: (open: boolean) => void;
  connectingWallet: string | null;
  depositModalOpen: boolean;
  setDepositModalOpen: (open: boolean) => void;
  solBalance: number;
  usdcBalance: number;
  refreshBalances: () => Promise<void>;
  /** On-chain-confirmed protocol balance (localStorage-persisted per wallet) */
  protocolBalance: number;
  setProtocolBalance: (amount: number) => void;
  network: "Mainnet" | "Testnet";
  setNetwork: (n: "Mainnet" | "Testnet") => void;
  activeTab: TabView;
  setActiveTab: (tab: TabView) => void;
  marketData: Record<Market, MarketData>;
  toasts: Toast[];
  addToast: (t: Omit<Toast, "id" | "timestamp">) => void;
  removeToast: (id: string) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connectedWalletName, setConnectedWalletName] = useState<string | null>(
    null,
  );
  const [walletProvider, setWalletProvider] = useState<any | null>(null);
  // Store the live provider in a ref so disconnectWallet always gets the current
  // instance (avoids stale-closure capture in useCallback).
  const walletProviderRef = useRef<any | null>(null);
  // Refs for registered event listeners so we can remove them on disconnect.
  const accountChangedListenerRef = useRef<((...args: any[]) => void) | null>(
    null,
  );
  const disconnectListenerRef = useRef<((...args: any[]) => void) | null>(null);
  // Flag that prevents the Phantom "disconnect" event from over-writing state
  // when we are the ones calling disconnect() intentionally.
  const intentionalDisconnectRef = useRef(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [protocolBalance, setProtocolBalanceState] = useState(0);
  const [network, setNetwork] = useState<"Mainnet" | "Testnet">("Testnet");
  const [activeTab, setActiveTab] = useState<TabView>("trade");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const marketData = usePythPrices();

  const addToast = useCallback((t: Omit<Toast, "id" | "timestamp">) => {
    const id = Math.random().toString(36).substring(2);
    const toast: Toast = { ...t, id, timestamp: Date.now() };
    setToasts((prev) => [...prev, toast]);
    setTimeout(
      () => setToasts((prev) => prev.filter((x) => x.id !== id)),
      4500,
    );
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const connectWallet = useCallback(() => {
    setWalletModalOpen(true);
  }, []);

  /** Persist protocol balance to localStorage and update state */
  const setProtocolBalance = useCallback(
    (amount: number) => {
      const clamped = Math.max(0, parseFloat(amount.toFixed(6)));
      setProtocolBalanceState(clamped);
      if (walletAddress) {
        localStorage.setItem(
          `arcperp_protocol_${walletAddress}`,
          String(clamped),
        );
      }
    },
    [walletAddress],
  );

  const refreshBalances = useCallback(async () => {
    if (!walletAddress) return;
    const [sol, usdc] = await Promise.all([
      fetchSolBalanceRaw(walletAddress),
      fetchUsdcBalanceRaw(walletAddress),
    ]);
    setSolBalance(sol);
    setUsdcBalance(usdc);
  }, [walletAddress]);

  // Auto-refresh balances every 15s while connected
  useEffect(() => {
    if (!walletAddress) return;
    const interval = setInterval(refreshBalances, 15000);
    return () => clearInterval(interval);
  }, [walletAddress, refreshBalances]);

  const getProvider = (walletId: string): any => {
    const w = window as any;
    if (walletId === "phantom")
      return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
    if (walletId === "solflare") return w.solflare ?? null;
    if (walletId === "backpack")
      return w.backpack?.solana ?? w.xnft?.solana ?? null;
    if (walletId === "coinbase") return w.coinbaseSolana ?? null;
    return w.solana ?? null;
  };

  const selectWallet = useCallback(
    async (walletId: string, walletName: string) => {
      setConnectingWallet(walletId);
      try {
        const provider = getProvider(walletId);
        if (!provider) {
          addToast({
            type: "error",
            title: `${walletName} Not Found`,
            message: `Install the ${walletName} browser extension, then try again.`,
          });
          setConnectingWallet(null);
          return;
        }

        const resp = await provider.connect();
        const pubkey: string =
          resp?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;

        if (!pubkey) throw new Error("No public key returned from wallet");

        // Fetch real on-chain SOL + USDC from devnet
        const [sol, usdc] = await Promise.all([
          fetchSolBalanceRaw(pubkey),
          fetchUsdcBalanceRaw(pubkey),
        ]);

        // Restore persisted protocol balance for this wallet
        const storedProtocol = parseFloat(
          localStorage.getItem(`arcperp_protocol_${pubkey}`) ?? "0",
        );

        // Remove any stale listeners from a previous connection before adding new ones.
        if (walletProviderRef.current) {
          const prevProvider = walletProviderRef.current;
          if (accountChangedListenerRef.current) {
            prevProvider.off?.(
              "accountChanged",
              accountChangedListenerRef.current,
            );
            prevProvider.removeListener?.(
              "accountChanged",
              accountChangedListenerRef.current,
            );
          }
          if (disconnectListenerRef.current) {
            prevProvider.off?.("disconnect", disconnectListenerRef.current);
            prevProvider.removeListener?.(
              "disconnect",
              disconnectListenerRef.current,
            );
          }
        }

        // Define named handlers so they can be removed later.
        const onAccountChanged = (newPubkey: any) => {
          if (newPubkey) {
            const addr = newPubkey.toString();
            setWalletAddress(addr);
            Promise.all([
              fetchSolBalanceRaw(addr),
              fetchUsdcBalanceRaw(addr),
            ]).then(([sol2, usdc2]) => {
              setSolBalance(sol2);
              setUsdcBalance(usdc2);
            });
          } else {
            setWalletConnected(false);
            setWalletAddress(null);
            setSolBalance(0);
            setUsdcBalance(0);
          }
        };

        const onDisconnect = () => {
          // Only react to Phantom-initiated disconnects, not ones we triggered ourselves.
          if (intentionalDisconnectRef.current) return;
          setWalletConnected(false);
          setWalletAddress(null);
          setSolBalance(0);
          setUsdcBalance(0);
          setConnectedWalletName(null);
          setWalletProvider(null);
          walletProviderRef.current = null;
        };

        accountChangedListenerRef.current = onAccountChanged;
        disconnectListenerRef.current = onDisconnect;

        provider.on?.("accountChanged", onAccountChanged);
        provider.on?.("disconnect", onDisconnect);

        walletProviderRef.current = provider;
        intentionalDisconnectRef.current = false;

        setWalletConnected(true);
        setWalletAddress(pubkey);
        setConnectedWalletName(walletName);
        setWalletProvider(provider);
        setSolBalance(sol);
        setUsdcBalance(usdc);
        setProtocolBalanceState(storedProtocol);
        setConnectingWallet(null);
        setWalletModalOpen(false);

        addToast({
          type: "success",
          title: `${walletName} Connected`,
          message: `${pubkey.slice(0, 6)}…${pubkey.slice(-4)} · ${sol.toFixed(4)} SOL · ${usdc.toFixed(2)} USDC`,
        });
      } catch (err: any) {
        const msg: string = err?.message ?? "Connection rejected";
        addToast({
          type: "error",
          title: "Connection Failed",
          message: msg.toLowerCase().includes("reject")
            ? "You rejected the connection."
            : msg,
        });
        setConnectingWallet(null);
      }
    },
    [addToast],
  );

  const disconnectWallet = useCallback(async () => {
    // Flag as intentional so the Phantom "disconnect" event listener is a no-op.
    intentionalDisconnectRef.current = true;

    // Get the live provider from the ref (avoids stale closure).
    const provider = walletProviderRef.current;

    // Remove event listeners BEFORE calling disconnect() so they don't fire.
    if (provider) {
      if (accountChangedListenerRef.current) {
        provider.off?.("accountChanged", accountChangedListenerRef.current);
        provider.removeListener?.(
          "accountChanged",
          accountChangedListenerRef.current,
        );
        accountChangedListenerRef.current = null;
      }
      if (disconnectListenerRef.current) {
        provider.off?.("disconnect", disconnectListenerRef.current);
        provider.removeListener?.("disconnect", disconnectListenerRef.current);
        disconnectListenerRef.current = null;
      }
    }

    try {
      await provider?.disconnect?.();
    } catch {}

    walletProviderRef.current = null;
    setWalletConnected(false);
    setWalletAddress(null);
    setConnectedWalletName(null);
    setWalletProvider(null);
    setSolBalance(0);
    setUsdcBalance(0);
    setProtocolBalanceState(0);
    addToast({
      type: "info",
      title: "Wallet Disconnected",
      message: "Your wallet has been disconnected.",
    });
  }, [addToast]);

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((p) => !p);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <AppContext.Provider
      value={{
        walletConnected,
        walletAddress,
        connectedWalletName,
        walletProvider,
        connectWallet,
        selectWallet,
        disconnectWallet,
        walletModalOpen,
        setWalletModalOpen,
        connectingWallet,
        depositModalOpen,
        setDepositModalOpen,
        solBalance,
        usdcBalance,
        refreshBalances,
        protocolBalance,
        setProtocolBalance,
        network,
        setNetwork,
        activeTab,
        setActiveTab,
        marketData,
        toasts,
        addToast,
        removeToast,
        commandPaletteOpen,
        setCommandPaletteOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
