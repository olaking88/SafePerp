import React from "react";
import { useApp } from "../context/AppContext";
import { TabView } from "../types";
import { ChartLine, TrendUp, CurrencyDollar, ChartBar } from "@phosphor-icons/react";

const TABS: { id: TabView; label: string; icon: React.ReactNode }[] = [
  { id: "trade", label: "Trade", icon: <ChartLine size={22} weight="duotone" /> },
  { id: "positions", label: "Positions", icon: <TrendUp size={22} weight="duotone" /> },
  { id: "pnl", label: "PnL", icon: <CurrencyDollar size={22} weight="duotone" /> },
  { id: "history", label: "Dashboard", icon: <ChartBar size={22} weight="duotone" /> },
];

export function MobileBottomNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-neutral-900 border-t border-border" aria-label="Mobile navigation">
      <div className="flex">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all duration-200 cursor-pointer ${activeTab === tab.id ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
            aria-current={activeTab === tab.id ? "page" : undefined} aria-label={tab.label}>
            {tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
