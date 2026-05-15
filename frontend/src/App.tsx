import React, { useEffect } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { NavBar } from "./components/NavBar";
import { TradeForm } from "./components/TradeForm";
import { MarketPanel } from "./components/MarketPanel";
import { PositionsTable } from "./components/PositionsTable";
import { PnLView } from "./components/PnLView";
import { PortfolioDashboard } from "./components/PortfolioDashboard";
import { CommandPalette } from "./components/CommandPalette";
import { ToastSystem } from "./components/ToastSystem";
import { DepositModal } from "./components/DepositModal";
import { Footer } from "./components/Footer";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { MobileFAB } from "./components/MobileFAB";
import { ShieldCheck } from "@phosphor-icons/react";

function AppShell() {
  const { activeTab } = useApp();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[300] focus:bg-accent focus:text-accent-foreground focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <NavBar />

      <main id="main-content" className="flex-1 pt-[72px] pb-16 md:pb-0" role="main">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">

          {/* Trade View */}
          {activeTab === "trade" && (
            <section aria-label="Trade interface" className="animate-fade-in">
              <div className="mb-6">
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-heading text-foreground">
                  <span className="gradient-text">Private</span> Perpetual Futures
                </h1>
                <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
                  <ShieldCheck size={14} weight="duotone" className="text-accent" />
                  End-to-end encrypted trading powered by Arcium on Solana
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                <div className="bg-card border border-border rounded-xl p-6">
                  <h2 className="font-heading text-lg font-medium text-foreground mb-5">New Position</h2>
                  <TradeForm />
                </div>
                <div className="bg-card border border-border rounded-xl p-6 min-h-[500px]">
                  <h2 className="font-heading text-lg font-medium text-foreground mb-5">Market Data</h2>
                  <MarketPanel />
                </div>
              </div>
            </section>
          )}

          {/* Positions View */}
          {activeTab === "positions" && (
            <section aria-label="Positions" className="animate-fade-in">
              <div className="mb-6">
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-heading text-foreground">
                  Open <span className="gradient-text">Positions</span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
                  <ShieldCheck size={14} weight="duotone" className="text-accent" />
                  Your position data — entry price, size, liquidation &amp; PnL are visible only to you.
                </p>
              </div>
              <PositionsTable />
            </section>
          )}

          {/* PnL / History View */}
          {activeTab === "pnl" && (
            <section aria-label="PnL overview" className="animate-fade-in">
              <div className="mb-6">
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-heading text-foreground">
                  PnL <span className="gradient-text">Overview</span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
                  <ShieldCheck size={14} weight="duotone" className="text-accent" />
                  Trade history &amp; PnL — private by default, reveal selectively via Arcium MPC.
                </p>
              </div>
              <PnLView />
            </section>
          )}

          {/* Portfolio Dashboard */}
          {activeTab === "history" && (
            <section aria-label="Portfolio dashboard" className="animate-fade-in">
              <div className="mb-6">
                <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-heading text-foreground">
                  Portfolio <span className="gradient-text">Dashboard</span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
                  <ShieldCheck size={14} weight="duotone" className="text-accent" />
                  Aggregated stats visible only to your connected wallet.
                </p>
              </div>
              <PortfolioDashboard />
            </section>
          )}
        </div>
      </main>

      <Footer />
      <MobileBottomNav />
      <MobileFAB />
      <CommandPalette />
      <ToastSystem />
      <DepositModal />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
