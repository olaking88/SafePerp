import React, { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { TabView } from "../types";
import {
  ChartLine,
  TrendUp,
  CurrencyDollar,
  MagnifyingGlass,
  ArrowRight,
  Wallet,
  Globe,
  X,
  ChartBar,
} from "@phosphor-icons/react";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveTab,
    walletConnected,
    connectWallet,
    disconnectWallet,
    network,
    setNetwork,
  } = useApp();
  const [query, setQuery] = React.useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  const navigate = (tab: TabView) => {
    setActiveTab(tab);
    setCommandPaletteOpen(false);
  };

  const commands: CommandItem[] = [
    {
      id: "trade",
      label: "Go to Trade",
      description: "Open the trading interface",
      icon: <ChartLine size={18} weight="duotone" />,
      action: () => navigate("trade"),
      category: "Navigation",
    },
    {
      id: "positions",
      label: "View Positions",
      description: "See your open positions",
      icon: <TrendUp size={18} weight="duotone" />,
      action: () => navigate("positions"),
      category: "Navigation",
    },
    {
      id: "pnl",
      label: "Check PnL",
      description: "View your profit and loss",
      icon: <CurrencyDollar size={18} weight="duotone" />,
      action: () => navigate("pnl"),
      category: "Navigation",
    },
    {
      id: "history",
      label: "Portfolio Dashboard",
      description: "View aggregated trading stats and balances",
      icon: <ChartBar size={18} weight="duotone" />,
      action: () => navigate("history"),
      category: "Navigation",
    },
    {
      id: "wallet",
      label: walletConnected ? "Disconnect Wallet" : "Connect Wallet",
      description: walletConnected
        ? "Disconnect your Solana wallet"
        : "Connect your Solana wallet",
      icon: <Wallet size={18} weight="duotone" />,
      action: () => {
        walletConnected ? disconnectWallet() : connectWallet();
        setCommandPaletteOpen(false);
      },
      category: "Wallet",
    },
    {
      id: "network",
      label: `Switch to ${network === "Mainnet" ? "Testnet" : "Mainnet"}`,
      description: `Currently on ${network}`,
      icon: <Globe size={18} weight="duotone" />,
      action: () => {
        setNetwork(network === "Mainnet" ? "Testnet" : "Mainnet");
        setCommandPaletteOpen(false);
      },
      category: "Settings",
    },
  ];

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setCommandPaletteOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-lg bg-card border border-border rounded-xl overflow-hidden animate-slide-down">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <MagnifyingGlass
            size={18}
            weight="duotone"
            className="text-muted-foreground flex-shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            aria-label="Search commands"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
            aria-label="Close command palette"
          >
            <X size={16} weight="duotone" />
          </button>
        </div>

        {/* Commands List */}
        <div className="max-h-[400px] overflow-y-auto py-2">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <p className="px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground font-medium">
                {category}
              </p>
              {items.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer text-left group"
                  aria-label={cmd.label}
                >
                  <span className="text-accent flex-shrink-0">{cmd.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium">
                      {cmd.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cmd.description}
                    </p>
                  </div>
                  <ArrowRight
                    size={14}
                    weight="duotone"
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  />
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No commands found for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
