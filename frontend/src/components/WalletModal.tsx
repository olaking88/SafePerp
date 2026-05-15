import React, { useEffect, useRef } from "react";
import { X, ShieldCheck, Lightning } from "@phosphor-icons/react";

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  popular: boolean;
  detected: boolean;
}

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (walletId: string, walletName: string) => void;
  connecting: string | null;
  anchorRef?: React.RefObject<HTMLButtonElement>;
}

function getDetected(): Record<string, boolean> {
  return {
    phantom: !!(
      (window as any).phantom?.solana ??
      ((window as any).solana?.isPhantom && (window as any).solana)
    ),
    solflare: !!(window as any).solflare,
    backpack: !!(
      (window as any).backpack?.solana ?? (window as any).xnft?.solana
    ),
    coinbase: !!(window as any).coinbaseSolana,
    metamask: !!(window as any).ethereum?.isMetaMask,
  };
}

export function WalletModal({
  open,
  onClose,
  onSelect,
  connecting,
  anchorRef,
}: WalletModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Detect installed wallets fresh each render
  const detected = getDetected();

  const WALLETS: WalletOption[] = [
    {
      id: "phantom",
      name: "Phantom",
      icon: "https://phantom.app/img/phantom-logo.png",
      popular: true,
      detected: detected.phantom,
    },
    {
      id: "solflare",
      name: "Solflare",
      icon: "https://solflare.com/assets/logo.svg",
      popular: true,
      detected: detected.solflare,
    },
    {
      id: "backpack",
      name: "Backpack",
      icon: "https://backpack.app/assets/xnft.png",
      popular: false,
      detected: detected.backpack,
    },
    {
      id: "coinbase",
      name: "Coinbase Wallet",
      icon: "https://www.coinbase.com/img/favicon/favicon.ico",
      popular: false,
      detected: detected.coinbase,
    },
  ];

  // Sort: detected wallets first
  const sorted = [...WALLETS].sort((a, b) =>
    a.detected === b.detected ? 0 : a.detected ? -1 : 1
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={modalRef}
      className="absolute right-0 top-[calc(100%+8px)] w-[300px] z-[100] rounded-xl border border-border shadow-2xl overflow-hidden"
      style={{ background: "rgba(13,14,22,0.97)", backdropFilter: "blur(20px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Connect Wallet</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select your Solana wallet
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={15} weight="bold" />
        </button>
      </div>

      {/* Wallet List */}
      <div className="p-2.5 flex flex-col gap-1">
        {sorted.map((wallet) => {
          const isConnecting = connecting === wallet.id;
          return (
            <button
              key={wallet.id}
              onClick={() => onSelect(wallet.id, wallet.name)}
              disabled={!!connecting}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-white/8 border border-transparent hover:border-accent/20 transition-all duration-150 disabled:opacity-60 disabled:cursor-wait"
            >
              <img
                src={wallet.icon}
                alt={wallet.name}
                className="w-6 h-6 rounded-md object-contain flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="flex-1 text-left text-sm">{wallet.name}</span>

              {/* Detected badge */}
              {wallet.detected && !isConnecting && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-success/15 text-success border border-success/25">
                  Detected
                </span>
              )}
              {/* Popular badge — only if not detected */}
              {wallet.popular && !wallet.detected && !isConnecting && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
                  Popular
                </span>
              )}
              {isConnecting && (
                <span className="flex items-center gap-1 text-[10px] text-accent">
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Connecting…
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border flex items-center gap-2">
        <ShieldCheck size={13} weight="duotone" className="text-success flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground flex-1">
          Non-custodial · Arcium MPC encrypted
        </p>
        <span className="text-[9px] text-warning font-semibold border border-warning/30 px-1.5 py-0.5 rounded-full bg-warning/10">
          DEVNET
        </span>
      </div>
    </div>
  );
}
