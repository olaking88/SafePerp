import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Market, OrderType, PositionSide, TradeFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Lock,
  Info,
  ArrowUp,
  ArrowDown,
  CircleNotch,
  CheckCircle,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MARKETS: Market[] = ["SOL/USDC", "BTC/USDC", "ETH/USDC", "JTO/USDC"];

type SubmitState = "idle" | "loading" | "success";

export function TradeForm() {
  const {
    walletConnected,
    connectWallet,
    addToast,
    marketData,
    setDepositModalOpen,
    protocolBalance,
    setProtocolBalance,
  } = useApp();
  const [form, setForm] = useState<TradeFormData>({
    market: "SOL/USDC",
    orderType: "Market",
    side: "Long",
    leverage: 5,
    amount: "",
    limitPrice: "",
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const isCreatingPosition = false;

  const currentPrice = marketData[form.market]?.price ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected) {
      connectWallet();
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      addToast({
        type: "error",
        title: "Invalid Amount",
        message: "Please enter a valid position size.",
      });
      return;
    }
    const size = parseFloat(form.amount);
    if (size > protocolBalance) {
      addToast({
        type: "error",
        title: "Insufficient Balance",
        message: "Not enough protocol balance. Please deposit first.",
      });
      setDepositModalOpen(true);
      return;
    }

    setSubmitState("loading");
    try {
      const entryPrice =
        form.orderType === "Market"
          ? currentPrice
          : parseFloat(form.limitPrice || String(currentPrice));
      const liqOffset =
        form.side === "Long" ? -0.9 / form.leverage : 0.9 / form.leverage;
      const liquidationPrice = parseFloat(
        (entryPrice * (1 + liqOffset)).toFixed(2),
      );

   const position = {
  id: Date.now(),
  market: form.market,
  side: form.side,
  orderType: form.orderType,
  leverage: form.leverage,
  amount: size,
  entryPrice,
  liquidationPrice,
  pnl: 0,
  pnlRevealed: false,
  status: "open",
  createdAt: new Date().toISOString(),
};

const existing = JSON.parse(
  localStorage.getItem("positions") || "[]"
);

localStorage.setItem(
  "positions",
  JSON.stringify([position, ...existing])
);
setProtocolBalance(protocolBalance - size);

      setSubmitState("success");
      addToast({
        type: "success",
        title: "Position Opened",
        message: `Private ${form.side} position on ${form.market} opened successfully.`,
      });
      setTimeout(() => {
        setSubmitState("idle");
        setForm((prev) => ({ ...prev, amount: "", limitPrice: "" }));
      }, 2000);
    } catch (err: any) {
  console.error("OPEN POSITION ERROR:", err);

  setSubmitState("idle");

  addToast({
    type: "error",
    title: "Failed to Open Position",
    message: err?.message || JSON.stringify(err),
  });
}
  };

  const estimatedValue = form.amount
    ? (parseFloat(form.amount) * form.leverage).toFixed(2)
    : "0.00";

  return (
    <TooltipProvider>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
        aria-label="Trade form"
      >
        {/* Protocol balance hint */}
        {walletConnected && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted border border-border text-xs">
            <span className="text-muted-foreground">Available Balance</span>
            <span className="font-mono font-semibold text-accent">
              $
              {protocolBalance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}{" "}
              USDC
            </span>
          </div>
        )}

        {/* Market Selector */}
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="market-select"
            className="text-xs uppercase tracking-widest text-muted-foreground font-light"
          >
            Market
          </Label>
          <Select
            value={form.market}
            onValueChange={(v) =>
              setForm((prev) => ({ ...prev, market: v as Market }))
            }
          >
            <SelectTrigger
              id="market-select"
              className="bg-muted border-border text-foreground h-11 focus:ring-ring focus:border-accent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground">
              {MARKETS.map((m) => (
                <SelectItem
                  key={m}
                  value={m}
                  className="text-foreground hover:bg-white/5 focus:bg-white/5 cursor-pointer"
                >
                  <span className="font-mono text-sm">{m}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Order Type */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground font-light">
            Order Type
          </Label>
          <div
            className="flex rounded-lg overflow-hidden border border-border"
            role="group"
            aria-label="Order type"
          >
            {(["Market", "Limit"] as OrderType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, orderType: type }))
                }
                className={`flex-1 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${form.orderType === type ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                aria-pressed={form.orderType === type}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Side */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground font-light">
            Position
          </Label>
          <div
            className="flex rounded-lg overflow-hidden border border-border"
            role="group"
            aria-label="Position side"
          >
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, side: "Long" }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${form.side === "Long" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              aria-pressed={form.side === "Long"}
            >
              <ArrowUp size={16} weight="duotone" /> Long
            </button>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, side: "Short" }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${form.side === "Short" ? "bg-error text-error-foreground" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              aria-pressed={form.side === "Short"}
            >
              <ArrowDown size={16} weight="duotone" /> Short
            </button>
          </div>
        </div>

        {/* Leverage */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-light">
              Leverage
            </Label>
            <span className="text-sm font-mono font-medium text-accent">
              {form.leverage}x
            </span>
          </div>
          <Slider
            min={1}
            max={50}
            step={1}
            value={[form.leverage]}
            onValueChange={([v]) =>
              setForm((prev) => ({ ...prev, leverage: v }))
            }
            className="w-full"
            aria-label={`Leverage: ${form.leverage}x`}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1x</span>
            <span>10x</span>
            <span>25x</span>
            <span>50x</span>
          </div>
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="amount-input"
            className="text-xs uppercase tracking-widest text-muted-foreground font-light"
          >
            Amount (USDC)
          </Label>
          <div className="relative">
            <Input
              id="amount-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-11 pr-16 focus:border-accent focus:ring-ring font-mono"
              aria-label="Position amount in USDC"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
              USDC
            </span>
          </div>
          {form.amount && (
            <p className="text-xs text-muted-foreground">
              Notional value:{" "}
              <span className="text-accent font-mono">${estimatedValue}</span>
            </p>
          )}
        </div>

        {/* Limit Price */}
        {form.orderType === "Limit" && (
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="limit-price"
              className="text-xs uppercase tracking-widest text-muted-foreground font-light"
            >
              Limit Price (USDC)
            </Label>
            <Input
              id="limit-price"
              type="number"
              min="0"
              step="0.01"
              placeholder={String(currentPrice)}
              value={form.limitPrice}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, limitPrice: e.target.value }))
              }
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-11 focus:border-accent focus:ring-ring font-mono"
            />
          </div>
        )}

        {/* Privacy Info */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <ShieldCheck
            size={18}
            weight="duotone"
            className="text-accent mt-0.5 flex-shrink-0"
          />
          <div className="flex-1">
            <p className="text-xs text-foreground font-medium">
              Computation privacy powered by Arcium
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Entry price, size &amp; liquidation are visible only to your
              wallet. PnL can be selectively revealed.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-accent transition-colors cursor-pointer"
                aria-label="How privacy works"
              >
                <Info size={16} weight="duotone" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="bg-card border-border text-foreground max-w-[220px] text-xs p-3">
              <p className="font-medium mb-1">How Privacy Works</p>
              <p className="text-muted-foreground">
                Arcium uses multi-party computation (MPC) to encrypt your
                position data on Solana. Entry price, size, and PnL remain
                hidden from outsiders until you explicitly reveal them.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={submitState === "loading" || isCreatingPosition}
          className={`w-full h-11 text-sm font-medium transition-all duration-200 text-primary-foreground ${submitState === "success" ? "bg-success text-success-foreground" : "bg-gradient-primary hover:opacity-90 active:scale-[0.98]"}`}
        >
          {submitState === "loading" && (
            <CircleNotch
              size={18}
              weight="duotone"
              className="animate-spin mr-2"
            />
          )}
          {submitState === "success" && (
            <CheckCircle size={18} weight="duotone" className="mr-2" />
          )}
          {submitState === "idle" && (
            <Lock size={18} weight="duotone" className="mr-2" />
          )}
          {submitState === "idle" &&
            (walletConnected
              ? "Open Private Position"
              : "Connect Wallet to Trade")}
          {submitState === "loading" && "Encrypting & Submitting..."}
          {submitState === "success" && "Position Opened!"}
        </Button>
      </form>
    </TooltipProvider>
  );
}
