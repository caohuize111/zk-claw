"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShieldCheck, Home, Wallet, Layers, Bot } from "lucide-react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Agents", icon: Bot },
  { href: "/verify", label: "Verify", icon: ShieldCheck },
  { href: "/paymaster", label: "Paymaster", icon: Wallet },
  { href: "/batch", label: "Batch", icon: Layers },
];

function Logo() {
  return (
    <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center overflow-hidden group-hover:border-primary/50 transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className="relative z-10"
      >
        <path
          d="M12 2L4 6v5c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6L12 2z"
          stroke="hsl(158, 64%, 42%)"
          strokeWidth="1.5"
          fill="hsl(158, 64%, 42%)"
          fillOpacity="0.1"
        />
        <text
          x="12"
          y="14.5"
          textAnchor="middle"
          fontSize="8"
          fontWeight="800"
          fontFamily="monospace"
          fill="hsl(158, 64%, 52%)"
        >
          ZK
        </text>
      </svg>
      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
    </div>
  );
}

function WalletButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => open()}
      className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      {isConnected && address
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : "Connect"}
    </button>
  );
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link href="/" className="flex items-center gap-2.5 cursor-pointer group">
              <Logo />
              <div className="hidden sm:flex flex-col">
                <span className="font-bold text-sm tracking-tight leading-none">
                  ZK-Claw
                </span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5 font-mono">
                  Verifiable AI Gateway
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-1.5 cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
