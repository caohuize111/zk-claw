"use client";

import { createAppKit } from "@reown/appkit/react";
import { bscTestnet } from "@reown/appkit/networks";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiAdapter, projectId } from "@/lib/wagmi-config";
import { ReactNode, useState } from "react";

const metadata = {
  name: "ZK-Claw",
  description: "Verifiable Intelligence Gateway for AI Agents on BNB Chain",
  url: "https://zk-claw.vercel.app",
  icons: ["/favicon.ico"],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [bscTestnet],
  metadata,
  themeMode: "dark",
  themeVariables: {
    "--w3m-font-family": "'DM Sans', 'Inter', sans-serif",
    "--w3m-accent": "#27a76d",
    "--w3m-color-mix": "#141210",
    "--w3m-color-mix-strength": 20,
    "--w3m-border-radius-master": "2px",
    "--w3m-z-index": 1000,
  },
  features: {
    analytics: false,
  },
});

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
