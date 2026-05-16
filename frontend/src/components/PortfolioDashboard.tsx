import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  ShieldCheck, Lock, LockOpen, TrendUp, TrendDown,
  ChartBar, Trophy, Warning,
} from "@phosphor-icons/react";

function StatCard({ label, value, sub, color = "text-foreground", locked = false, icon }: {
  label: string; value: string; sub?: string; color?: string; locked?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {locked ? <Lock size={11} weight="duotone" /> : <LockOpen size={11} weight="duotone" className="text-accent" />}
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={`font-heading text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function PortfolioDashboard() {
  const { usdcBalance, protocolBalance, walletAddress, walletConnected } = useApp();
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
        <p className="text-muted-foreground text-sm">Connect your wallet to view your portfolio.</p>
      </div>
    );
  }

  const closed = positions.filter(p => p.status === "closed");
  const open = positions.filter(p => p.status === "open");
  const wins = closed.filter(p => (p.pnl ?? 0) > 0).length;
  const losses = closed.filter(p => (p.pnl ?? 0) <= 0).length;
  const totalPnl = closed.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-xl font-semibold text-foreground mb-1">Portfolio Dashboard</h2>
        <p className="text-sm text-muted-foreground">Your encrypted trading statistics</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total PnL" value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`}
          sub={`${closed.length} closed trades`} color={totalPnl >= 0 ? "text-success" : "text-error"}
          icon={totalPnl >= 0 ? <TrendUp size={18} weight="duotone" className="text-success" /> : <TrendDown size={18} weight="duotone" className="text-error" />} />
        <StatCard label="Winning Trades" value={String(wins)} sub="Closed with profit" color="text-success"
          icon={<Trophy size={18} weight="duotone" className="text-success" />} />
        <StatCard label="Losing Trades" value={String(losses)} sub="Closed with a loss" color="text-error"
          icon={<Warning size={18} weight="duotone" className="text-error" />} />
        <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} sub={`${wins}W / ${losses}L`}
          color={winRate >= 50 ? "text-accent" : "text-warning"} icon={<ChartBar size={18} weight="duotone" />} />
      </div>
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-heading text-base font-medium text-foreground mb-4 flex items-center gap-2">
          <Lock size={16} weight="duotone" className="text-accent" /> Account Balances
          <span className="text-xs text-muted-foreground font-normal">(private)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-muted border border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Wallet USDC</p>
            <p className="font-mono text-lg font-semibold text-foreground">${usdcBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 rounded-lg bg-accent/[0.07] border border-accent/20">
            <p className="text-xs text-accent uppercase tracking-wider mb-1">Protocol Balance</p>
            <p className="font-mono text-lg font-semibold text-accent">${protocolBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted border border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Open Positions</p>
            <p className="font-mono text-lg font-semibold text-foreground">{open.length}</p>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
        <ShieldCheck size={18} weight="duotone" className="text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">How Portfolio Privacy Works</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Your stats, balances, and trade history are encrypted via Arcium MXE on Solana. Outsiders see nothing unless you explicitly enable "Make PnL Public". Your privacy is always the default.
          </p>
        </div>
      </div>
    </div>
  );
}
