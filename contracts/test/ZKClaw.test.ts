import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ZK-Claw", () => {
  let ethers: any;
  let gateway: any;
  let mockVerifier: any;
  let nfa: any;
  let validationRegistry: any;
  let depinOracle: any;
  let admin: any;
  let user: any;
  let stationSigner: any;  // simulates hardware TEE key

  before(async () => {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    stationSigner = signers[2];  // this key simulates the sensor's Secure Element

    // Deploy MockVerifier
    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();

    // Deploy MockNFA
    const MockNFA = await ethers.getContractFactory("MockNFA");
    nfa = await MockNFA.deploy();
    await nfa.waitForDeployment();

    // Deploy MockValidationRegistry
    const MockValidationRegistry = await ethers.getContractFactory("MockValidationRegistry");
    validationRegistry = await MockValidationRegistry.deploy();
    await validationRegistry.waitForDeployment();

    // Deploy MockDePINOracle
    const MockDePINOracle = await ethers.getContractFactory("MockDePINOracle");
    depinOracle = await MockDePINOracle.deploy();
    await depinOracle.waitForDeployment();

    // Deploy ZKClawGateway
    const ZKClawGateway = await ethers.getContractFactory("ZKClawGateway");
    gateway = await ZKClawGateway.deploy(
      await mockVerifier.getAddress(),
      await nfa.getAddress(),
      await validationRegistry.getAddress(),
      await depinOracle.getAddress()
    );
    await gateway.waitForDeployment();
  });

  // Helper: sign weather data with station's hardware key
  async function signWeatherData(
    signer: any,
    stationId: number,
    temperature: number,
    humidity: number,
    windSpeed: number,
    rainfall: number
  ): Promise<string> {
    const dataHash = ethers.solidityPackedKeccak256(
      ["uint256", "int256", "uint256", "uint256", "uint256"],
      [stationId, temperature, humidity, windSpeed, rainfall]
    );
    return await signer.signMessage(ethers.getBytes(dataHash));
  }

  describe("MockDePINOracle - Hardware Signature Verification", () => {
    it("should register a station with hardware public key", async () => {
      await depinOracle.registerStation(1001, stationSigner.address);
      assert.equal(await depinOracle.registeredStations(1001), true);
      assert.equal(await depinOracle.stationAddresses(1001), stationSigner.address);
      assert.equal(await depinOracle.getStationCount(), 1n);
    });

    it("should reject station with zero address", async () => {
      await assert.rejects(
        depinOracle.registerStation(1002, ethers.ZeroAddress)
      );
    });

    it("should verify valid hardware signature", async () => {
      const sig = await signWeatherData(stationSigner, 1001, -800, 9800, 12000, 25000);
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);

      const data = await depinOracle.getLatestData(1001);
      assert.equal(data.temperature, -800n);
      assert.equal(data.humidity, 9800n);
      assert.equal(data.signatureVerified, true);
      assert.equal(data.recoveredSigner, stationSigner.address);
    });

    it("should detect invalid signature (wrong signer)", async () => {
      // Sign with admin key instead of station key
      const badSig = await signWeatherData(admin, 1001, 2500, 6000, 1500, 500);
      await depinOracle.submitWeatherData(1001, 2500, 6000, 1500, 500, badSig);

      const data = await depinOracle.getLatestData(1001);
      assert.equal(data.signatureVerified, false);
      assert.notEqual(data.recoveredSigner, stationSigner.address);
    });

    it("should report data authenticity status", async () => {
      // Re-submit with valid signature
      const sig = await signWeatherData(stationSigner, 1001, -800, 9800, 12000, 25000);
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);
      assert.equal(await depinOracle.isDataAuthentic(1001), true);
    });

    it("should reject unregistered station", async () => {
      await assert.rejects(
        depinOracle.submitWeatherData(9999, 0, 0, 0, 0, "0x"),
        /Station not registered/
      );
    });
  });

  describe("MockNFA", () => {
    it("should mint an agent", async () => {
      const metadata = {
        name: "WeatherGuard-01",
        persona: "DePIN Insurance Analyst",
        vaultURI: "ipfs://QmExample",
        vaultHash: ethers.keccak256(ethers.toUtf8Bytes("vault-data"))
      };
      await nfa.mint(metadata);
      assert.equal(await nfa.totalAgents(), 1n);
    });

    it("should set logic address", async () => {
      const gatewayAddr = await gateway.getAddress();
      await nfa.setLogicAddress(0, gatewayAddr);
      assert.equal(await nfa.logicAddresses(0), gatewayAddr);
    });

    it("should return agent metadata", async () => {
      const meta = await nfa.getMetadata(0);
      assert.equal(meta.name, "WeatherGuard-01");
      assert.equal(meta.persona, "DePIN Insurance Analyst");
    });

    it("should return initial profile", async () => {
      const profile = await nfa.getProfile(0);
      assert.equal(profile.totalPredictions, 0n);
      assert.equal(profile.reputationScore, 0n);
    });

    it("should update learning root", async () => {
      const root = ethers.keccak256(ethers.toUtf8Bytes("learning-state-1"));
      await nfa.updateLearningRoot(0, root);
      const profile = await nfa.getProfile(0);
      assert.equal(profile.learningRoot, root);
    });
  });

  describe("MockValidationRegistry", () => {
    it("should create validation request", async () => {
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes("test-request"));
      await validationRegistry.validationRequest(
        admin.address, 0, "test-uri", requestHash
      );
      const count = await validationRegistry.getAgentValidationCount(0);
      assert.equal(count, 1n);
    });

    it("should respond to validation", async () => {
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes("test-request"));
      const responseHash = ethers.keccak256(ethers.toUtf8Bytes("test-response"));
      await validationRegistry.validationResponse(
        requestHash, 95, "response-uri", responseHash, "zkml"
      );
      const status = await validationRegistry.getValidationStatus(requestHash);
      assert.equal(status[2], 95n); // response
      assert.equal(status[3], true); // hasResponse
    });

    it("should reject decreasing response", async () => {
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes("test-request"));
      await assert.rejects(
        validationRegistry.validationResponse(
          requestHash, 50, "uri", ethers.ZeroHash, "zkml"
        ),
        /Response can only increase/
      );
    });

    it("should return summary", async () => {
      const summary = await validationRegistry.getSummary(0, [admin.address], "zkml");
      assert.equal(summary.count, 1n);
      assert.equal(summary.avgResponse, 95n);
    });
  });

  describe("ZKClawGateway", () => {
    it("should submit off-chain verified inference with authenticated data", async () => {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof-1"));
      const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];

      await gateway.submitOffchainVerified(proofHash, publicInstances, 0, 1001, 1);

      assert.equal(await gateway.totalVerifications(), 1n);
      assert.equal(await gateway.totalClaimsTriggered(), 1n);
      assert.equal(await gateway.totalAuthenticated(), 1n);

      const record = await gateway.getRecord(0);
      assert.equal(record.dataAuthentic, true);
    });

    it("should record inference history", async () => {
      const count = await gateway.getAgentRecordCount(0);
      assert.equal(count, 1n);

      const recordIndices = await gateway.getAgentRecords(0);
      const record = await gateway.getRecord(recordIndices[0]);
      assert.equal(record.agentId, 0n);
      assert.equal(record.verified, true);
      assert.equal(record.decision, 1n);
    });

    it("should update NFA reputation on verification", async () => {
      const profile = await nfa.getProfile(0);
      assert.equal(profile.reputationScore, 1n);
      assert.equal(profile.totalPredictions, 1n);
    });

    it("should prevent proof replay", async () => {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof-1"));
      await assert.rejects(
        gateway.submitOffchainVerified(proofHash, [], 0, 1001, 0),
        /Proof already used/
      );
    });

    it("should submit verified inference with mock verifier", async () => {
      const proof = ethers.toUtf8Bytes("fake-proof-data");
      const publicInstances = [100n, 200n, 300n, 400n, 800n, 200n];

      await gateway.submitVerifiedInference(proof, publicInstances, 0, 1001);

      assert.equal(await gateway.totalVerifications(), 2n);
      const record = await gateway.getRecord(1);
      assert.equal(record.verified, true);
      assert.equal(record.decision, 0n); // output0(800) > output1(200) => normal
      assert.equal(record.dataAuthentic, true); // station 1001 has valid sig
    });

    it("should accumulate reputation across verifications", async () => {
      const profile = await nfa.getProfile(0);
      assert.equal(profile.reputationScore, 2n);
    });

    it("should return agent score via gateway", async () => {
      const score = await gateway.getAgentScore(0);
      assert.equal(score, 2n);
    });

    it("should allow admin to update verifier", async () => {
      const zeroAddr = ethers.ZeroAddress;
      await gateway.setVerifier(zeroAddr);
      assert.equal(await gateway.verifier(), zeroAddr);
      // Reset back
      await gateway.setVerifier(await mockVerifier.getAddress());
    });
  });

  describe("Greenfield Storage Anchoring", () => {
    it("should anchor inference record to Greenfield", async () => {
      const uri = "gnfd://zk-claw-bucket/proof-001";
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("proof-data-content"));

      await gateway.anchorToGreenField(0, uri, contentHash);

      assert.equal(await gateway.isAnchored(0), true);
      const anchor = await gateway.getStorageAnchor(0);
      assert.equal(anchor.greenFieldURI, uri);
      assert.equal(anchor.contentHash, contentHash);
    });

    it("should reject anchoring non-existent record", async () => {
      await assert.rejects(
        gateway.anchorToGreenField(999, "gnfd://test", ethers.ZeroHash),
        /Record does not exist/
      );
    });

    it("should reject empty URI", async () => {
      await assert.rejects(
        gateway.anchorToGreenField(0, "", ethers.ZeroHash),
        /Empty URI/
      );
    });

    it("should report un-anchored records", async () => {
      assert.equal(await gateway.isAnchored(1), false);
    });
  });

  describe("Halo2Verifier - Real EZKL ZK Proof Verification", () => {
    let halo2Verifier: any;

    before(async () => {
      const Halo2Verifier = await ethers.getContractFactory("Halo2Verifier");
      halo2Verifier = await Halo2Verifier.deploy();
      await halo2Verifier.waitForDeployment();
    });

    it("should verify a real EZKL proof on-chain", async () => {
      // Load proof.json generated by the EZKL pipeline
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

      const hexProof = proofData.hex_proof;
      const rawInstances = proofData.instances[0]; // first instance set

      // Convert EZKL little-endian field elements to uint256
      const instances = rawInstances.map((inst: string) => {
        const buf = Buffer.from(inst, "hex");
        // Reverse bytes (little-endian to big-endian)
        const be = Buffer.from(buf).reverse();
        return BigInt("0x" + be.toString("hex"));
      });

      // Use staticCall because verifyProof is non-view (EZKL generates it as `public`)
      const result = await halo2Verifier.verifyProof.staticCall(hexProof, instances);
      assert.equal(result, true, "Real EZKL proof should verify on-chain");
    });

    it("should reject a tampered proof", async () => {
      // Load real proof, then flip a byte
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

      // Tamper: flip one byte in the proof
      const tampered = proofData.hex_proof.slice(0, 10) + "ff" + proofData.hex_proof.slice(12);
      const instances = proofData.instances[0].map((inst: string) => {
        const buf = Buffer.from(inst, "hex");
        const be = Buffer.from(buf).reverse();
        return BigInt("0x" + be.toString("hex"));
      });

      // Should revert (invalid proof)
      await assert.rejects(
        halo2Verifier.verifyProof(tampered, instances),
        "Tampered proof should be rejected"
      );
    });

    it("should reject proof with wrong instances", async () => {
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

      const hexProof = proofData.hex_proof;
      // Use wrong instances (all zeros)
      const wrongInstances = [0n, 0n, 0n, 0n, 0n, 0n];

      await assert.rejects(
        halo2Verifier.verifyProof(hexProof, wrongInstances),
        "Proof with wrong instances should be rejected"
      );
    });

    it("should work end-to-end: Gateway with real Halo2Verifier", async () => {
      // Point gateway to real verifier
      await gateway.setVerifier(await halo2Verifier.getAddress());

      // Load real proof
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      const hexProof = proofData.hex_proof;
      const instances = proofData.instances[0].map((inst: string) => {
        const buf = Buffer.from(inst, "hex");
        const be = Buffer.from(buf).reverse();
        return BigInt("0x" + be.toString("hex"));
      });

      // Submit through gateway with real proof
      const tx = await gateway.submitVerifiedInference(hexProof, instances, 0, 1001);
      await tx.wait();

      // Check the record was verified by the REAL Halo2 verifier
      const totalRec = await gateway.totalRecords();
      const record = await gateway.getRecord(totalRec - 1n);
      assert.equal(record.verified, true, "Record should be verified by real Halo2Verifier");

      // Restore mock verifier for other tests
      await gateway.setVerifier(await mockVerifier.getAddress());
    });
  });

  describe("Integration: Full Flow with Dual Trust + Greenfield", () => {
    it("should run complete DePIN -> Hardware Sig -> ZKML -> NFA -> Greenfield flow", async () => {
      // 1. Register new station with hardware key
      await depinOracle.registerStation(2001, stationSigner.address);

      // 2. Submit hardware-signed weather data (extreme conditions)
      const sig = await signWeatherData(stationSigner, 2001, -1000, 9900, 13000, 28000);
      await depinOracle.submitWeatherData(2001, -1000, 9900, 13000, 28000, sig);

      // Verify hardware authentication
      assert.equal(await depinOracle.isDataAuthentic(2001), true);

      // 3. Mint new agent
      await nfa.mint({
        name: "StormWatcher-01",
        persona: "Extreme Weather Insurance Agent",
        vaultURI: "gnfd://zk-claw-bucket/agent-storm-01",
        vaultHash: ethers.keccak256(ethers.toUtf8Bytes("storm-vault"))
      });
      const agentId = 1; // second agent

      // 4. Bind gateway as logic
      await nfa.setLogicAddress(agentId, await gateway.getAddress());

      // 5. Submit verified inference (claim triggered)
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("storm-proof"));
      await gateway.submitOffchainVerified(
        proofHash, [100n, 200n, 300n, 400n, 500n, 600n], agentId, 2001, 1
      );

      // 6. Verify dual trust: ZK verified + data authenticated
      const recordIndex = (await gateway.totalRecords()) - 1n;
      const record = await gateway.getRecord(recordIndex);
      assert.equal(record.verified, true);
      assert.equal(record.dataAuthentic, true);
      assert.equal(record.decision, 1n);

      // 7. Verify NFA reputation updated
      const profile = await nfa.getProfile(agentId);
      assert.equal(profile.reputationScore, 1n);

      // 8. Anchor to Greenfield
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(
        JSON.stringify({ proof: "storm-proof", weather: { temp: -10, wind: 130 } })
      ));
      await gateway.anchorToGreenField(
        recordIndex,
        "gnfd://zk-claw-bucket/storm-proof-001",
        contentHash
      );
      assert.equal(await gateway.isAnchored(recordIndex), true);

      // 9. Final stats
      const totalV = await gateway.totalVerifications();
      const totalC = await gateway.totalClaimsTriggered();
      const totalA = await gateway.totalAuthenticated();
      assert.ok(totalV >= 3n, `totalVerifications should be >= 3, got ${totalV}`);
      assert.ok(totalC >= 2n, `totalClaimsTriggered should be >= 2, got ${totalC}`);
      assert.ok(totalA >= 2n, `totalAuthenticated should be >= 2, got ${totalA}`);
    });
  });
});
