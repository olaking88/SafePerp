import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { TabView } from "../types";
import {
  ChartLine,
  Wallet,
  Terminal,
  Globe,
  SignOut,
  List,
  X,
  Lock,
  TrendUp,
  CurrencyDollar,
  PlusCircle,
  ChartBar,
  Copy,
  CheckCircle,
  Bank,
  Drop,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { WalletModal } from "./WalletModal";

const TABS: { id: TabView; label: string; icon: React.ReactNode }[] = [
  {
    id: "trade",
    label: "Trade",
    icon: <ChartLine size={18} weight="duotone" />,
  },
  {
    id: "positions",
    label: "Positions",
    icon: <TrendUp size={18} weight="duotone" />,
  },
  {
    id: "pnl",
    label: "PnL",
    icon: <CurrencyDollar size={18} weight="duotone" />,
  },
  {
    id: "history",
    label: "Dashboard",
    icon: <ChartBar size={18} weight="duotone" />,
  },
];

function shortAddr(addr: string | null) {
  if (!addr) return "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function NavBar() {
  const {
    walletConnected,
    walletAddress,
    connectedWalletName,
    connectWallet,
    selectWallet,
    disconnectWallet,
    walletModalOpen,
    setWalletModalOpen,
    connectingWallet,
    setDepositModalOpen,
    solBalance,
    usdcBalance,
    protocolBalance,
    activeTab,
    setActiveTab,
    setCommandPaletteOpen,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const connectBtnRef = React.useRef<HTMLButtonElement>(null);

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-[72px] glass-panel border-b border-border"
      role="banner"
    >
      <div className="max-w-[1280px] mx-auto h-full flex items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Lock
              size={18}
              weight="duotone"
              className="text-primary-foreground"
            />
          </div>
          <span className="font-heading font-semibold text-lg text-foreground tracking-heading hidden sm:block">
            Safe<span className="gradient-text">Perp</span>
          </span>
        </div>

        {/* Desktop Tabs */}
        <nav
          className="hidden md:flex items-center gap-1"
          aria-label="Main navigation"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer relative ${
                activeTab === tab.id
                  ? "text-accent bg-accent/10"
                  : "text-neutral-300 hover:text-foreground hover:bg-white/5"
              }`}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5">
          {/* Command palette button */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border text-muted-foreground text-sm hover:border-accent/50 hover:text-foreground transition-all duration-200 cursor-pointer"
            aria-label="Open command palette (Ctrl+K)"
          >
            <Terminal size={16} weight="duotone" />
            <span className="hidden lg:block text-xs">⌘K</span>
          </button>

          {/* Devnet badge */}
          <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border bg-warning/10 border-warning/30 text-warning select-none">
            <Globe size={13} weight="duotone" />
            DEVNET
          </span>

          {walletConnected ? (
            <div className="flex items-center gap-1.5">
              {/* Protocol balance chip */}
              <button
                onClick={() => setDepositModalOpen(true)}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  boxShadow: "0 0 12px rgba(99,102,241,0.1)",
                }}
                title="Protocol balance — click to manage funds"
              >
                <Bank size={13} weight="duotone" className="text-accent" />
                <span className="text-[10px] text-accent/70 font-medium uppercase tracking-wide">
                  Protocol
                </span>
                <span className="text-xs text-accent font-mono font-bold">
                  $
                  {protocolBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <PlusCircle
                  size={12}
                  weight="duotone"
                  className="text-accent opacity-60"
                />
              </button>

              {/* USDC on-chain balance chip */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.18)",
                }}
                title="On-chain USDC balance (devnet)"
              >
                <CurrencyDollar
                  size={13}
                  weight="duotone"
                  className="text-emerald-400"
                />
                <span className="text-xs text-emerald-400 font-mono font-semibold">
                  {usdcBalance.toFixed(2)} USDC
                </span>
              </div>

              {/* Get Tokens faucet quick button */}
              <button
                onClick={() => setDepositModalOpen(true)}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}
                title="Get real devnet USDC tokens"
              >
                <Drop size={13} weight="duotone" className="text-emerald-400" />
                <span className="text-xs text-emerald-400 font-semibold">
                  Get Tokens
                </span>
              </button>

              {/* SOL balance chip */}
              <div
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
                title="On-chain SOL balance (devnet)"
              >
                <Wallet
                  size={13}
                  weight="duotone"
                  className="text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {solBalance.toFixed(3)} SOL
                </span>
              </div>

              {/* Wallet address + copy */}
              <button
                onClick={copyAddress}
                className="hidden md:flex items-center gap-1.5 bg-muted px-2.5 py-1.5 rounded-md border border-border hover:border-accent/40 transition-colors group cursor-pointer"
                title="Copy wallet address"
              >
                {connectedWalletName && (
                  <span className="text-[10px] text-accent font-medium hidden xl:block">
                    {connectedWalletName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  {shortAddr(walletAddress)}
                </span>
                {copied ? (
                  <CheckCircle
                    size={12}
                    weight="duotone"
                    className="text-success"
                  />
                ) : (
                  <Copy
                    size={12}
                    weight="duotone"
                    className="text-muted-foreground group-hover:text-accent transition-colors"
                  />
                )}
              </button>

              {/* Mobile deposit */}
              <button
                onClick={() => setDepositModalOpen(true)}
                className="lg:hidden flex items-center gap-1 bg-accent/10 border border-accent/25 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-accent/20 transition-colors text-accent text-xs font-medium"
              >
                <PlusCircle size={13} weight="duotone" /> Deposit
              </button>

              {/* Disconnect — compact */}
              <button
                onClick={disconnectWallet}
                className="flex items-center gap-1.5 bg-secondary border border-border hover:bg-red-900/30 hover:border-red-500/40 text-secondary-foreground hover:text-red-400 h-8 px-2.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer flex-shrink-0"
                title="Disconnect wallet"
              >
                <SignOut size={14} weight="duotone" />
                <span className="hidden sm:block">Disconnect</span>
              </button>
            </div>
          ) : (
            // Connect Wallet button + dropdown modal
            <div className="relative">
              <Button
                ref={connectBtnRef}
                onClick={connectWallet}
                className="bg-gradient-primary text-primary-foreground hover:opacity-90 h-9 px-4 text-sm font-medium"
                aria-expanded={walletModalOpen}
                aria-haspopup="true"
              >
                <Wallet size={16} weight="duotone" />
                <span className="ml-1.5">Connect Wallet</span>
              </Button>
              <WalletModal
                open={walletModalOpen}
                onClose={() => setWalletModalOpen(false)}
                onSelect={selectWallet}
                connecting={connectingWallet}
                anchorRef={connectBtnRef}
              />
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-foreground hover:bg-white/10 transition-colors cursor-pointer"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X size={22} weight="duotone" />
            ) : (
              <List size={22} weight="duotone" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-[72px] left-0 right-0 bg-neutral-900 border-b border-border z-50 animate-slide-down">
          <nav
            className="flex flex-col p-4 gap-1"
            aria-label="Mobile navigation"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? "text-accent bg-accent/10"
                    : "text-neutral-300 hover:text-foreground hover:bg-white/5"
                }`}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
              {walletConnected && walletAddress && (
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs text-accent font-medium truncate">
                    {connectedWalletName}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {shortAddr(walletAddress)}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {solBalance.toFixed(3)} SOL
                  </span>
                  <span className="text-[11px] text-success font-mono">
                    {usdcBalance.toFixed(2)} USDC
                  </span>
                </div>
              )}
              <button
                onClick={() => {
                  setCommandPaletteOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border text-muted-foreground text-sm hover:border-accent/50 hover:text-foreground transition-all duration-200 cursor-pointer"
              >
                <Terminal size={16} weight="duotone" />
                ⌘K
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
