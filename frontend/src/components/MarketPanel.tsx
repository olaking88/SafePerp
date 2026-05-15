import React from "react";
import { useApp } from "../context/AppContext";
import { Market } from "../types";
import { TrendUp, TrendDown } from "@phosphor-icons/react";

const MARKETS: Market[] = ["SOL/USDC", "BTC/USDC", "ETH/USDC", "JTO/USDC"];

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function MarketPanel() {
  const { marketData } = useApp();

  return (
    <div className="flex flex-col gap-3">
      {/* Live badge */}
      <div className="flex items-center gap-2 mb-1">
        <span className="flex items-center gap-1.5 text-xs text-success font-medium">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse inline-block" />
          Live prices via Pyth Network
        </span>
      </div>

      {MARKETS.map((market) => {
        const data = marketData[market];
        const isUp = data.change24h >= 0;
        return (
          <div key={market}
            className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/40 hover:bg-muted/60 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent">
                {market.split("/")[0].slice(0, 3)}
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">{market}</p>
                <p className="text-xs text-muted-foreground">Vol {fmt(data.volume24h)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-foreground">
                ${data.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isUp ? "text-success" : "text-error"}`}>
                {isUp ? <TrendUp size={12} weight="duotone" /> : <TrendDown size={12} weight="duotone" />}
                {isUp ? "+" : ""}{data.change24h.toFixed(2)}%
              </p>
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-muted-foreground text-center mt-2">
        Prices from Pyth Network · updates every 5s · devnet simulation
      </p>
    </div>
  );
}
