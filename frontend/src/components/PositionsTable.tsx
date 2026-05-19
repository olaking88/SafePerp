import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { Position } from "../types";
import { Button } from "@/components/ui/button";
import {
  Lock,
  LockOpen,
  ShieldCheck,
  ShieldWarning,
  ArrowUp,
  ArrowDown,
  CircleNotch,
  X,
  Eye,
  EyeSlash,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react";

function PrivateValue({ children, isOwner, fallback = "••••••" }: { children: React.ReactNode; isOwner: boolean; fallback?: string }) {
  if (isOwner) return <>{children}</>;
  return (
    <span className="flex items-center gap-1 text-muted-foreground font-mono text-xs">
      <Lock size={12} weight="duotone" />
      <span className="tracking-widest">{fallback}</span>
    </span>
  );
}
function LivePnL({
  position,
  isOwner,
}: {
  position: Position;
  isOwner: boolean;
}) {
  const { marketData } = useApp();

  const calcPnl = () => {
    const marketPrice = marketData?.[position.market as keyof typeof marketData]?.price;
    if (!marketPrice || !position.entryPrice) return position.pnl ?? 0;
    const direction = position.side === "Long" ? 1 : -1;
    const priceDiffPct = (marketPrice - position.entryPrice) / position.entryPrice;
    return parseFloat((priceDiffPct * position.amount * position.leverage * direction).toFixed(2));
  };

  const [livePnl, setLivePnl] = useState<number>(calcPnl);

  useEffect(() => {
    if (!isOwner || position.status !== "open") return;
    // Recalculate immediately when marketData changes
    setLivePnl(calcPnl());
    const interval = setInterval(() => {
      setLivePnl(calcPnl());
    }, 2000);
    return () => clearInterval(interval);
  }, [isOwner, position, marketData]);

  if (!isOwner) {
    // Others: show public PnL only if owner revealed it
    if (position.pnlRevealed) {
      return (
        <span className={`font-mono text-sm font-medium flex items-center gap-1 ${(position.pnl ?? 0) >= 0 ? "text-success" : "text-error"}`}>
          <LockOpen size={13} weight="duotone" className="opacity-60" />
          {(position.pnl ?? 0) >= 0 ? "+" : ""}${(position.pnl ?? 0).toFixed(2)}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-muted-foreground font-mono text-xs">
        <Lock size={12} weight="duotone" />
        <span className="tracking-widest">Private</span>
      </span>
    );
  }

  const isProfit = livePnl >= 0;
  return (
    <span className={`font-mono text-sm font-medium transition-all duration-500 ${isProfit ? "text-success" : "text-error"}`}>
      {isProfit ? "+" : ""}${livePnl.toFixed(2)}
    </span>
  );
}

function PositionCard({ position, isOwner }: { position: Position; isOwner: boolean }) {
  const isPending = false;
  const { addToast, marketData, setProtocolBalance } = useApp();
  const [toggling, setToggling] = useState(false);
  const isLong = position.side === "Long";

const handleClose = async () => {
  if (!isOwner) return;
  try {
    const positions = JSON.parse(localStorage.getItem("positions") || "[]");
    const marketPrice = marketData?.[position.market as keyof typeof marketData]?.price ?? position.entryPrice;
    const direction = position.side === "Long" ? 1 : -1;
    const priceDiffPct = (marketPrice - position.entryPrice) / position.entryPrice;
    const pnl = parseFloat((priceDiffPct * position.amount * position.leverage * direction).toFixed(2));
    const updated = positions.map((p: any) =>
      p.id === position.id ? { ...p, status: "closed", pnl } : p
    );
    localStorage.setItem("positions", JSON.stringify(updated));
    // Return collateral + pnl to protocol balance
    const stored = parseFloat(localStorage.getItem(`arcperp_protocol_${position.walletAddress}`) ?? "0");
    const newBalance = Math.max(0, stored + position.amount + pnl);
    localStorage.setItem(`arcperp_protocol_${position.walletAddress}`, String(newBalance));
    setProtocolBalance(newBalance);
    addToast({ type: "success", title: "Position Closed", message: `PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` });
  } catch (err) {
    console.error(err);
    addToast({ type: "error", title: "Failed to Close", message: "Please try again." });
  }
};

  const handleToggleReveal = async () => {
    if (!isOwner) return;
    setToggling(true);
    try {
     const positions = JSON.parse(
  localStorage.getItem("positions") || "[]"
);

const updated = positions.map((p: any) =>
  p.id === position.id
    ? { ...p, pnlRevealed: !p.pnlRevealed }
    : p
);

localStorage.setItem("positions", JSON.stringify(updated));

    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:-translate-y-0.5 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-foreground">{position.market}</span>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isLong ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
            {isLong ? <ArrowUp size={12} weight="duotone" /> : <ArrowDown size={12} weight="duotone" />}
            {position.side}
          </span>
          <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">{position.leverage}x</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={16} weight="duotone" className="text-success" />
          <span className="text-xs text-muted-foreground">Encrypted</span>
        </div>
      </div>

      {/* Data Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Entry Price</p>
          <PrivateValue isOwner={isOwner}>
            <span className="font-mono text-sm text-foreground">${position.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </PrivateValue>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Size</p>
          <PrivateValue isOwner={isOwner}>
            <span className="font-mono text-sm text-foreground">${position.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </PrivateValue>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Liq. Price</p>
          <PrivateValue isOwner={isOwner}>
            <span className="font-mono text-sm text-error">${position.liquidationPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </PrivateValue>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Live PnL {isOwner && position.pnlRevealed && <span className="text-[10px] text-accent ml-1">(Public)</span>}
          </p>
          <LivePnL position={position} isOwner={isOwner} />
        </div>
      </div>

      {/* Actions — owner only */}
      {isOwner && (
        <div className="flex gap-2 pt-1">
          <Button onClick={handleToggleReveal} disabled={toggling}
            className={`flex-1 h-9 text-xs border ${position.pnlRevealed ? "bg-accent/15 text-accent border-accent/30 hover:bg-accent/25" : "bg-secondary text-secondary-foreground hover:bg-secondary-hover border-primary/30"}`}>
            {toggling ? <CircleNotch size={13} weight="duotone" className="animate-spin mr-1.5" /> :
              position.pnlRevealed ? <EyeSlash size={13} weight="duotone" className="mr-1.5" /> : <Eye size={13} weight="duotone" className="mr-1.5" />}
            {position.pnlRevealed ? "Hide PnL" : "Make PnL Public"}
          </Button>
          <Button onClick={handleClose} disabled={isPending}
            className="flex-1 h-9 text-xs bg-error/10 text-error hover:bg-error/20 border border-error/30">
            <X size={13} weight="duotone" className="mr-1.5" />
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

function PositionRow({ position, isOwner, isLast }: { position: Position; isOwner: boolean; isLast: boolean }) {
 const isPending = false;
  const { addToast, marketData, setProtocolBalance } = useApp();
  const [toggling, setToggling] = useState(false);
  const isLong = position.side === "Long";

const handleClose = async () => {
  if (!isOwner) return;
  try {
    const positions = JSON.parse(localStorage.getItem("positions") || "[]");
    const marketPrice = marketData?.[position.market as keyof typeof marketData]?.price ?? position.entryPrice;
    const direction = position.side === "Long" ? 1 : -1;
    const priceDiffPct = (marketPrice - position.entryPrice) / position.entryPrice;
    const pnl = parseFloat((priceDiffPct * position.amount * position.leverage * direction).toFixed(2));
    const updated = positions.map((p: any) =>
      p.id === position.id ? { ...p, status: "closed", pnl } : p
    );
    localStorage.setItem("positions", JSON.stringify(updated));
    const stored = parseFloat(localStorage.getItem(`arcperp_protocol_${position.walletAddress}`) ?? "0");
    const newBalance = Math.max(0, stored + position.amount + pnl);
    localStorage.setItem(`arcperp_protocol_${position.walletAddress}`, String(newBalance));
    setProtocolBalance(newBalance);
    addToast({ type: "success", title: "Position Closed", message: `PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` });
  } catch (err) {
    console.error(err);
    addToast({ type: "error", title: "Failed to Close", message: "Please try again." });
  }
};

const handleToggleReveal = async () => {
  if (!isOwner) return;

  setToggling(true);

  try {
    const positions = JSON.parse(
      localStorage.getItem("positions") || "[]"
    );

    const updated = positions.map((p: any) =>
      p.id === position.id
        ? { ...p, pnlRevealed: !p.pnlRevealed }
        : p
    );

    localStorage.setItem("positions", JSON.stringify(updated));

  } finally {
    setToggling(false);
  }
};

  return (
    <tr className={`hover:bg-white/[0.02] transition-colors ${!isLast ? "border-b border-border" : ""}`}>
      <td className="px-4 py-3 font-mono text-sm text-foreground">{position.market}</td>
      <td className="px-4 py-3">
        <span className={`flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs font-medium ${isLong ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
          {isLong ? <ArrowUp size={11} weight="duotone" /> : <ArrowDown size={11} weight="duotone" />}
          {position.side}
        </span>
      </td>
      <td className="px-4 py-3">
        <PrivateValue isOwner={isOwner}>
          <span className="font-mono text-sm">${position.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </PrivateValue>
      </td>
      <td className="px-4 py-3">
        <PrivateValue isOwner={isOwner}>
          <span className="font-mono text-sm">${position.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </PrivateValue>
      </td>
      <td className="px-4 py-3">
        <PrivateValue isOwner={isOwner}>
          <span className="font-mono text-sm text-error">${position.liquidationPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </PrivateValue>
      </td>
      <td className="px-4 py-3">
        <LivePnL position={position} isOwner={isOwner} />
      </td>
      <td className="px-4 py-3">
        {isOwner ? (
          <div className="flex items-center justify-end gap-2">
            <Button onClick={handleToggleReveal} disabled={toggling}
              className={`h-8 px-3 text-xs border ${position.pnlRevealed ? "bg-accent/15 text-accent border-accent/30" : "bg-secondary text-secondary-foreground border-primary/30"}`}>
              {toggling ? <CircleNotch size={12} weight="duotone" className="animate-spin mr-1" /> :
                position.pnlRevealed ? <EyeSlash size={12} weight="duotone" className="mr-1" /> : <Eye size={12} weight="duotone" className="mr-1" />}
              {position.pnlRevealed ? "Hide" : "Publish PnL"}
            </Button>
            <Button onClick={handleClose} disabled={isPending}
              className="h-8 px-3 text-xs bg-error/10 text-error hover:bg-error/20 border border-error/30">
              <X size={12} weight="duotone" className="mr-1" /> Close
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">Read-only</span>
        )}
      </td>
    </tr>
  );
}

export function PositionsTable() {
const { walletAddress = "", setProtocolBalance, protocolBalance } = useApp();

const [storedPositions, setStoredPositions] = useState(
  JSON.parse(localStorage.getItem("positions") || "[]")
);

// Refresh positions from localStorage every 2 seconds so close/open reflects immediately
useEffect(() => {
  const refresh = () => setStoredPositions(JSON.parse(localStorage.getItem("positions") || "[]"));
  refresh();
  const interval = setInterval(refresh, 2000);
  return () => clearInterval(interval);
}, []);

const openPositions = storedPositions.filter(
  (p: any) =>
    p.status === "open" &&
    p.walletAddress === walletAddress
);

const isPending = false;

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <CircleNotch size={32} weight="duotone" className="animate-spin text-accent" />
      </div>
    );
  }

  if (openPositions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <img src="https://c.animaapp.com/mn7dgsz7tJk3LS/img/ai_5.png" alt="empty state" loading="lazy"
          className="w-40 h-40 object-cover rounded-2xl opacity-50" />
        <div className="text-center">
          <h3 className="font-heading text-xl font-medium text-foreground mb-2">No Open Positions Yet</h3>
          <p className="text-muted-foreground text-sm max-w-xs">Start by opening a private position. Your trades are encrypted end-to-end via Arcium.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-medium text-foreground">Open Positions</h2>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full border border-border">
          {openPositions.length} active
        </span>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" role="table" aria-label="Open positions">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {["Market", "Side", "Entry Price", "Size", "Liq. Price", "Live PnL", "Actions"].map((h) => (
                <th key={h} className={`px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium ${h === "Actions" ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openPositions.map((position, idx) => (
              <PositionRow key={position.id} position={position}
                isOwner={position.walletAddress === walletAddress}
                isLast={idx === openPositions.length - 1} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden grid gap-3">
        {openPositions.map((p) => (
          <PositionCard key={p.id} position={p}
            isOwner={true} />
        ))}
      </div>
    </div>
  );
}
