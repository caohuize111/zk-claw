import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { bscTestnet } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "ZK-Claw",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "21fef48091f12692cad574a6f7753643",
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http("https://data-seed-prebsc-1-s1.bnbchain.org:8545/"),
  },
  ssr: true,
});

// Contract addresses - BSC Testnet (deployed 2026-02-17)
export const CONTRACTS = {
  MockVerifier: "0x319729205CfBFd9CD1e8130Ed9D342542e310386",
  MockNFA: "0x9B83Bb788B4f96cA8c377EAFC5610502140214d1",
  MockValidationRegistry: "0x7f54dA182693394Ff0Bf77479e6d7b9003cf8f25",
  MockDePINOracle: "0xed7B5A8fc0249BdfB70363C083Ea828976eDFe89",
  ZKClawGateway: "0xae765e473f5549607093B1685e3199Bd6f0AD058",
} as const;

export const IS_DEPLOYED = true;
