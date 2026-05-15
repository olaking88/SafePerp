import React from "react";
import { useApp } from "../context/AppContext";
import { Plus } from "@phosphor-icons/react";

export function MobileFAB() {
  const { setActiveTab, activeTab } = useApp();

  if (activeTab === "trade") return null;

  return (
    <button
      onClick={() => setActiveTab("trade")}
      className="fixed bottom-20 right-4 z-40 md:hidden w-14 h-14 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer"
      aria-label="Open new position"
    >
      <Plus size={24} weight="duotone" />
    </button>
  );
}
