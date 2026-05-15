import React from "react";
import { useQuery, useMutation, useAuth } from "@animaapp/playground-react-sdk";
import { useApp } from "../context/AppContext";
import {
  ShieldCheck,
  Lock,
  LockOpen,
  TrendUp,
  TrendDown,
  ChartBar,
  CurrencyDollar,
  CircleNotch,
  Eye,
  EyeSlash,
  Trophy,
  Warning,
} from "@phosphor-icons/react";

function StatCard({
  label,
  value,
  sub,
  color = "text-foreground",
  locked = false,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  locked?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {locked ? (
            <Lock size={11} weight="duotone" />
          ) : (
            <LockOpen size={11} weight="duotone" className="text-accent" />
          )}
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p
        className={`font-heading text-2xl font-semibold tracking-heading ${color}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function PortfolioDashboard() {
  const { user, isAnonymous } = useAuth();
  const { data: statsArr, isPending } = useQuery("TradingStats");
  const { data: positions } = useQuery("Position");
  const { update: updateStats } = useMutation("TradingStats");
  const { usdcBalance, protocolBalance } = useApp();

  const stats = statsArr?.[0];

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <CircleNotch
          size={32}
          weight="duotone"
          className="animate-spin text-accent"
        />
      </div>
    );
  }

  // Not logged in
  if (isAnonymous || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <Lock size={48} weight="duotone" className="text-muted-foreground" />
        <h3 className="font-heading text-xl font-medium text-foreground">
          Portfolio Stats are Private
        </h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Connect your wallet and sign in to view your aggregated trading
          performance dashboard.
        </p>
      </div>
    );
  }

  // No stats yet
  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <ChartBar
          size={48}
          weight="duotone"
          className="text-muted-foreground"
        />
        <h3 className="font-heading text-xl font-medium text-foreground">
          No Stats Yet
        </h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Open and close positions to start building your portfolio dashboard.
        </p>
      </div>
    );
  }

  const isNetProfit = stats.netPnl >= 0;
  const openCount = (positions ?? []).filter(
    (p) => p.status === "open" && p.createdByUserId === user.id,
  ).length;

  const handleToggleStatsReveal = async () => {
    await updateStats(stats.id, { statsRevealed: !stats.statsRevealed });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Privacy Toggle Header */}
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} weight="duotone" className="text-accent" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Portfolio Privacy
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.statsRevealed
                ? "Your stats are publicly visible — others can see your performance."
                : "Stats are private — only you can see this dashboard."}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggleStatsReveal}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${stats.statsRevealed ? "bg-accent/15 text-accent border-accent/30 hover:bg-accent/25" : "bg-muted text-muted-foreground border-border hover:text-foreground hover:bg-white/5"}`}
        >
          {stats.statsRevealed ? (
            <>
              <EyeSlash size={14} weight="duotone" />
              Make Private
            </>
          ) : (
            <>
              <Eye size={14} weight="duotone" />
              Make Public
            </>
          )}
        </button>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total Volume Traded"
          value={`$${stats.totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          sub="Sum of all notional values"
          locked={!stats.statsRevealed}
          icon={<CurrencyDollar size={18} weight="duotone" />}
        />
        <StatCard
          label="Total Capital Deployed"
          value={`$${stats.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          sub="Total USDC spent on trades"
          locked={!stats.statsRevealed}
          icon={<ChartBar size={18} weight="duotone" />}
        />
        <StatCard
          label="Net PnL"
          value={`${isNetProfit ? "+" : ""}$${stats.netPnl.toFixed(2)}`}
          sub={`Across ${stats.winningTrades + stats.losingTrades} closed trades`}
          color={isNetProfit ? "text-success" : "text-error"}
          locked={!stats.statsRevealed}
          icon={
            isNetProfit ? (
              <TrendUp size={18} weight="duotone" className="text-success" />
            ) : (
              <TrendDown size={18} weight="duotone" className="text-error" />
            )
          }
        />
        <StatCard
          label="Winning Trades"
          value={String(stats.winningTrades)}
          sub="Closed with profit"
          color="text-success"
          locked={!stats.statsRevealed}
          icon={<Trophy size={18} weight="duotone" className="text-success" />}
        />
        <StatCard
          label="Losing Trades"
          value={String(stats.losingTrades)}
          sub="Closed with a loss"
          color="text-error"
          locked={!stats.statsRevealed}
          icon={<Warning size={18} weight="duotone" className="text-error" />}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          sub={`${stats.winningTrades}W / ${stats.losingTrades}L`}
          color={stats.winRate >= 50 ? "text-accent" : "text-warning"}
          locked={!stats.statsRevealed}
          icon={<ChartBar size={18} weight="duotone" />}
        />
      </div>

      {/* Account Balances */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-heading text-base font-medium text-foreground mb-4 flex items-center gap-2">
          <Lock size={16} weight="duotone" className="text-accent" />
          Account Balances{" "}
          <span className="text-xs text-muted-foreground font-normal">
            (private)
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-muted border border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Wallet USDC
            </p>
            <p className="font-mono text-lg font-semibold text-foreground">
              $
              {usdcBalance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-accent/[0.07] border border-accent/20">
            <p className="text-xs text-accent uppercase tracking-wider mb-1">
              Protocol Balance
            </p>
            <p className="font-mono text-lg font-semibold text-accent">
              $
              {protocolBalance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted border border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Open Positions
            </p>
            <p className="font-mono text-lg font-semibold text-foreground">
              {openCount}
            </p>
          </div>
        </div>
      </div>

      {/* Privacy note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
        <ShieldCheck
          size={18}
          weight="duotone"
          className="text-accent flex-shrink-0 mt-0.5"
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            How Portfolio Privacy Works
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Your stats, balances, and trade history are encrypted and stored
            per-user. Outsiders see nothing unless you explicitly enable "Make
            Public". This is enforced both at the data layer and the display
            layer — your privacy is always the default.
          </p>
        </div>
      </div>
    </div>
  );
}
