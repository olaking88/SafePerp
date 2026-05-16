import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { Position } from "../types";
import { TrendUp, TrendDown, Lock, LockOpen, ShieldCheck, ChartBar, Eye, EyeSlash } from "@phosphor-icons/react";

function PnLCard({ position, isOwner }: { position: Position; isOwner: boolean }) {
  const isLong = position.side === "Long";
  const pnlVal = position.pnl ?? 0;
  const isProfit = pnlVal >= 0;
  const showPnL = isOwner || position.pnlRevealed;

  const handleToggle = () => {
    if (!isOwner) return;
    const positions = JSON.parse(localStorage.getItem("positions") || "[]");
    const updated = positions.map((p: any) =>
      p.id === position.id ? { ...p, pnlRevealed: !p.pnlRevealed } : p
    );
    localStorage.setItem("positions", JSON.stringify(updated));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-foreground">{position.market}</span>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isLong ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
            {isLong ? <TrendUp size={12} weight="duotone" /> : <TrendDown size={12} weight="duotone" />}
            {position.side}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${position.status === "open" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
          {position.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div>
          <p className="text-muted-foreground uppercase tracking-wider mb-1">Entry</p>
          {isOwner ? <span className="font-mono text-foreground">${position.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            : <span className="font-mono text-muted-foreground tracking-widest">••••••</span>}
        </div>
        <div>
          <p className="text-muted-foreground uppercase tracking-wider mb-1">Size</p>
          {isOwner ? <span className="font-mono text-foreground">${position.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            : <span className="font-mono text-muted-foreground tracking-widest">••••••</span>}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">PnL</p>
          {showPnL ? (
            <p className={`font-heading text-2xl font-semibold ${isProfit ? "text-success" : "text-error"}`}>
              {isProfit ? "+" : ""}${pnlVal.toFixed(2)}
            </p>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Lock size={16} weight="duotone" />
              <span className="font-mono tracking-widest text-sm">Private</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} weight="duotone" className="text-accent" />
          {isOwner && position.status === "closed" && (
            <button onClick={handleToggle}
              className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${position.pnlRevealed ? "text-accent border-accent/30 bg-accent/10 hover:bg-accent/20" : "text-muted-foreground border-border hover:text-foreground hover:bg-white/5"}`}>
              {position.pnlRevealed ? <><EyeSlash size={12} weight="duotone" className="inline mr-1" />Hide</> : <><Eye size={12} weight="duotone" className="inline mr-1" />Publish</>}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>Leverage: <span className="text-foreground font-mono">{position.leverage}x</span></span>
        <span className="text-[10px]">{new Date(position.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

export function PnLView() {
  const { walletAddress, walletConnected } = useApp();
  const [positions, setPositions] = useState<any[]>([]);

  useEffect(() => {
    const refresh = () => {
      const all = JSON.parse(localStorage.getItem("positions") || "[]");
      setPositions(all.filter((p: any) => p.walletAddress === walletAddress));
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  if (!walletConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Lock size={40} weight="duotone" className="text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Connect your wallet to view your trade history.</p>
      </div>
    );
  }

  const closed = positions.filter(p => p.status === "closed");
  const open = positions.filter(p => p.status === "open");
  const totalPnL = closed.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const winners = closed.filter(p => (p.pnl ?? 0) > 0).length;
  const winRate = closed.length > 0 ? ((winners / closed.length) * 100).toFixed(0) : "0";

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ChartBar size={48} weight="duotone" className="text-muted-foreground" />
        <div className="text-center">
          <h3 className="font-heading text-xl font-medium text-foreground mb-2">No Trade History Yet</h3>
          <p className="text-muted-foreground text-sm">Open and close positions to see your performance here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {closed.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Lock size={12} weight="duotone" /> Total PnL
            </p>
            <p className={`font-heading text-2xl font-semibold ${totalPnL >= 0 ? "text-success" : "text-error"}`}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Lock size={12} weight="duotone" /> Win Rate
            </p>
            <p className="font-heading text-2xl font-semibold text-accent">{winRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{winners} wins / {closed.length} trades</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Total Positions</p>
            <p className="font-heading text-2xl font-semibold text-foreground">{positions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{open.length} open</p>
          </div>
        </div>
      )}
      <div>
        <h2 className="font-heading text-lg font-medium text-foreground mb-4">
          Trade History <span className="text-sm text-muted-foreground font-normal">({positions.length})</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...positions].reverse().map((p) => (
            <PnLCard key={p.id} position={p} isOwner={p.walletAddress === walletAddress} />
          ))}
        </div>
      </div>
    </div>
  );
}
