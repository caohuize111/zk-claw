// Contract addresses - BSC Testnet (deployed 2026-02-17)
// Separated from wagmi-config to allow server-side imports
export const CONTRACTS = {
  Halo2Verifier: "0x319729205CfBFd9CD1e8130Ed9D342542e310386", // will be updated after redeploy
  MockNFA: "0x9B83Bb788B4f96cA8c377EAFC5610502140214d1",
  MockValidationRegistry: "0x7f54dA182693394Ff0Bf77479e6d7b9003cf8f25",
  MockDePINOracle: "0xed7B5A8fc0249BdfB70363C083Ea828976eDFe89",
  ZKClawGateway: "0xae765e473f5549607093B1685e3199Bd6f0AD058",
} as const;

export const IS_DEPLOYED = true;
