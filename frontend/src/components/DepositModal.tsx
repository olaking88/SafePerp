import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import {
  ArrowDown,
  ArrowUp,
  X,
  Wallet,
  Bank,
  Info,
  CurrencyDollar,
  Drop,
  CheckCircle,
  ArrowRight,
  Lightning,
  Warning,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { runFaucet, depositToVault, withdrawFromVault } from "../lib/faucet";

const FAUCET_AMOUNTS = [100, 500, 1000, 5000];

export function DepositModal() {
  const {
    depositModalOpen,
    setDepositModalOpen,
    addToast,
    walletAddress,
    walletProvider,
    solBalance,
    usdcBalance: onChainUsdc,
    refreshBalances,
    protocolBalance,
    setProtocolBalance,
  } = useApp();

  const [tab, setTab] = useState<"faucet" | "deposit" | "withdraw">("faucet");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetDone, setFaucetDone] = useState(false);
  const [faucetAmount, setFaucetAmount] = useState(500);
  const [claimedTotal, setClaimedTotal] = useState(0);
  const [faucetStep, setFaucetStep] = useState<string>("");
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset on modal close
  useEffect(() => {
    if (!depositModalOpen) {
      setAmount("");
      setTab("faucet");
      setFaucetDone(false);
      setClaimedTotal(0);
      setFaucetStep("");
      setLastTxSig(null);
    }
  }, [depositModalOpen]);

  // Escape key
  useEffect(() => {
    if (!depositModalOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDepositModalOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [depositModalOpen, setDepositModalOpen]);

  if (!depositModalOpen) return null;

  const maxAmount = parseFloat(
    (tab === "deposit" ? onChainUsdc : protocolBalance).toFixed(6),
  );
  const parsed = parseFloat(amount) || 0;
  const invalid = parsed <= 0 || parsed > maxAmount;

  const handleFaucet = async () => {
    if (!walletAddress || faucetLoading) return;
    setFaucetLoading(true);
    setLastTxSig(null);
    setFaucetStep("Checking SOL for fees…");

    try {
      setFaucetStep("Minting tokens on-chain…");
      const result = await runFaucet(walletAddress, faucetAmount);

      if (!result.success) {
        addToast({
          type: "error",
          title: "Faucet Error",
          message: result.message,
        });
        setFaucetLoading(false);
        setFaucetStep("");
        return;
      }

      setLastTxSig(result.mintTxSignature);
      setClaimedTotal((p) => p + faucetAmount);
      setFaucetDone(true);
      setFaucetStep("");

      // Refresh real on-chain balance — tokens are now in Phantom wallet
      // Poll for balance confirmation — devnet can take 5-8 s to reflect new tokens.
      setFaucetStep("Waiting for on-chain confirmation…");
      let updatedBalance = onChainUsdc;
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        await refreshBalances();
        // Slight pause to let React propagate the new value before checking
        await new Promise((r) => setTimeout(r, 200));
        // After first refresh we just keep polling — the NavBar chip will update live
        if (attempt >= 1) break; // Two refreshes is enough; user can see it update
      }
      setFaucetStep("");

      addToast({
        type: "success",
        title: "Tokens Minted On-Chain! 🎉",
        message: result.solAirdropped
          ? `${faucetAmount.toLocaleString()} USDC minted to your Phantom wallet + SOL airdropped for fees.`
          : `${faucetAmount.toLocaleString()} USDC minted to your Phantom wallet. Now deposit to start trading!`,
      });
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Faucet Failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setFaucetLoading(false);
      setFaucetStep("");
    }
  };

  const handleAction = async () => {
    if (invalid) return;
    setLoading(true);
    try {
      if (tab === "deposit") {
        // Real on-chain SPL transfer: user wallet ATA → vault ATA (Phantom signs)
        if (!walletProvider) {
          addToast({
            type: "error",
            title: "Wallet Not Connected",
            message: "Reconnect your wallet and try again.",
          });
          setLoading(false);
          return;
        }
        const result = await depositToVault(
          walletAddress!,
          parsed,
          walletProvider,
        );
        if (!result.success) {
          addToast({
            type: "error",
            title: "Deposit Failed",
            message: result.message,
          });
          setLoading(false);
          return;
        }
        // Update protocol balance (persisted to localStorage)
        setProtocolBalance(protocolBalance + parsed);
        addToast({
          type: "success",
          title: "Deposited On-Chain ✓",
          message: `$${parsed.toFixed(2)} USDC transferred to SafePerp vault. Now visible as Protocol Balance.`,
        });
      } else {
        // Real on-chain withdrawal: vault ATA → user wallet ATA (authority-signed)
        const result = await withdrawFromVault(walletAddress!, parsed);
        if (!result.success) {
          addToast({
            type: "error",
            title: "Withdrawal Failed",
            message: result.message,
          });
          setLoading(false);
          return;
        }
        // Update protocol balance (persisted to localStorage)
        setProtocolBalance(Math.max(0, protocolBalance - parsed));
        addToast({
          type: "success",
          title: "Withdrawn On-Chain ✓",
          message: `$${parsed.toFixed(2)} USDC returned to your Phantom wallet.`,
        });
      }
      // Refresh real on-chain balances after chain confirmation
      await new Promise((r) => setTimeout(r, 3000));
      await refreshBalances();
      setAmount("");
      setDepositModalOpen(false);
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Transaction Failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          setDepositModalOpen(false);
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Manage Funds"
    >
      <div
        ref={panelRef}
        className="w-full max-w-[400px] rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background:
            "linear-gradient(160deg, rgba(15,16,26,0.99) 0%, rgba(13,14,22,0.99) 100%)",
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06), 0 0 60px rgba(99,102,241,0.08)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pt-5 pb-4 sticky top-0 z-10"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(13,14,22,0.98)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(16,185,129,0.3) 100%)",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              <Bank size={16} weight="duotone" className="text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground font-heading leading-none">
                Manage Funds
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Solana Devnet · Real Tokens
              </p>
            </div>
          </div>
          <button
            onClick={() => setDepositModalOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-lg p-1.5 hover:bg-white/5"
            aria-label="Close"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Balance Summary */}
          <div className="grid grid-cols-2 gap-2.5">
            <div
              className="flex flex-col gap-1.5 p-3 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <CurrencyDollar
                  size={12}
                  weight="duotone"
                  className="text-emerald-400"
                />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Wallet USDC
                </span>
              </div>
              <span className="text-[15px] font-mono font-bold text-foreground">
                {`$${onChainUsdc.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              </span>
              <div className="flex items-center gap-1">
                <Wallet
                  size={10}
                  weight="duotone"
                  className="text-muted-foreground"
                />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {solBalance.toFixed(4)} SOL
                </span>
              </div>
            </div>

            <div
              className="flex flex-col gap-1.5 p-3 rounded-xl relative overflow-hidden"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  background:
                    "radial-gradient(circle at top right, rgba(99,102,241,0.3), transparent 70%)",
                }}
              />
              <div className="flex items-center gap-1.5 relative">
                <Bank size={12} weight="duotone" className="text-accent" />
                <span className="text-[10px] text-accent/80 uppercase tracking-wider">
                  Protocol
                </span>
              </div>
              <span className="text-[15px] font-mono font-bold text-accent relative">
                {`$${protocolBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
              </span>
              <span className="text-[10px] text-accent/50 relative">
                Available to trade
              </span>
            </div>
          </div>

          {/* Tab Toggle */}
          <div
            className="flex rounded-xl overflow-hidden p-1 gap-1"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {(["faucet", "deposit", "withdraw"] as const).map((t) => {
              const active = tab === t;
              const icons = {
                faucet: <Drop size={13} weight="duotone" />,
                deposit: <ArrowDown size={13} weight="duotone" />,
                withdraw: <ArrowUp size={13} weight="duotone" />,
              };
              const labels = {
                faucet: "Get Tokens",
                deposit: "Deposit",
                withdraw: "Withdraw",
              };
              const activeStyle =
                t === "faucet"
                  ? {
                      background: "rgba(16,185,129,0.2)",
                      color: "rgb(52,211,153)",
                    }
                  : {
                      background: "rgba(99,102,241,0.2)",
                      color: "hsl(192, 92%, 55%)",
                    };
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setAmount("");
                    if (t === "faucet") setFaucetDone(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer rounded-lg"
                  style={active ? activeStyle : { color: "hsl(220, 9%, 45%)" }}
                >
                  {icons[t]} {labels[t]}
                </button>
              );
            })}
          </div>

          {/* ── FAUCET TAB ── */}
          {tab === "faucet" && (
            <div className="flex flex-col gap-4">
              {faucetDone ? (
                /* Success State */
                <div
                  className="rounded-xl p-4 flex flex-col items-center gap-3 text-center"
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.25)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(16,185,129,0.2)" }}
                  >
                    <CheckCircle
                      size={28}
                      weight="duotone"
                      className="text-emerald-400"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-400">
                      {claimedTotal.toLocaleString()} USDC Minted On-Chain!
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Real tokens sent to your wallet. Check Phantom — they
                      should appear automatically on devnet.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {lastTxSig && (
                      <a
                        href={`https://explorer.solana.com/tx/${lastTxSig}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-accent hover:opacity-80 transition-opacity flex items-center gap-1"
                      >
                        View on Explorer{" "}
                        <ArrowSquareOut size={11} weight="bold" />
                      </a>
                    )}
                    <span className="text-muted-foreground text-[10px]">·</span>
                    <button
                      type="button"
                      onClick={async () => {
                        setFaucetDone(false);
                        setClaimedTotal(0);
                        setLastTxSig(null);
                        // Re-poll balance so the updated amount shows immediately
                        await refreshBalances();
                      }}
                      className="text-[11px] text-accent hover:opacity-80 transition-opacity cursor-pointer underline underline-offset-2"
                    >
                      Claim more
                    </button>
                    <span className="text-muted-foreground text-[10px]">·</span>
                    <button
                      type="button"
                      onClick={() => setDepositModalOpen(false)}
                      className="text-[11px] text-emerald-400 hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1"
                    >
                      Start trading <ArrowRight size={11} weight="bold" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Faucet Form */
                <>
                  <div
                    className="relative rounded-xl p-4 overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(99,102,241,0.1) 100%)",
                      border: "1px solid rgba(16,185,129,0.2)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background: "rgba(16,185,129,0.2)",
                          border: "1px solid rgba(16,185,129,0.3)",
                        }}
                      >
                        <Drop
                          size={18}
                          weight="duotone"
                          className="text-emerald-400"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-foreground font-heading">
                            SafePerp Devnet Faucet
                          </span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: "rgba(16,185,129,0.15)",
                              color: "rgb(52,211,153)",
                              border: "1px solid rgba(16,185,129,0.3)",
                            }}
                          >
                            REAL TOKENS
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Mints real USDC tokens on devnet directly to your
                          wallet. Tokens appear in Phantom &amp; Solflare
                          instantly.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* What you get */}
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                      What you receive
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className="flex flex-col gap-1 p-3 rounded-xl"
                        style={{
                          background: "rgba(99,102,241,0.08)",
                          border: "1px solid rgba(99,102,241,0.15)",
                        }}
                      >
                        <span className="text-[10px] text-accent/70 uppercase tracking-wider">
                          USDC (On-Chain)
                        </span>
                        <span className="text-base font-mono font-bold text-accent">
                          ${faucetAmount.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Real SPL token · 6 decimals
                        </span>
                      </div>
                      <div
                        className="flex flex-col gap-1 p-3 rounded-xl"
                        style={{
                          background: "rgba(16,185,129,0.06)",
                          border: "1px solid rgba(16,185,129,0.15)",
                        }}
                      >
                        <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider">
                          Devnet SOL
                        </span>
                        <span className="text-base font-mono font-bold text-emerald-400">
                          Auto
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Airdropped if needed
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amount picker */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                        Amount
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                        {faucetAmount.toLocaleString()} USDC selected
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {FAUCET_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setFaucetAmount(amt)}
                          className="py-2.5 rounded-lg text-sm font-mono font-bold transition-all duration-150 cursor-pointer"
                          style={
                            faucetAmount === amt
                              ? {
                                  background: "rgba(16,185,129,0.2)",
                                  color: "rgb(52,211,153)",
                                  border: "1px solid rgba(16,185,129,0.4)",
                                  boxShadow: "0 0 12px rgba(16,185,129,0.2)",
                                }
                              : {
                                  background: "rgba(255,255,255,0.03)",
                                  color: "hsl(220,9%,45%)",
                                  border: "1px solid rgba(255,255,255,0.06)",
                                }
                          }
                        >
                          {amt >= 1000 ? `${amt / 1000}k` : amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mint button */}
                  <button
                    type="button"
                    onClick={handleFaucet}
                    disabled={faucetLoading || !walletAddress}
                    className="w-full h-12 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{
                      background: faucetLoading
                        ? "rgba(16,185,129,0.15)"
                        : "linear-gradient(135deg, rgb(16,185,129) 0%, rgb(5,150,105) 100%)",
                      color: faucetLoading ? "rgb(52,211,153)" : "rgb(0,25,15)",
                      boxShadow: faucetLoading
                        ? "none"
                        : "0 4px 24px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                  >
                    {faucetLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        <span>{faucetStep || "Minting on-chain…"}</span>
                      </>
                    ) : (
                      <>
                        <Lightning size={16} weight="fill" />
                        Mint {faucetAmount.toLocaleString()} USDC to Wallet
                        <ArrowRight size={14} weight="bold" />
                      </>
                    )}
                  </button>

                  {!walletAddress && (
                    <p className="text-[11px] text-center text-warning">
                      Connect your wallet first to receive tokens.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setTab("deposit")}
                    className="text-[11px] text-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Already have devnet USDC?{" "}
                    <span className="text-accent underline underline-offset-2">
                      Deposit to protocol →
                    </span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── DEPOSIT / WITHDRAW TABS ── */}
          {(tab === "deposit" || tab === "withdraw") && (
            <>
              <div
                className="flex items-start gap-2 p-3 rounded-xl"
                style={{
                  background: "rgba(234,179,8,0.05)",
                  border: "1px solid rgba(234,179,8,0.15)",
                }}
              >
                <Info
                  size={13}
                  weight="duotone"
                  className="text-warning flex-shrink-0 mt-0.5"
                />
                <p className="text-[10px] text-warning/70 leading-relaxed">
                  <b>Devnet.</b>{" "}
                  {tab === "deposit"
                    ? "Move your on-chain devnet USDC into SafePerp to trade."
                    : "Return protocol funds back to your devnet wallet."}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                    Amount (USDC)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAmount(String(maxAmount))}
                    className="text-[11px] text-accent hover:opacity-80 transition-opacity cursor-pointer font-semibold"
                  >
                    Max: $
                    {maxAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-12 rounded-xl px-4 pr-16 text-foreground placeholder:text-muted-foreground font-mono text-sm focus:outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${parsed > maxAmount && parsed > 0 ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.08)"}`,
                    }}
                    aria-label="Amount in USDC"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                    USDC
                  </span>
                </div>
                {parsed > maxAmount && parsed > 0 && (
                  <p className="text-xs text-red-400">
                    {tab === "deposit"
                      ? "Insufficient wallet USDC"
                      : "Insufficient protocol balance"}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={invalid || loading}
                  className="w-full h-12 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  style={
                    tab === "deposit"
                      ? {
                          background:
                            "linear-gradient(135deg, hsl(250,66%,55%) 0%, hsl(192,92%,55%) 100%)",
                          color: "white",
                          boxShadow:
                            !invalid && !loading
                              ? "0 4px 20px rgba(99,102,241,0.35)"
                              : "none",
                        }
                      : {
                          background: "rgba(99,102,241,0.15)",
                          color: "hsl(192,92%,55%)",
                          border: "1px solid rgba(99,102,241,0.3)",
                        }
                  }
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Processing…
                    </span>
                  ) : (
                    <>
                      {tab === "deposit" ? (
                        <ArrowDown size={15} weight="bold" />
                      ) : (
                        <ArrowUp size={15} weight="bold" />
                      )}
                      {tab === "deposit"
                        ? "Deposit to SafePerp"
                        : "Withdraw to Wallet"}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDepositModalOpen(false)}
                  disabled={loading}
                  className="w-full h-10 text-sm text-muted-foreground hover:text-foreground font-medium rounded-xl transition-all duration-150 cursor-pointer disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  Cancel
                </button>
              </div>

              <button
                type="button"
                onClick={() => setTab("faucet")}
                className="text-[11px] text-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                No USDC yet?{" "}
                <span className="text-emerald-400 underline underline-offset-2">
                  Get from faucet →
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
