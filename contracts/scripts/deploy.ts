import hre from "hardhat";

async function main() {
  console.log("=" .repeat(60));
  console.log("ZK-Claw: Verifiable Intelligence Gateway");
  console.log("Deployment Script");
  console.log("=" .repeat(60));

  // Hardhat v3: ethers via network connection
  const connection = await hre.network.connect();
  const ethers = connection.ethers;

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");

  if (balance === 0n) {
    console.error("\nERROR: Deployer has 0 balance. Get tBNB from faucet first.");
    process.exit(1);
  }

  // ============================================
  // Phase 1: Deploy Contracts
  // ============================================
  console.log("\n--- Phase 1: Deploy Contracts ---\n");

  // 1. Halo2Verifier (EZKL-generated, real ZK proof verification)
  console.log("[1/7] Deploying Halo2Verifier (EZKL, 13 KB)...");
  const Halo2Verifier = await ethers.getContractFactory("Halo2Verifier");
  const halo2Verifier = await Halo2Verifier.deploy();
  await halo2Verifier.waitForDeployment();
  const verifierAddr = await halo2Verifier.getAddress();
  console.log("  Halo2Verifier:", verifierAddr);

  // 2. NFA (BAP-578 full implementation)
  console.log("[2/7] Deploying NFA (BAP-578)...");
  const NFA = await ethers.getContractFactory("NFA");
  const nfa = await NFA.deploy();
  await nfa.waitForDeployment();
  const nfaAddr = await nfa.getAddress();
  console.log("  NFA:", nfaAddr);

  // 3. ValidationRegistry (ERC-8004)
  console.log("[3/7] Deploying ValidationRegistry (ERC-8004)...");
  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validationRegistry = await ValidationRegistry.deploy(nfaAddr);
  await validationRegistry.waitForDeployment();
  const validationAddr = await validationRegistry.getAddress();
  console.log("  ValidationRegistry:", validationAddr);

  // 4. ReputationRegistry (ERC-8004)
  console.log("[4/7] Deploying ReputationRegistry (ERC-8004)...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(nfaAddr);
  await reputationRegistry.waitForDeployment();
  const reputationAddr = await reputationRegistry.getAddress();
  console.log("  ReputationRegistry:", reputationAddr);

  // 5. MockDePINOracle (Hardware Signature Verification)
  console.log("[5/7] Deploying MockDePINOracle...");
  const MockDePINOracle = await ethers.getContractFactory("MockDePINOracle");
  const depinOracle = await MockDePINOracle.deploy();
  await depinOracle.waitForDeployment();
  const oracleAddr = await depinOracle.getAddress();
  console.log("  MockDePINOracle:", oracleAddr);

  // 6. ZKClawGateway
  console.log("[6/7] Deploying ZKClawGateway...");
  const ZKClawGateway = await ethers.getContractFactory("ZKClawGateway");
  const gateway = await ZKClawGateway.deploy(verifierAddr, nfaAddr, validationAddr, oracleAddr);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  console.log("  ZKClawGateway:", gatewayAddr);

  // ============================================
  // Phase 2: Initialize Demo State
  // ============================================
  console.log("\n--- Phase 2: Initialize Demo State ---\n");

  // Register weather station
  console.log("[1/6] Registering DePIN weather station (stationId=1001)...");
  let tx = await depinOracle.registerStation(1001, deployer.address);
  await tx.wait();
  console.log("  Station 1001 registered, hardware key:", deployer.address);

  // Submit hardware-signed weather data
  console.log("[2/6] Submitting hardware-signed weather data...");
  const dataHash = ethers.solidityPackedKeccak256(
    ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
    [1001, -800, 9800, 12000, 25000, 0]  // nonce=0 for first submission
  );
  const signature = await deployer.signMessage(ethers.getBytes(dataHash));
  tx = await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, signature);
  await tx.wait();
  const isAuth = await depinOracle.isDataAuthentic(1001);
  console.log("  Weather data submitted, signature verified:", isAuth);

  // Mint demo NFA agent (BAP-578 full metadata)
  console.log("[3/6] Minting NFA agent (WeatherGuard-01)...");
  tx = await nfa.mint({
    name: "WeatherGuard-01",
    persona: "DePIN Insurance Analyst -- Verifiable AI Agent",
    voiceHash: ethers.keccak256(ethers.toUtf8Bytes("weatherguard-voice-v1")),
    animationURI: "",
    vaultURI: "gnfd://zk-claw-bucket/agent-weatherguard-01",
    vaultHash: ethers.keccak256(ethers.toUtf8Bytes("weatherguard-vault-v1")),
    avatarId: 1,
  });
  await tx.wait();
  console.log("  Agent minted: tokenId=0");

  // Set gateway on NFA
  console.log("[4/7] Setting NFA gateway...");
  await nfa.setGateway(gatewayAddr);
  console.log("  NFA gateway set to:", gatewayAddr);

  // Bind gateway as logic contract
  console.log("[5/7] Binding ZKClawGateway as agent logic...");
  tx = await nfa.setLogicAddress(0, gatewayAddr);
  await tx.wait();
  console.log("  Gateway bound to agent 0");

  // Submit a demo off-chain verified inference
  console.log("[6/7] Submitting demo inference (claim triggered)...");
  // instances where index[5] > index[4] => decision = CLAIM
  const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];
  tx = await gateway.submitOffchainVerified(publicInstances, 0, 1001);
  await tx.wait();
  const profile = await nfa.getProfile(0);
  console.log("  Inference submitted, reputation:", profile.reputationScore.toString());

  // Anchor to Greenfield
  console.log("[7/7] Anchoring proof to Greenfield...");
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

  // ============================================
  // Summary
  // ============================================
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Network:                ${hre.network.name}`);
  console.log(`  Halo2Verifier:          ${verifierAddr}`);
  console.log(`  NFA (BAP-578):          ${nfaAddr}`);
  console.log(`  ValidationRegistry:     ${validationAddr}`);
  console.log(`  ReputationRegistry:     ${reputationAddr}`);
  console.log(`  MockDePINOracle:        ${oracleAddr}`);
  console.log(`  ZKClawGateway:          ${gatewayAddr}`);
  console.log("---");
  console.log(`  Demo Agent:             tokenId=0 (WeatherGuard-01)`);
  console.log(`  Demo Station:           stationId=1001`);
  console.log(`  Hardware Sig Verified:  ${isAuth}`);
  console.log(`  Reputation Score:       ${profile.reputationScore}`);
  console.log(`  Greenfield Anchored:    true`);
  console.log("=".repeat(60));

  // Write addresses to file for frontend
  const addresses = {
    Halo2Verifier: verifierAddr,
    NFA: nfaAddr,
    ValidationRegistry: validationAddr,
    ReputationRegistry: reputationAddr,
    MockDePINOracle: oracleAddr,
    ZKClawGateway: gatewayAddr,
    network: hre.network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    demoAgent: { tokenId: 0, name: "WeatherGuard-01" },
    demoStation: { stationId: 1001, hardwareKey: deployer.address },
    timestamp: new Date().toISOString(),
  };

  const fs = await import("fs");
  const addressPath = "deployed-addresses.json";
  fs.writeFileSync(addressPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses saved to ${addressPath}`);

  // Also write a frontend-ready config snippet
  const frontendConfig = `// Auto-generated by deploy.ts -- ${new Date().toISOString()}
// Network: ${hre.network.name} (chainId: ${addresses.chainId})
export const CONTRACTS = {
  Halo2Verifier: "${verifierAddr}",
  NFA: "${nfaAddr}",
  ValidationRegistry: "${validationAddr}",
  ReputationRegistry: "${reputationAddr}",
  MockDePINOracle: "${oracleAddr}",
  ZKClawGateway: "${gatewayAddr}",
} as const;

export const IS_DEPLOYED = true;
`;
  const configPath = "../src/lib/contract-addresses.ts";
  fs.writeFileSync(configPath, frontendConfig);
  console.log(`Frontend config saved to ${configPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
