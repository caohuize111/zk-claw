import hre from "hardhat";

async function main() {
  console.log("=" .repeat(60));
  console.log("ZK-Claw: Verifiable Intelligence Gateway");
  console.log("Full Deployment Script (13 contracts)");
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
  // Phase 1: Core Contracts (7)
  // ============================================
  console.log("\n--- Phase 1: Core Contracts ---\n");

  // 1. Halo2Verifier (EZKL-generated, real ZK proof verification)
  console.log("[1/13] Deploying Halo2Verifier (EZKL, 13 KB)...");
  const Halo2Verifier = await ethers.getContractFactory("Halo2Verifier");
  const halo2Verifier = await Halo2Verifier.deploy();
  await halo2Verifier.waitForDeployment();
  const verifierAddr = await halo2Verifier.getAddress();
  console.log("  Halo2Verifier:", verifierAddr);

  // 2. NFA (BAP-578 full implementation)
  console.log("[2/13] Deploying NFA (BAP-578)...");
  const NFA = await ethers.getContractFactory("NFA");
  const nfa = await NFA.deploy();
  await nfa.waitForDeployment();
  const nfaAddr = await nfa.getAddress();
  console.log("  NFA:", nfaAddr);

  // 3. ValidationRegistry (ERC-8004)
  console.log("[3/13] Deploying ValidationRegistry (ERC-8004)...");
  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validationRegistry = await ValidationRegistry.deploy(nfaAddr);
  await validationRegistry.waitForDeployment();
  const validationAddr = await validationRegistry.getAddress();
  console.log("  ValidationRegistry:", validationAddr);

  // 4. ReputationRegistry (ERC-8004)
  console.log("[4/13] Deploying ReputationRegistry (ERC-8004)...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(nfaAddr);
  await reputationRegistry.waitForDeployment();
  const reputationAddr = await reputationRegistry.getAddress();
  console.log("  ReputationRegistry:", reputationAddr);

  // 5. DePINOracle (Hardware Signature Verification)
  console.log("[5/13] Deploying DePINOracle...");
  const DePINOracle = await ethers.getContractFactory("DePINOracle");
  const depinOracle = await DePINOracle.deploy();
  await depinOracle.waitForDeployment();
  const oracleAddr = await depinOracle.getAddress();
  console.log("  DePINOracle:", oracleAddr);

  // 6. ZKClawGateway
  console.log("[6/13] Deploying ZKClawGateway...");
  const ZKClawGateway = await ethers.getContractFactory("ZKClawGateway");
  const gateway = await ZKClawGateway.deploy(verifierAddr, nfaAddr, validationAddr, oracleAddr);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  console.log("  ZKClawGateway:", gatewayAddr);

  // 7. BatchVerifier
  console.log("[7/13] Deploying BatchVerifier...");
  const BatchVerifier = await ethers.getContractFactory("BatchVerifier");
  const batchVerifier = await BatchVerifier.deploy(verifierAddr, gatewayAddr);
  await batchVerifier.waitForDeployment();
  const batchVerifierAddr = await batchVerifier.getAddress();
  console.log("  BatchVerifier:", batchVerifierAddr);

  // ============================================
  // Phase 2: Agent Infrastructure (4)
  // ============================================
  console.log("\n--- Phase 2: Agent Infrastructure ---\n");

  // 8. AgentPaymaster
  console.log("[8/13] Deploying AgentPaymaster...");
  const AgentPaymaster = await ethers.getContractFactory("AgentPaymaster");
  const paymaster = await AgentPaymaster.deploy();
  await paymaster.waitForDeployment();
  const paymasterAddr = await paymaster.getAddress();
  console.log("  AgentPaymaster:", paymasterAddr);

  // 9. EntryPoint (ERC-4337 simplified)
  console.log("[9/13] Deploying EntryPoint...");
  const EntryPoint = await ethers.getContractFactory("EntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddr = await entryPoint.getAddress();
  console.log("  EntryPoint:", entryPointAddr);

  // 10. ERC6551Registry (Token Bound Accounts)
  console.log("[10/13] Deploying ERC6551Registry...");
  const ERC6551Registry = await ethers.getContractFactory("ERC6551Registry");
  const registry6551 = await ERC6551Registry.deploy();
  await registry6551.waitForDeployment();
  const registry6551Addr = await registry6551.getAddress();
  console.log("  ERC6551Registry:", registry6551Addr);

  // 11. ERC6551Account (TBA implementation)
  console.log("[11/13] Deploying ERC6551Account...");
  const ERC6551Account = await ethers.getContractFactory("ERC6551Account");
  const account6551 = await ERC6551Account.deploy();
  await account6551.waitForDeployment();
  const account6551Addr = await account6551.getAddress();
  console.log("  ERC6551Account:", account6551Addr);

  // ============================================
  // Phase 3: DePIN & Staking (2)
  // ============================================
  console.log("\n--- Phase 3: DePIN & Staking ---\n");

  // 12. StakeSlash
  console.log("[12/13] Deploying StakeSlash...");
  const StakeSlash = await ethers.getContractFactory("StakeSlash");
  const stakeSlash = await StakeSlash.deploy();
  await stakeSlash.waitForDeployment();
  const stakeSlashAddr = await stakeSlash.getAddress();
  console.log("  StakeSlash:", stakeSlashAddr);

  // 13. MultiStationConsensus
  console.log("[13/13] Deploying MultiStationConsensus...");
  const MultiStationConsensus = await ethers.getContractFactory("MultiStationConsensus");
  const consensus = await MultiStationConsensus.deploy(oracleAddr);
  await consensus.waitForDeployment();
  const consensusAddr = await consensus.getAddress();
  console.log("  MultiStationConsensus:", consensusAddr);

  // ============================================
  // Phase 4: Initialize Demo State
  // ============================================
  console.log("\n--- Phase 4: Initialize Demo State ---\n");

  // Set gateway on NFA
  console.log("[1/10] Setting NFA gateway...");
  let tx = await nfa.setGateway(gatewayAddr);
  await tx.wait();
  console.log("  NFA gateway set to:", gatewayAddr);

  // Register weather station
  console.log("[2/10] Registering DePIN weather station (stationId=1001)...");
  tx = await depinOracle.registerStation(1001, deployer.address);
  await tx.wait();
  console.log("  Station 1001 registered, hardware key:", deployer.address);

  // Submit hardware-signed weather data (read nonce from contract for safety)
  console.log("[3/10] Submitting hardware-signed weather data...");
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

  // Mint demo NFA agent (BAP-578 full metadata)
  console.log("[4/10] Minting NFA agent (WeatherGuard-01)...");
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

  // Bind gateway as logic contract
  console.log("[5/10] Binding ZKClawGateway as agent logic...");
  tx = await nfa.setLogicAddress(0, gatewayAddr);
  await tx.wait();
  console.log("  Gateway bound to agent 0");

  // Submit a demo off-chain verified inference
  console.log("[6/10] Submitting demo inference (claim triggered)...");
  // instances where index[5] > index[4] => decision = CLAIM
  const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];
  tx = await gateway.submitOffchainVerified(publicInstances, 0, 1001);
  await tx.wait();
  const profile = await nfa.getProfile(0);
  console.log("  Inference submitted, reputation:", profile.reputationScore.toString());

  // Anchor to Greenfield
  console.log("[7/10] Anchoring proof to Greenfield...");
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

  // Authorize gateway as slasher on StakeSlash
  console.log("[8/10] Authorizing Gateway as slasher on StakeSlash...");
  tx = await stakeSlash.authorizeSlasher(gatewayAddr);
  await tx.wait();
  console.log("  Gateway authorized as slasher");

  // Configure insurance pool
  console.log("[9/10] Setting default insurance payout (0.001 BNB per CLAIM)...");
  tx = await gateway.setDefaultPayout(ethers.parseEther("0.001"));
  await tx.wait();
  console.log("  Default payout set: 0.001 BNB");

  console.log("[10/10] Funding insurance pool (0.05 BNB)...");
  tx = await gateway.fundInsurancePool({ value: ethers.parseEther("0.05") });
  await tx.wait();
  const poolBal = await gateway.insurancePoolBalance();
  console.log("  Insurance pool funded:", ethers.formatEther(poolBal), "BNB");

  // ============================================
  // Summary
  // ============================================
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE -- 13 contracts");
  console.log("=".repeat(60));
  console.log("\n  Core:");
  console.log(`    Halo2Verifier:          ${verifierAddr}`);
  console.log(`    NFA (BAP-578):          ${nfaAddr}`);
  console.log(`    ValidationRegistry:     ${validationAddr}`);
  console.log(`    ReputationRegistry:     ${reputationAddr}`);
  console.log(`    DePINOracle:        ${oracleAddr}`);
  console.log(`    ZKClawGateway:          ${gatewayAddr}`);
  console.log(`    BatchVerifier:          ${batchVerifierAddr}`);
  console.log("\n  Agent Infrastructure:");
  console.log(`    AgentPaymaster:         ${paymasterAddr}`);
  console.log(`    EntryPoint:             ${entryPointAddr}`);
  console.log(`    ERC6551Registry:        ${registry6551Addr}`);
  console.log(`    ERC6551Account:         ${account6551Addr}`);
  console.log("\n  DePIN & Staking:");
  console.log(`    StakeSlash:             ${stakeSlashAddr}`);
  console.log(`    MultiStationConsensus:  ${consensusAddr}`);
  console.log("\n  Demo State:");
  console.log(`    Demo Agent:             tokenId=0 (WeatherGuard-01)`);
  console.log(`    Demo Station:           stationId=1001`);
  console.log(`    Hardware Sig Verified:  ${isAuth}`);
  console.log(`    Reputation Score:       ${profile.reputationScore}`);
  console.log(`    Insurance Pool:         ${ethers.formatEther(poolBal)} BNB`);
  console.log(`    Default Payout:         0.001 BNB per CLAIM`);
  console.log("=".repeat(60));

  // Write addresses to file for frontend
  const addresses = {
    Halo2Verifier: verifierAddr,
    NFA: nfaAddr,
    ValidationRegistry: validationAddr,
    ReputationRegistry: reputationAddr,
    DePINOracle: oracleAddr,
    ZKClawGateway: gatewayAddr,
    BatchVerifier: batchVerifierAddr,
    AgentPaymaster: paymasterAddr,
    EntryPoint: entryPointAddr,
    ERC6551Registry: registry6551Addr,
    ERC6551Account: account6551Addr,
    StakeSlash: stakeSlashAddr,
    MultiStationConsensus: consensusAddr,
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
  DePINOracle: "${oracleAddr}",
  ZKClawGateway: "${gatewayAddr}",
  BatchVerifier: "${batchVerifierAddr}",
  AgentPaymaster: "${paymasterAddr}",
  EntryPoint: "${entryPointAddr}",
  ERC6551Registry: "${registry6551Addr}",
  ERC6551Account: "${account6551Addr}",
  StakeSlash: "${stakeSlashAddr}",
  MultiStationConsensus: "${consensusAddr}",
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
