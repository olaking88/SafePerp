import React from "react";
import { useApp } from "../context/AppContext";
import { Toast } from "../types";
import { CheckCircle, XCircle, Info, Warning, X } from "@phosphor-icons/react";

const TOAST_ICONS: Record<Toast["type"], React.ReactNode> = {
  success: (
    <CheckCircle
      size={18}
      weight="duotone"
      className="text-success flex-shrink-0"
    />
  ),
  error: (
    <XCircle size={18} weight="duotone" className="text-error flex-shrink-0" />
  ),
  info: <Info size={18} weight="duotone" className="text-info flex-shrink-0" />,
  warning: (
    <Warning
      size={18}
      weight="duotone"
      className="text-warning flex-shrink-0"
    />
  ),
};

const TOAST_BORDER: Record<Toast["type"], string> = {
  success: "border-success/30",
  error: "border-error/30",
  info: "border-info/30",
  warning: "border-warning/30",
};

export function ToastSystem() {
  const { toasts, removeToast } = useApp();

  return (
    <div
      className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 bg-card border ${TOAST_BORDER[toast.type]} rounded-xl p-4 animate-slide-in-right`}
          role="alert"
        >
          {TOAST_ICONS[toast.type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{toast.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0 p-0.5"
            aria-label="Dismiss notification"
          >
            <X size={14} weight="duotone" />
          </button>
        </div>
      ))}
    </div>
  );
}
