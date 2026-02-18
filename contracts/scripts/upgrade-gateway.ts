import hre from "hardhat";

/**
 * Upgrade: redeploy ZKClawGateway (insurance pool) + BatchVerifier,
 * reuse all other 11 existing contracts, re-run ALL initialization steps.
 */
async function main() {
  console.log("=".repeat(60));
  console.log("ZK-Claw: Gateway Upgrade (Insurance Pool)");
  console.log("=".repeat(60));

  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");

  // Existing contract addresses (11 unchanged contracts)
  const EXISTING = {
    Halo2Verifier: "0x10856505E1994E6F7311e840832029794Dae1Eaf",
    NFA: "0x7a156F9EA76B48845Fa538566bF9861D3cc75b9A",
    ValidationRegistry: "0x73a9d57774D2fD05Bc36bbF344cDC58c57319171",
    ReputationRegistry: "0xa1a3FA071d3f3D483423698BfAbAA7DDa6029df5",
    DePINOracle: "0x4A9e141e1241071F2253C3f7516052443386bD8A",
    AgentPaymaster: "0xc34A1055889Ca51BA0AE8f37Fdb7Fd650198E6BD",
    EntryPoint: "0x7Df57eF18b1B3d1F0e39Cd0ec6ED58ef8772fa06",
    ERC6551Registry: "0x1e5EF95fBa9148bE6F8EAb356E669e0E5Aa3Bf00",
    ERC6551Account: "0x8d42525C6802a78D9D5cbbCC560650e612239916",
    StakeSlash: "0x2D0E59557c2f85422129eD66b38ec6A1e9b14593",
    MultiStationConsensus: "0xA3aA4A658C9e7B8B3e0a6bf2CE0213320CCBE0bd",
  };

  // ============================================
  // Phase 1: Deploy new contracts (2)
  // ============================================
  console.log("\n--- Phase 1: Deploy New Contracts ---\n");

  console.log("[1/2] Deploying new ZKClawGateway (with insurance pool)...");
  const ZKClawGateway = await ethers.getContractFactory("ZKClawGateway");
  const gateway = await ZKClawGateway.deploy(
    EXISTING.Halo2Verifier,
    EXISTING.NFA,
    EXISTING.ValidationRegistry,
    EXISTING.DePINOracle
  );
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  console.log("  New ZKClawGateway:", gatewayAddr);

  console.log("[2/2] Deploying new BatchVerifier...");
  const BatchVerifier = await ethers.getContractFactory("BatchVerifier");
  const batchVerifier = await BatchVerifier.deploy(EXISTING.Halo2Verifier, gatewayAddr);
  await batchVerifier.waitForDeployment();
  const batchVerifierAddr = await batchVerifier.getAddress();
  console.log("  New BatchVerifier:", batchVerifierAddr);

  // ============================================
  // Phase 2: Re-initialize ALL state (same as full deploy Phase 4)
  // ============================================
  console.log("\n--- Phase 2: Re-initialize All State ---\n");

  // Get contract references
  const nfa = await ethers.getContractAt("NFA", EXISTING.NFA);
  const depinOracle = await ethers.getContractAt("DePINOracle", EXISTING.DePINOracle);
  const stakeSlash = await ethers.getContractAt("StakeSlash", EXISTING.StakeSlash);

  // 1. Set gateway on NFA
  console.log("[1/10] Setting NFA gateway to new address...");
  let tx = await nfa.setGateway(gatewayAddr);
  await tx.wait();
  console.log("  NFA gateway set to:", gatewayAddr);

  // 2. Bind gateway as logic contract for agent 0
  console.log("[2/10] Binding new Gateway as agent 0 logic...");
  tx = await nfa.setLogicAddress(0, gatewayAddr);
  await tx.wait();
  console.log("  Gateway bound to agent 0");

  // 3. Submit fresh hardware-signed weather data
  console.log("[3/10] Submitting fresh hardware-signed weather data...");
  const currentNonce = await depinOracle.stationNonces(1001);
  const dataHash = ethers.solidityPackedKeccak256(
    ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
    [1001, -800, 9800, 12000, 25000, currentNonce]
  );
  const signature = await deployer.signMessage(ethers.getBytes(dataHash));
  tx = await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, signature);
  await tx.wait();
  const isAuth = await depinOracle.isDataAuthentic(1001);
  console.log("  Weather data submitted, signature verified:", isAuth);

  // 4. Submit demo inference (CLAIM decision)
  console.log("[4/10] Submitting demo inference (claim triggered)...");
  const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];
  tx = await gateway.submitOffchainVerified(publicInstances, 0, 1001);
  await tx.wait();
  const profile = await nfa.getProfile(0);
  console.log("  Inference submitted, reputation:", profile.reputationScore.toString());

  // 5. Anchor to Greenfield
  console.log("[5/10] Anchoring proof to Greenfield...");
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(
    JSON.stringify({
      proof: "demo-proof-extreme-weather",
      station: 1001,
      weather: { temp: -8.0, humidity: 98, wind: 120, rainfall: 250 },
      decision: "CLAIM_TRIGGERED",
      model: "WeatherClaimMLP-v1"
    })
  ));
  tx = await gateway.anchorToGreenField(
    0,
    "gnfd://zk-claw-bucket/proof-demo-001",
    contentHash
  );
  await tx.wait();
  console.log("  Proof anchored to gnfd://zk-claw-bucket/proof-demo-001");

  // 6. Authorize gateway as slasher on StakeSlash
  console.log("[6/10] Authorizing new Gateway as slasher on StakeSlash...");
  tx = await stakeSlash.authorizeSlasher(gatewayAddr);
  await tx.wait();
  console.log("  Gateway authorized as slasher");

  // 7. Set BatchVerifier on new Gateway
  console.log("[7/10] Setting BatchVerifier on new Gateway...");
  tx = await gateway.setBatchVerifier(batchVerifierAddr);
  await tx.wait();
  console.log("  BatchVerifier set:", batchVerifierAddr);

  // 8. Configure default insurance payout
  console.log("[8/10] Setting default insurance payout (0.001 BNB per CLAIM)...");
  tx = await gateway.setDefaultPayout(ethers.parseEther("0.001"));
  await tx.wait();
  console.log("  Default payout set: 0.001 BNB");

  // 9. Fund insurance pool
  console.log("[9/10] Funding insurance pool (0.05 BNB)...");
  tx = await gateway.fundInsurancePool({ value: ethers.parseEther("0.05") });
  await tx.wait();
  const poolBal = await gateway.insurancePoolBalance();
  console.log("  Insurance pool funded:", ethers.formatEther(poolBal), "BNB");

  // 10. Verify final state
  console.log("[10/10] Verifying final state...");
  const defaultPayout = await gateway.defaultPayoutAmount();
  const totalRecords = await gateway.totalRecords();
  const totalVerifications = await gateway.totalVerifications();
  console.log("  Default payout:", ethers.formatEther(defaultPayout), "BNB");
  console.log("  Total records:", totalRecords.toString());
  console.log("  Total verifications:", totalVerifications.toString());
  console.log("  Insurance pool:", ethers.formatEther(poolBal), "BNB");

  // ============================================
  // Summary
  // ============================================
  console.log("\n" + "=".repeat(60));
  console.log("UPGRADE COMPLETE");
  console.log("=".repeat(60));
  console.log("\n  Updated Contracts:");
  console.log(`    ZKClawGateway:    ${gatewayAddr}`);
  console.log(`    BatchVerifier:    ${batchVerifierAddr}`);
  console.log("\n  Unchanged Contracts (11):");
  for (const [name, addr] of Object.entries(EXISTING)) {
    console.log(`    ${name.padEnd(22)} ${addr}`);
  }
  console.log("\n  Demo State:");
  console.log(`    Agent 0 Reputation:   ${profile.reputationScore}`);
  console.log(`    Hardware Sig Verified: ${isAuth}`);
  console.log(`    Insurance Pool:        ${ethers.formatEther(poolBal)} BNB`);
  console.log(`    Default Payout:        0.001 BNB per CLAIM`);
  console.log("=".repeat(60));

  // ============================================
  // Update config files
  // ============================================

  const fs = await import("fs");

  // Update deployed-addresses.json
  const addrPath = "deployed-addresses.json";
  const existing = JSON.parse(fs.readFileSync(addrPath, "utf8"));
  existing.ZKClawGateway = gatewayAddr;
  existing.BatchVerifier = batchVerifierAddr;
  existing.timestamp = new Date().toISOString();
  existing.insurancePool = {
    balance: ethers.formatEther(poolBal),
    defaultPayout: "0.001",
  };
  fs.writeFileSync(addrPath, JSON.stringify(existing, null, 2));
  console.log(`\nUpdated ${addrPath}`);

  // Update frontend contract-addresses.ts
  const frontendConfig = `// Auto-generated by upgrade-gateway.ts -- ${new Date().toISOString()}
// Network: BSC Testnet (chainId: 97)
// Upgrade: ZKClawGateway + BatchVerifier (insurance pool)
export const CONTRACTS = {
  Halo2Verifier: "${EXISTING.Halo2Verifier}",
  NFA: "${EXISTING.NFA}",
  ValidationRegistry: "${EXISTING.ValidationRegistry}",
  ReputationRegistry: "${EXISTING.ReputationRegistry}",
  DePINOracle: "${EXISTING.DePINOracle}",
  ZKClawGateway: "${gatewayAddr}",
  BatchVerifier: "${batchVerifierAddr}",
  AgentPaymaster: "${EXISTING.AgentPaymaster}",
  EntryPoint: "${EXISTING.EntryPoint}",
  ERC6551Registry: "${EXISTING.ERC6551Registry}",
  ERC6551Account: "${EXISTING.ERC6551Account}",
  StakeSlash: "${EXISTING.StakeSlash}",
  MultiStationConsensus: "${EXISTING.MultiStationConsensus}",
} as const;

export const IS_DEPLOYED = true;
`;
  const configPath = "../src/lib/contract-addresses.ts";
  fs.writeFileSync(configPath, frontendConfig);
  console.log(`Updated ${configPath}`);

  // Update bsc.address
  const bscAddress = `# ZK-Claw Deployed Contract Addresses (BSC Testnet)
# Upgraded: ${new Date().toISOString()}
# Chain ID: 97

## Core Verification
Halo2Verifier:          ${EXISTING.Halo2Verifier}
NFA (BAP-578):          ${EXISTING.NFA}
ValidationRegistry:     ${EXISTING.ValidationRegistry}
ReputationRegistry:     ${EXISTING.ReputationRegistry}
DePINOracle:            ${EXISTING.DePINOracle}
ZKClawGateway:          ${gatewayAddr}
BatchVerifier:          ${batchVerifierAddr}

## Agent Infrastructure
AgentPaymaster:         ${EXISTING.AgentPaymaster}
EntryPoint:             ${EXISTING.EntryPoint}
ERC6551Registry:        ${EXISTING.ERC6551Registry}
ERC6551Account:         ${EXISTING.ERC6551Account}

## DePIN & Staking
StakeSlash:             ${EXISTING.StakeSlash}
MultiStationConsensus:  ${EXISTING.MultiStationConsensus}

## Insurance Pool
Default Payout:         0.001 BNB per CLAIM
Pool Balance:           ${ethers.formatEther(poolBal)} BNB

## Demo State
Agent 0:                WeatherGuard-01
Station 1001:           Hardware-signed weather data
Deployer:               ${deployer.address}
`;
  fs.writeFileSync("../bsc.address", bscAddress);
  console.log(`Updated ../bsc.address`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
