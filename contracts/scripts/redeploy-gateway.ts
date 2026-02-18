import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Existing contract addresses (unchanged)
  const verifierAddr = "0x10856505E1994E6F7311e840832029794Dae1Eaf";
  const nfaAddr = "0x7a156F9EA76B48845Fa538566bF9861D3cc75b9A";
  const validationAddr = "0x73a9d57774D2fD05Bc36bbF344cDC58c57319171";
  const oracleAddr = "0x4A9e141e1241071F2253C3f7516052443386bD8A";

  // 1. Deploy new ZKClawGateway (submitOffchainVerified is now permissionless)
  console.log("\n[1/5] Deploying new ZKClawGateway...");
  const ZKClawGateway = await ethers.getContractFactory("ZKClawGateway");
  const gateway = await ZKClawGateway.deploy(verifierAddr, nfaAddr, validationAddr, oracleAddr);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  console.log("  New ZKClawGateway:", gatewayAddr);

  // 2. Update NFA gateway pointer
  console.log("[2/5] Setting NFA gateway to new address...");
  const nfa = await ethers.getContractAt("NFA", nfaAddr);
  let tx = await nfa.setGateway(gatewayAddr);
  await tx.wait();
  console.log("  NFA gateway updated");

  // 3. Re-submit demo inference
  console.log("[3/5] Submitting demo inference...");
  const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];
  tx = await gateway.submitOffchainVerified(publicInstances, 0, 1001);
  await tx.wait();
  console.log("  Demo inference submitted");

  // 4. Re-anchor Greenfield
  console.log("[4/5] Anchoring proof to Greenfield...");
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
  console.log("  Proof anchored");

  // 5. Deploy new BatchVerifier pointing to new gateway
  console.log("[5/5] Deploying new BatchVerifier...");
  const BatchVerifier = await ethers.getContractFactory("BatchVerifier");
  const batchVerifier = await BatchVerifier.deploy(verifierAddr, gatewayAddr);
  await batchVerifier.waitForDeployment();
  const batchVerifierAddr = await batchVerifier.getAddress();
  console.log("  New BatchVerifier:", batchVerifierAddr);

  // Authorize gateway as slasher
  const stakeSlashAddr = "0x2D0E59557c2f85422129eD66b38ec6A1e9b14593";
  const stakeSlash = await ethers.getContractAt("StakeSlash", stakeSlashAddr);
  tx = await stakeSlash.authorizeSlasher(gatewayAddr);
  await tx.wait();
  console.log("  Gateway authorized as slasher");

  console.log("\n=== DONE ===");
  console.log("New ZKClawGateway:", gatewayAddr);
  console.log("New BatchVerifier:", batchVerifierAddr);
  console.log("\nUpdate these in frontend contract-addresses.ts and bsc.address");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
