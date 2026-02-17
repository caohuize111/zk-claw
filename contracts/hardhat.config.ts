import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";

export default defineConfig({
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,  // minimize bytecode (Halo2Verifier is large)
      },
      // viaIR disabled: EZKL Halo2Verifier uses deep assembly stacks
      // that exceed the Yul optimizer's stack depth limit
    },
  },
  plugins: [hardhatEthers, hardhatNetworkHelpers, hardhatNodeTestRunner],
  networks: {
    opbnbTestnet: {
      type: "http",
      url: "https://opbnb-testnet-rpc.bnbchain.org",
      chainId: 5611,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    bscTestnet: {
      type: "http",
      url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
});
