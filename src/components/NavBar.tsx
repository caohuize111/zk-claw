"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ShieldCheck, Home, Wallet, Layers, Bot } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Agents", icon: Bot },
  { href: "/verify", label: "Verify", icon: ShieldCheck },
  { href: "/paymaster", label: "Paymaster", icon: Wallet },
  { href: "/batch", label: "Batch", icon: Layers },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link href="/" className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center transition-all duration-200 group-hover:bg-primary/15 group-hover:border-primary/50 group-hover:shadow-[0_0_12px_-4px_hsl(var(--primary)/0.3)]">
                <span className="text-primary font-bold text-xs font-mono tracking-wider">ZK</span>
              </div>
              <span className="font-semibold text-base tracking-tight hidden sm:inline">
                ZK-Claw
              </span>
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
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </div>
    </nav>
  );
}
