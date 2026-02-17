import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bscTestnet } from "@reown/appkit/networks";

// Re-export from server-safe module
export { CONTRACTS, IS_DEPLOYED } from "./contract-addresses";

export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "2d30e0534ed9410df96ea26937766c6a";

export const networks = [bscTestnet];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: true,
});

export const config = wagmiAdapter.wagmiConfig;
