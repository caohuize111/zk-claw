import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { bscTestnet } from "wagmi/chains";

// Re-export from server-safe module
export { CONTRACTS, IS_DEPLOYED } from "./contract-addresses";

export const config = getDefaultConfig({
  appName: "ZK-Claw",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "21fef48091f12692cad574a6f7753643",
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http("https://data-seed-prebsc-1-s1.bnbchain.org:8545/"),
  },
  ssr: true,
});
