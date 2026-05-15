import React from "react";
import { useApp } from "../context/AppContext";
import { Globe, GithubLogo, BookOpen, FileText } from "@phosphor-icons/react";

export function Footer() {
  const { network } = useApp();

  return (
    <footer className="border-t border-border bg-background" role="contentinfo">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground font-mono">
            v0.1.0-alpha
          </span>
          <div
            className={`flex items-center gap-1.5 text-xs font-medium ${network === "Mainnet" ? "text-success" : "text-warning"}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${network === "Mainnet" ? "bg-success" : "bg-warning"}`}
            />
            {network}
          </div>
        </div>

        <nav className="flex items-center gap-1" aria-label="Footer navigation">
          <a
            href="#"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-white/5"
            aria-label="Documentation"
          >
            <BookOpen size={14} weight="duotone" />
            <span className="hidden sm:block">Docs</span>
          </a>
          <a
            href="#"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-white/5"
            aria-label="GitHub repository"
          >
            <GithubLogo size={14} weight="duotone" />
            <span className="hidden sm:block">GitHub</span>
          </a>
          <a
            href="#"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-white/5"
            aria-label="Privacy whitepaper"
          >
            <FileText size={14} weight="duotone" />
            <span className="hidden sm:block">Privacy Whitepaper</span>
          </a>
        </nav>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Globe size={14} weight="duotone" />
          <span className="hidden sm:block">Built on Solana + Arcium</span>
        </div>
      </div>
    </footer>
  );
}
