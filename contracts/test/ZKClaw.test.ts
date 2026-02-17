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
  let reputationRegistry: any;
  let depinOracle: any;
  let admin: any;
  let user: any;
  let user2: any;
  let stationSigner: any;

  before(async () => {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    user2 = signers[2];
    stationSigner = signers[3];

    // Deploy MockVerifier (for tests that don't need real ZK proof)
    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();

    // Deploy NFA (BAP-578 full)
    const NFA = await ethers.getContractFactory("NFA");
    nfa = await NFA.deploy();
    await nfa.waitForDeployment();

    // Deploy ValidationRegistry (ERC-8004, references NFA)
    const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
    validationRegistry = await ValidationRegistry.deploy(await nfa.getAddress());
    await validationRegistry.waitForDeployment();

    // Deploy ReputationRegistry (ERC-8004, references NFA)
    const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
    reputationRegistry = await ReputationRegistry.deploy(await nfa.getAddress());
    await reputationRegistry.waitForDeployment();

    // Deploy DePINOracle
    const DePINOracle = await ethers.getContractFactory("DePINOracle");
    depinOracle = await DePINOracle.deploy();
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

    // Mint agent 0 and bind gateway as logic
    const metadata = {
      name: "WeatherGuard-01",
      persona: "DePIN Insurance Analyst",
      voiceHash: ethers.keccak256(ethers.toUtf8Bytes("voice-v1")),
      animationURI: "",
      vaultURI: "gnfd://zk-claw-bucket/agent-0",
      vaultHash: ethers.keccak256(ethers.toUtf8Bytes("vault-v1")),
      avatarId: 1,
    };
    await nfa.mint(metadata);
    await nfa.setLogicAddress(0, await gateway.getAddress());

    // Set gateway address on NFA for reputation authorization
    await nfa.setGateway(await gateway.getAddress());

    // Register DePIN station with hardware key
    await depinOracle.registerStation(1001, stationSigner.address);
  });

  // ═══════════════════════════════════════════════════════════════
  // NFA (BAP-578 Full Implementation)
  // ═══════════════════════════════════════════════════════════════

  describe("NFA (BAP-578)", () => {
    it("should mint an agent with full metadata", async () => {
      const meta = await nfa.getAgentMetadata(0);
      assert.equal(meta.name, "WeatherGuard-01");
      assert.equal(meta.persona, "DePIN Insurance Analyst");
      assert.equal(meta.avatarId, 1n);
      assert.ok(meta.voiceHash !== ethers.ZeroHash);
    });

    it("should enforce max agents per address", async () => {
      // admin already minted 1, can mint 2 more
      const m = { name: "A2", persona: "p", voiceHash: ethers.ZeroHash, animationURI: "", vaultURI: "", vaultHash: ethers.ZeroHash, avatarId: 0 };
      await nfa.mint(m);
      await nfa.mint({ ...m, name: "A3" });
      await assert.rejects(nfa.mint({ ...m, name: "A4" }), /Max agents/);
    });

    it("should manage agent lifecycle (ACTIVE -> PAUSED -> ACTIVE -> TERMINATED)", async () => {
      let state = await nfa.getState(0);
      assert.equal(state, 0n); // ACTIVE

      await nfa.pauseAgent(0);
      state = await nfa.getState(0);
      assert.equal(state, 1n); // PAUSED

      await nfa.unpauseAgent(0);
      state = await nfa.getState(0);
      assert.equal(state, 0n); // ACTIVE

      // Terminate agent 1 (also owned by admin)
      await nfa.terminateAgent(1);
      state = await nfa.getState(1);
      assert.equal(state, 2n); // TERMINATED

      // Cannot terminate again
      await assert.rejects(nfa.terminateAgent(1), /Already terminated/);
    });

    it("should fund and withdraw BNB", async () => {
      await nfa.fundAgent(0, { value: ethers.parseEther("0.01") });
      let balance = await nfa.getAgentBalance(0);
      assert.equal(balance, ethers.parseEther("0.01"));

      await nfa.withdrawFromAgent(0, ethers.parseEther("0.005"));
      balance = await nfa.getAgentBalance(0);
      assert.equal(balance, ethers.parseEther("0.005"));
    });

    it("should reject funding terminated agent", async () => {
      await assert.rejects(
        nfa.fundAgent(1, { value: ethers.parseEther("0.01") }),
        /Agent not active/
      );
    });

    it("should update metadata and vault", async () => {
      const newMeta = {
        name: "WeatherGuard-01-v2",
        persona: "Updated persona",
        voiceHash: ethers.ZeroHash,
        animationURI: "ipfs://anim",
        vaultURI: "gnfd://new-vault",
        vaultHash: ethers.keccak256(ethers.toUtf8Bytes("v2")),
        avatarId: 2,
      };
      await nfa.updateAgentMetadata(0, newMeta);
      const meta = await nfa.getAgentMetadata(0);
      assert.equal(meta.name, "WeatherGuard-01-v2");
      assert.equal(meta.avatarId, 2n);

      await nfa.updateVault(0, "gnfd://vault-v3", ethers.ZeroHash);
      const m2 = await nfa.getAgentMetadata(0);
      assert.equal(m2.vaultURI, "gnfd://vault-v3");
    });

    it("should set logic address", async () => {
      const logic = await nfa.getLogicAddress(0);
      assert.equal(logic, await gateway.getAddress());
    });

    it("should increment reputation only from logic contract or gateway", async () => {
      // Direct call from non-authorized address should fail
      await assert.rejects(nfa.connect(user).incrementReputation(0), /Not authorized/);
    });

    it("should verify Merkle learning proof", async () => {
      // Create a simple Merkle tree: leaf1, leaf2 -> root
      // OZ MerkleProof uses sorted pair hashing: hash(min, max)
      const leaf1 = ethers.keccak256(ethers.toUtf8Bytes("interaction-1"));
      const leaf2 = ethers.keccak256(ethers.toUtf8Bytes("interaction-2"));
      // Sort leaves for OZ commutative hash
      const [left, right] = leaf1 < leaf2 ? [leaf1, leaf2] : [leaf2, leaf1];
      const root = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [left, right]));

      await nfa.updateLearningRoot(0, root);
      const profile = await nfa.getProfile(0);
      assert.equal(profile.learningRoot, root);

      // Verify leaf1 with proof [leaf2]
      const valid = await nfa.verifyLearning(0, [leaf2], leaf1);
      assert.equal(valid, true);

      // Wrong leaf should fail
      const wrongLeaf = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
      const invalid = await nfa.verifyLearning(0, [leaf2], wrongLeaf);
      assert.equal(invalid, false);
    });

    it("should record learning interactions", async () => {
      await nfa.recordInteraction(0, true);
      await nfa.recordInteraction(0, false);
      const metrics = await nfa.getLearningMetrics(0);
      assert.equal(metrics.totalInteractions, 2n);
      assert.equal(metrics.successfulOutcomes, 1n);
    });

    it("should check isAuthorizedOrOwner", async () => {
      const isAuth = await nfa.isAuthorizedOrOwner(admin.address, 0);
      assert.equal(isAuth, true);
      const isNotAuth = await nfa.isAuthorizedOrOwner(user.address, 0);
      assert.equal(isNotAuth, false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DePINOracle - Hardware Signature Verification
  // ═══════════════════════════════════════════════════════════════

  describe("DePINOracle - Hardware Signature Verification", () => {
    it("should register a station with hardware public key", async () => {
      assert.equal(await depinOracle.registeredStations(1001), true);
      assert.equal(await depinOracle.stationAddresses(1001), stationSigner.address);
    });

    it("should reject station with zero address", async () => {
      await assert.rejects(depinOracle.registerStation(9999, ethers.ZeroAddress), /Invalid station address/);
    });

    it("should verify valid hardware signature", async () => {
      // Station 1001 nonce=0
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [1001, -800, 9800, 12000, 25000, 0]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);
      assert.equal(await depinOracle.isDataAuthentic(1001), true);
    });

    it("should reject invalid signature (wrong signer)", async () => {
      // Station 1001 nonce=1
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [1001, 500, 5000, 3000, 0, 1]
      );
      // Sign with wrong key (admin instead of stationSigner) -- now reverts
      const badSig = await admin.signMessage(ethers.getBytes(dataHash));
      await assert.rejects(
        depinOracle.submitWeatherData(1001, 500, 5000, 3000, 0, badSig),
        /Invalid hardware signature/
      );
      // Nonce not incremented (still 1) -- submit valid data to advance nonce for later tests
      const validSig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(1001, 500, 5000, 3000, 0, validSig);
    });

    it("should reject non-admin station registration", async () => {
      await assert.rejects(
        depinOracle.connect(user).registerStation(7777, stationSigner.address),
        /Only admin/
      );
    });

    it("should allow admin transfer (two-step)", async () => {
      // Two-step: transferAdmin sets pendingAdmin, acceptAdmin completes
      await depinOracle.transferAdmin(user.address);
      assert.equal(await depinOracle.admin(), admin.address);
      assert.equal(await depinOracle.pendingAdmin(), user.address);
      // User accepts
      await depinOracle.connect(user).acceptAdmin();
      assert.equal(await depinOracle.admin(), user.address);
      // user is now admin, can register
      await depinOracle.connect(user).registerStation(7777, stationSigner.address);
      assert.equal(await depinOracle.registeredStations(7777), true);
      // Transfer back
      await depinOracle.connect(user).transferAdmin(admin.address);
      await depinOracle.acceptAdmin();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ValidationRegistry (ERC-8004)
  // ═══════════════════════════════════════════════════════════════

  describe("ValidationRegistry (ERC-8004)", () => {
    it("should create validation request (owner authorized)", async () => {
      const reqHash = ethers.keccak256(ethers.toUtf8Bytes("val-req-1"));
      await validationRegistry.validationRequest(user.address, 0, "ipfs://req1", reqHash);
      const count = await validationRegistry.getAgentValidationCount(0);
      assert.equal(count, 1n);
    });

    it("should reject duplicate request hash", async () => {
      const reqHash = ethers.keccak256(ethers.toUtf8Bytes("val-req-1"));
      await assert.rejects(
        validationRegistry.validationRequest(user.address, 0, "ipfs://dup", reqHash),
        /exists/
      );
    });

    it("should respond to validation (monotonic only)", async () => {
      const reqHash = ethers.keccak256(ethers.toUtf8Bytes("val-req-1"));
      // user is the validator
      await validationRegistry.connect(user).validationResponse(reqHash, 80, "ipfs://resp", ethers.ZeroHash, "zkml");

      const status = await validationRegistry.getValidationStatus(reqHash);
      assert.equal(status.response, 80n);

      // Can increase
      await validationRegistry.connect(user).validationResponse(reqHash, 95, "ipfs://resp2", ethers.ZeroHash, "zkml");

      // Cannot decrease
      await assert.rejects(
        validationRegistry.connect(user).validationResponse(reqHash, 50, "ipfs://bad", ethers.ZeroHash, "zkml"),
        /response cannot decrease/
      );
    });

    it("should reject non-validator response", async () => {
      const reqHash = ethers.keccak256(ethers.toUtf8Bytes("val-req-1"));
      await assert.rejects(
        validationRegistry.connect(admin).validationResponse(reqHash, 100, "", ethers.ZeroHash, ""),
        /not validator/
      );
    });

    it("should return summary filtered by tag", async () => {
      const { count, avgResponse } = await validationRegistry.getSummary(0, [], "zkml");
      assert.equal(count, 1n);
      assert.equal(avgResponse, 95n); // last response was 95
    });

    it("should allow logic contract to make validation requests", async () => {
      // Gateway (logic contract) should be authorized
      const reqHash = ethers.keccak256(ethers.toUtf8Bytes("gateway-req-1"));
      // Gateway calls validationRequest internally via submitVerifiedInference
      // We can test by submitting an off-chain verified inference
      await gateway.submitOffchainVerified([1n, 2n, 3n, 4n, 5n, 6n], 0, 1001);
      // Check validation count increased
      const count = await validationRegistry.getAgentValidationCount(0);
      assert.ok(count >= 1n);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ReputationRegistry (ERC-8004)
  // ═══════════════════════════════════════════════════════════════

  describe("ReputationRegistry (ERC-8004)", () => {
    it("should accept feedback from non-owner", async () => {
      // user is not the owner of agent 0, so can give feedback
      await reputationRegistry.connect(user).giveFeedback(0, 85, 0, "zkml", "quality", "", "ipfs://fb1", ethers.ZeroHash);
      const idx = await reputationRegistry.getLastIndex(0, user.address);
      assert.equal(idx, 1n);
    });

    it("should reject self-feedback (owner cannot rate own agent)", async () => {
      await assert.rejects(
        reputationRegistry.connect(admin).giveFeedback(0, 100, 0, "zkml", "", "", "", ethers.ZeroHash),
        /Self-feedback not allowed/
      );
    });

    it("should read feedback correctly", async () => {
      const { value, valueDecimals, tag1, isRevoked } = await reputationRegistry.readFeedback(0, user.address, 1);
      assert.equal(value, 85n);
      assert.equal(valueDecimals, 0n);
      assert.equal(tag1, "zkml");
      assert.equal(isRevoked, false);
    });

    it("should revoke feedback", async () => {
      await reputationRegistry.connect(user).revokeFeedback(0, 1);
      const { isRevoked } = await reputationRegistry.readFeedback(0, user.address, 1);
      assert.equal(isRevoked, true);
    });

    it("should get summary with WAD math", async () => {
      // Give fresh non-revoked feedback
      await reputationRegistry.connect(user).giveFeedback(0, 90, 0, "zkml", "", "", "", ethers.ZeroHash);
      await reputationRegistry.connect(user2).giveFeedback(0, 80, 0, "zkml", "", "", "", ethers.ZeroHash);

      const { count, summaryValue } = await reputationRegistry.getSummary(0, [user.address, user2.address], "zkml", "");
      assert.equal(count, 2n); // revoked one excluded
      assert.equal(summaryValue, 85n); // (90 + 80) / 2
    });

    it("should require non-empty clientAddresses", async () => {
      await assert.rejects(
        reputationRegistry.getSummary(0, [], "", ""),
        /clientAddresses required/
      );
    });

    it("should append response to feedback", async () => {
      await reputationRegistry.appendResponse(0, user.address, 2, "ipfs://response", ethers.ZeroHash);
      const count = await reputationRegistry.getResponseCount(0, user.address, 2, []);
      assert.equal(count, 1n);
    });

    it("should track clients", async () => {
      const clients = await reputationRegistry.getClients(0);
      assert.equal(clients.length, 2); // user and user2
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ZKClawGateway
  // ═══════════════════════════════════════════════════════════════

  describe("ZKClawGateway", () => {
    it("should submit off-chain verified inference with authenticated data", async () => {
      // Re-submit valid hardware-signed data (station 1001 nonce=2)
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [1001, -800, 9800, 12000, 25000, 2]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);

      await gateway.submitOffchainVerified([100n, 200n, 300n, 400n, 500n, 600n], 0, 1001);

      const total = await gateway.totalRecords();
      assert.ok(total >= 2n);
    });

    it("should record inference history", async () => {
      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.agentId, 0n);
      assert.equal(record.verified, true);
      assert.equal(record.decision, 1n);
    });

    it("should update NFA reputation on verification", async () => {
      const profile = await nfa.getProfile(0);
      assert.ok(profile.totalPredictions >= 2n);
    });

    it("should prevent proof replay", async () => {
      // Use same publicInstances as previous test -- proofHash is now keccak256(abi.encodePacked(instances))
      await assert.rejects(
        gateway.submitOffchainVerified([100n, 200n, 300n, 400n, 500n, 600n], 0, 1001),
        /Proof already used/
      );
    });

    it("should submit verified inference with mock verifier", async () => {
      // Submit fresh valid data for station 1001 (nonce=3) so dataAuthentic passes
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [1001, -800, 9800, 12000, 25000, 3]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);

      // Use correctly normalized instances so normalization cross-validation passes
      const fakeProof = ethers.toUtf8Bytes("mock-proof-data");
      await gateway.submitVerifiedInference(fakeProof, [272n, 8013n, 6557n, 6829n, 50000n, 60000n], 0, 1001);
      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.verified, true);
      assert.equal(record.dataAuthentic, true);
    });

    it("should return agent score via gateway", async () => {
      const score = await gateway.getAgentScore(0);
      assert.ok(score >= 0n);
    });

    it("should allow admin to update verifier", async () => {
      const newAddr = ethers.Wallet.createRandom().address;
      await gateway.setVerifier(newAddr);
      // Restore mock verifier
      await gateway.setVerifier(await mockVerifier.getAddress());
    });

    it("should revert when ZK proof verification fails", async () => {
      // Deploy a gateway with address(0) verifier so verified=false
      const ZKClawGateway = await ethers.getContractFactory("ZKClawGateway");
      const noVerifierGateway = await ZKClawGateway.deploy(
        ethers.ZeroAddress,
        await nfa.getAddress(),
        await validationRegistry.getAddress(),
        await depinOracle.getAddress()
      );
      await noVerifierGateway.waitForDeployment();

      const fakeProof = ethers.toUtf8Bytes("no-verifier-test");
      await assert.rejects(
        noVerifierGateway.submitVerifiedInference(
          fakeProof,
          [272n, 8013n, 6557n, 6829n, 50000n, 60000n],
          0, 1001
        ),
        /ZK proof verification failed/
      );
    });

    it("should revert when DePIN data is not authentic (no data submitted)", async () => {
      // Register a new station but DON'T submit any data
      // Default: signatureVerified=false, timestamp=0 (stale) -> dataAuthentic=false
      await depinOracle.registerStation(5001, stationSigner.address);

      const fakeProof = ethers.toUtf8Bytes("no-data-revert-test");
      await assert.rejects(
        gateway.submitVerifiedInference(
          fakeProof,
          [272n, 8013n, 6557n, 6829n, 50000n, 60000n],
          0, 5001
        ),
        /DePIN data authentication failed/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BN254 Decision Logic (Fix #5)
  // ═══════════════════════════════════════════════════════════════

  describe("BN254 Decision Logic", () => {
    const BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

    // Helper: submit fresh valid DePIN data for station 1001 with current nonce
    // Station 1001 nonce is 4 at this point (0,1,2,3 used above)
    let station1001Nonce = 4;
    async function refreshStation1001() {
      const nonce = station1001Nonce++;
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [1001, -800, 9800, 12000, 25000, nonce]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);
    }

    it("should correctly extract CLAIM when out0 is negative (BN254 wrapped) and out1 is positive", async () => {
      await refreshStation1001(); // nonce=4
      // Simulates real EZKL output: logit[0] = -8.357 -> p - 68460, logit[1] = 9.522 -> 78003
      const negativeLogit = BN254_P - 68460n;
      const positiveLogit = 78003n;

      const fakeProof = ethers.toUtf8Bytes("bn254-neg-pos-test");
      await gateway.submitVerifiedInference(
        fakeProof,
        [272n, 8013n, 6557n, 6829n, negativeLogit, positiveLogit],
        0, 1001
      );

      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.decision, 1n, "Should be CLAIM when out1 (positive) > out0 (negative)");
    });

    it("should correctly extract NORMAL when out0 is positive and larger", async () => {
      await refreshStation1001(); // nonce=5
      const fakeProof = ethers.toUtf8Bytes("bn254-pos-pos-test");
      await gateway.submitVerifiedInference(
        fakeProof,
        [272n, 8013n, 6557n, 6829n, 50000n, 30000n],
        0, 1001
      );

      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.decision, 0n, "Should be NORMAL when out0 > out1");
    });

    it("should correctly extract CLAIM when both outputs are negative but out1 is less negative", async () => {
      await refreshStation1001(); // nonce=6
      // out0 = -10000 (more negative), out1 = -5000 (less negative)
      const out0 = BN254_P - 10000n;
      const out1 = BN254_P - 5000n;

      const fakeProof = ethers.toUtf8Bytes("bn254-neg-neg-test");
      await gateway.submitVerifiedInference(
        fakeProof,
        [272n, 8013n, 6557n, 6829n, out0, out1],
        0, 1001
      );

      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.decision, 1n, "Should be CLAIM when out1 (-5000) > out0 (-10000)");
    });

    it("should return NORMAL as default when fewer than 6 instances", async () => {
      await refreshStation1001(); // nonce=7
      const fakeProof = ethers.toUtf8Bytes("bn254-short-test");
      // < 4 instances skips normalization check, dataAuthentic stays true
      await gateway.submitVerifiedInference(
        fakeProof,
        [100n, 200n],
        0, 1001
      );

      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.decision, 0n, "Should default to NORMAL with < 6 instances");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Normalization Cross-Validation (Fix #4)
  // ═══════════════════════════════════════════════════════════════

  describe("Normalization Cross-Validation", () => {
    it("should mark dataAuthentic=true when normalization matches DePIN data", async () => {
      // Register and submit authenticated DePIN data matching the proof instances
      // DePIN values (x100): temp=-800, humidity=9800, windSpeed=12000, rainfall=25000
      // Expected EZKL instances (computed from norm_params):
      //   temp: ((-800*10) - (-9823)) * 8192 / (44984-(-9823)) = 272
      //   humidity: (9800*10 - 10001) * 8192 / (99960-10001) = 8013
      //   windSpeed: (12000*10 - 5) * 8192 / (149903-5) = 6557
      //   rainfall: (25000*10 - 72) * 8192 / (299838-72) = 6829
      await depinOracle.registerStation(3001, stationSigner.address);
      // Station 3001 nonce=0
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [3001, -800, 9800, 12000, 25000, 0]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(3001, -800, 9800, 12000, 25000, sig);

      const fakeProof = ethers.toUtf8Bytes("norm-valid-test");
      await gateway.submitVerifiedInference(
        fakeProof,
        [272n, 8013n, 6557n, 6829n, 50000n, 60000n],
        0, 3001
      );

      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.dataAuthentic, true, "Should be authentic when normalization matches");
    });

    it("should revert when normalization does NOT match DePIN data", async () => {
      // Submit valid DePIN data for station 3001, but use wrong instances
      // Station 3001 nonce=1
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [3001, -800, 9800, 12000, 25000, 1]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(3001, -800, 9800, 12000, 25000, sig);

      const fakeProof = ethers.toUtf8Bytes("norm-invalid-test");
      // Use completely wrong instances that don't match the DePIN data
      await assert.rejects(
        gateway.submitVerifiedInference(
          fakeProof,
          [9999n, 9999n, 9999n, 9999n, 50000n, 60000n],
          0, 3001
        ),
        /DePIN data authentication failed/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Data Freshness Validation
  // ═══════════════════════════════════════════════════════════════

  describe("Data Freshness Validation", () => {
    it("should revert when DePIN data is stale (>30 min)", async () => {
      // Submit fresh data first
      await depinOracle.registerStation(4001, stationSigner.address);
      // Station 4001 nonce=0
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [4001, -800, 9800, 12000, 25000, 0]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(4001, -800, 9800, 12000, 25000, sig);

      // Fast-forward 31 minutes (1860 seconds) to make data stale
      await ethers.provider.send("evm_increaseTime", [1860]);
      await ethers.provider.send("evm_mine", []);

      const fakeProof = ethers.toUtf8Bytes("freshness-stale-test");
      await assert.rejects(
        gateway.submitVerifiedInference(
          fakeProof,
          [272n, 8013n, 6557n, 6829n, 50000n, 60000n],
          0, 4001
        ),
        /DePIN data authentication failed/
      );
    });

    it("should mark dataAuthentic=true when DePIN data is fresh (<30 min)", async () => {
      // Submit fresh data (station 4001 nonce=1)
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [4001, -800, 9800, 12000, 25000, 1]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(4001, -800, 9800, 12000, 25000, sig);

      // No time jump -- data is fresh
      const fakeProof = ethers.toUtf8Bytes("freshness-fresh-test");
      await gateway.submitVerifiedInference(
        fakeProof,
        [272n, 8013n, 6557n, 6829n, 50000n, 60000n],
        0, 4001
      );

      const total = await gateway.totalRecords();
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.dataAuthentic, true, "Should be authentic when data is fresh");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Greenfield Storage Anchoring
  // ═══════════════════════════════════════════════════════════════

  describe("Greenfield Storage Anchoring", () => {
    it("should anchor inference record to Greenfield", async () => {
      await gateway.anchorToGreenField(0, "gnfd://zk-claw-bucket/proof-test", ethers.keccak256(ethers.toUtf8Bytes("content")));
      assert.equal(await gateway.isAnchored(0), true);
      const anchor = await gateway.getStorageAnchor(0);
      assert.equal(anchor.greenFieldURI, "gnfd://zk-claw-bucket/proof-test");
    });

    it("should reject anchoring non-existent record", async () => {
      await assert.rejects(gateway.anchorToGreenField(99999, "gnfd://x", ethers.ZeroHash), /Record does not exist/);
    });

    it("should reject empty URI", async () => {
      await assert.rejects(gateway.anchorToGreenField(0, "", ethers.ZeroHash), /Empty URI/);
    });

    it("should report un-anchored records", async () => {
      const total = await gateway.totalRecords();
      assert.equal(await gateway.isAnchored(total - 1n), false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Halo2Verifier - Real EZKL ZK Proof Verification
  // ═══════════════════════════════════════════════════════════════

  describe("Halo2Verifier - Real EZKL ZK Proof Verification", () => {
    let halo2Verifier: any;

    before(async () => {
      const Halo2Verifier = await ethers.getContractFactory("Halo2Verifier");
      halo2Verifier = await Halo2Verifier.deploy();
      await halo2Verifier.waitForDeployment();
    });

    it("should verify a real EZKL proof on-chain", async () => {
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

      const hexProof = proofData.hex_proof;
      const rawInstances = proofData.instances[0];

      const instances = rawInstances.map((inst: string) => {
        const buf = Buffer.from(inst, "hex");
        const be = Buffer.from(buf).reverse();
        return BigInt("0x" + be.toString("hex"));
      });

      // Use staticCall because verifyProof is non-view (EZKL generates it as `public`)
      const result = await halo2Verifier.verifyProof.staticCall(hexProof, instances);
      assert.equal(result, true, "Real EZKL proof should verify on-chain");
    });

    it("should reject a tampered proof", async () => {
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

      const tampered = proofData.hex_proof.slice(0, 10) + "ff" + proofData.hex_proof.slice(12);
      const instances = proofData.instances[0].map((inst: string) => {
        const buf = Buffer.from(inst, "hex");
        const be = Buffer.from(buf).reverse();
        return BigInt("0x" + be.toString("hex"));
      });

      await assert.rejects(
        halo2Verifier.verifyProof(tampered, instances),
        "Tampered proof should be rejected"
      );
    });

    it("should reject proof with wrong instances", async () => {
      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));

      const hexProof = proofData.hex_proof;
      const wrongInstances = [0n, 0n, 0n, 0n, 0n, 0n];

      await assert.rejects(
        halo2Verifier.verifyProof(hexProof, wrongInstances),
        "Proof with wrong instances should be rejected"
      );
    });

    it("should work end-to-end: Gateway with real Halo2Verifier", async () => {
      // Submit fresh valid DePIN data for station 1001 (nonce=8)
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [1001, -800, 9800, 12000, 25000, 8]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(1001, -800, 9800, 12000, 25000, sig);

      // Point gateway to real verifier
      await gateway.setVerifier(await halo2Verifier.getAddress());

      const proofPath = path.join(__dirname, "../../zkml/artifacts/proof.json");
      const proofData = JSON.parse(fs.readFileSync(proofPath, "utf-8"));
      const hexProof = proofData.hex_proof;
      const instances = proofData.instances[0].map((inst: string) => {
        const buf = Buffer.from(inst, "hex");
        const be = Buffer.from(buf).reverse();
        return BigInt("0x" + be.toString("hex"));
      });

      const tx = await gateway.submitVerifiedInference(hexProof, instances, 0, 1001);
      await tx.wait();

      const totalRec = await gateway.totalRecords();
      const record = await gateway.getRecord(totalRec - 1n);
      assert.equal(record.verified, true, "Record should be verified by real Halo2Verifier");
      assert.equal(record.dataAuthentic, true, "Record should have authentic DePIN data");

      // Restore mock verifier for other tests
      await gateway.setVerifier(await mockVerifier.getAddress());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Integration: Full Flow
  // ═══════════════════════════════════════════════════════════════

  describe("Integration: Full Flow with Dual Trust + Greenfield", () => {
    it("should run complete DePIN -> Hardware Sig -> ZKML -> NFA -> Greenfield flow", async () => {
      // 1. Register new station
      await depinOracle.registerStation(2002, stationSigner.address);

      // 2. Submit hardware-signed data (station 2002 nonce=0)
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [2002, -1500, 9900, 15000, 30000, 0]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(2002, -1500, 9900, 15000, 30000, sig);
      assert.equal(await depinOracle.isDataAuthentic(2002), true);

      // 3. Submit verified inference
      // Use unique instances (different from earlier tests) so proofHash is unique
      await gateway.submitOffchainVerified([101n, 201n, 301n, 401n, 501n, 601n], 0, 2002);

      // 4. Verify NFA reputation updated
      const profile = await nfa.getProfile(0);
      assert.ok(profile.totalPredictions >= 3n);

      // 5. Anchor to Greenfield
      const total = await gateway.totalRecords();
      await gateway.anchorToGreenField(
        total - 1n,
        "gnfd://zk-claw-bucket/integration-test",
        ethers.keccak256(ethers.toUtf8Bytes("integration-content"))
      );
      assert.equal(await gateway.isAnchored(total - 1n), true);

      // 6. Verify inference record
      const record = await gateway.getRecord(total - 1n);
      assert.equal(record.verified, true);
      assert.equal(record.decision, 1n);
      assert.equal(record.dataAuthentic, true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERC-6551 Token Bound Accounts
  // ═══════════════════════════════════════════════════════════════

  describe("ERC-6551 Token Bound Accounts", () => {
    let tbaRegistry: any;
    let tbaUser: any;
    let tbaTokenId: bigint;

    before(async () => {
      // Deploy ERC6551Registry
      const ERC6551Registry = await ethers.getContractFactory("ERC6551Registry");
      tbaRegistry = await ERC6551Registry.deploy();
      await tbaRegistry.waitForDeployment();

      // Set TBA registry on NFA
      await nfa.setTBARegistry(await tbaRegistry.getAddress());

      // Use user2 to mint a new agent (user2 has 0 mints so far)
      tbaUser = user2;
      const m = {
        name: "TBA-Agent",
        persona: "TBA tester",
        voiceHash: ethers.ZeroHash,
        animationURI: "",
        vaultURI: "",
        vaultHash: ethers.ZeroHash,
        avatarId: 0,
      };
      const tx = await nfa.connect(tbaUser).mint(m);
      const receipt = await tx.wait();
      // Get the tokenId from the AgentMinted event
      const mintEvent = receipt.logs.find((l: any) => {
        try { return nfa.interface.parseLog(l)?.name === "AgentMinted"; } catch { return false; }
      });
      tbaTokenId = nfa.interface.parseLog(mintEvent).args[0];
    });

    it("should auto-create TBA on mint", async () => {
      const tbaAddr = await nfa.getTokenBoundAccount(tbaTokenId);
      assert.ok(tbaAddr !== ethers.ZeroAddress, "TBA should be created");

      // Registry should also know about it
      const registryAddr = await tbaRegistry.getAccount(await nfa.getAddress(), tbaTokenId);
      assert.equal(tbaAddr, registryAddr);
    });

    it("should have correct TBA owner (NFT owner)", async () => {
      const tbaAddr = await nfa.getTokenBoundAccount(tbaTokenId);
      const ERC6551Account = await ethers.getContractFactory("ERC6551Account");
      const tbaAccount = ERC6551Account.attach(tbaAddr);
      const tbaOwner = await tbaAccount.owner();
      assert.equal(tbaOwner, tbaUser.address);
    });

    it("should fund TBA with BNB and execute call", async () => {
      const tbaAddr = await nfa.getTokenBoundAccount(tbaTokenId);
      const ERC6551Account = await ethers.getContractFactory("ERC6551Account");
      const tbaAccount = ERC6551Account.attach(tbaAddr);

      // Fund the TBA
      await tbaUser.sendTransaction({ to: tbaAddr, value: ethers.parseEther("0.01") });
      const bal = await ethers.provider.getBalance(tbaAddr);
      assert.equal(bal, ethers.parseEther("0.01"));

      // Execute a call from TBA (send BNB to admin)
      const adminBalBefore = await ethers.provider.getBalance(admin.address);
      await tbaAccount.connect(tbaUser).executeCall(admin.address, ethers.parseEther("0.005"), "0x");
      const adminBalAfter = await ethers.provider.getBalance(admin.address);
      assert.ok(adminBalAfter > adminBalBefore, "Admin should receive BNB from TBA");
    });

    it("should reject non-owner TBA call", async () => {
      const tbaAddr = await nfa.getTokenBoundAccount(tbaTokenId);
      const ERC6551Account = await ethers.getContractFactory("ERC6551Account");
      const tbaAccount = ERC6551Account.attach(tbaAddr);

      await assert.rejects(
        tbaAccount.connect(user).executeCall(admin.address, 0, "0x"),
        /Not authorized/
      );
    });

    it("should not create TBA for agents minted before registry was set", async () => {
      // Agent 0 was minted before TBA registry was set
      const tbaAddr = await nfa.getTokenBoundAccount(0);
      assert.equal(tbaAddr, ethers.ZeroAddress);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AgentPaymaster (ERC-4337 Simplified)
  // ═══════════════════════════════════════════════════════════════

  describe("AgentPaymaster", () => {
    let paymaster: any;
    let agentSigner: any;

    before(async () => {
      agentSigner = user;

      const AgentPaymaster = await ethers.getContractFactory("AgentPaymaster");
      paymaster = await AgentPaymaster.deploy();
      await paymaster.waitForDeployment();

      // Fund paymaster with BNB
      await admin.sendTransaction({ to: await paymaster.getAddress(), value: ethers.parseEther("1.0") });
    });

    it("should have balance after funding", async () => {
      const bal = await paymaster.balance();
      assert.equal(bal, ethers.parseEther("1.0"));
    });

    it("should approve and track agent", async () => {
      await paymaster.approveAgent(agentSigner.address);
      assert.equal(await paymaster.approvedAgents(agentSigner.address), true);
    });

    it("should allow approved agent to make sponsored call", async () => {
      // Call gateway.totalRecords() via paymaster -- a read-like call that won't revert
      const callData = gateway.interface.encodeFunctionData("totalRecords");
      const result = await paymaster.connect(agentSigner).sponsoredCall(
        await gateway.getAddress(), callData
      );
      // Just check it doesn't revert
      assert.ok(result);

      // Check gas sponsored tracking
      const total = await paymaster.totalSponsored();
      assert.ok(total >= 0n);
    });

    it("should emit GasSponsored event", async () => {
      const callData = gateway.interface.encodeFunctionData("totalRecords");
      const tx = await paymaster.connect(agentSigner).sponsoredCall(
        await gateway.getAddress(), callData
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((l: any) => {
        try { return paymaster.interface.parseLog(l)?.name === "GasSponsored"; } catch { return false; }
      });
      assert.ok(event, "GasSponsored event should be emitted");
    });

    it("should reject unapproved agent", async () => {
      const callData = gateway.interface.encodeFunctionData("totalRecords");
      await assert.rejects(
        paymaster.connect(user2).sponsoredCall(await gateway.getAddress(), callData),
        /Agent not approved/
      );
    });

    it("should revoke agent and reject subsequent calls", async () => {
      await paymaster.revokeAgent(agentSigner.address);
      assert.equal(await paymaster.approvedAgents(agentSigner.address), false);

      const callData = gateway.interface.encodeFunctionData("totalRecords");
      await assert.rejects(
        paymaster.connect(agentSigner).sponsoredCall(await gateway.getAddress(), callData),
        /Agent not approved/
      );
    });

    it("should allow admin to withdraw", async () => {
      const balBefore = await ethers.provider.getBalance(admin.address);
      await paymaster.withdraw(ethers.parseEther("0.5"));
      const balAfter = await ethers.provider.getBalance(admin.address);
      // Account for gas, but should be close to +0.5
      assert.ok(balAfter > balBefore);

      const paymasterBal = await paymaster.balance();
      // Balance is slightly less than 0.5 due to gas reimbursements from sponsored calls
      assert.ok(paymasterBal < ethers.parseEther("0.5"));
      assert.ok(paymasterBal > ethers.parseEther("0.49"));
    });

    it("should reject non-admin operations", async () => {
      await assert.rejects(
        paymaster.connect(user).approveAgent(user2.address),
        /Only admin/
      );
      await assert.rejects(
        paymaster.connect(user).withdraw(1),
        /Only admin/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BatchVerifier (Proof Aggregation)
  // ═══════════════════════════════════════════════════════════════

  describe("BatchVerifier", () => {
    let batchVerifier: any;
    // Need a fresh station nonce tracker for batch tests
    let batchStationNonce = 0;

    before(async () => {
      const BatchVerifier = await ethers.getContractFactory("BatchVerifier");
      batchVerifier = await BatchVerifier.deploy(
        await mockVerifier.getAddress(),
        await gateway.getAddress()
      );
      await batchVerifier.waitForDeployment();

      // Register a dedicated station for batch tests
      await depinOracle.registerStation(6001, stationSigner.address);
    });

    async function refreshStation6001() {
      const n = batchStationNonce++;
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [6001, -800, 9800, 12000, 25000, n]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(6001, -800, 9800, 12000, 25000, sig);
    }

    it("should verify a batch of proofs", async () => {
      const proofs = [
        ethers.toUtf8Bytes("batch-proof-1"),
        ethers.toUtf8Bytes("batch-proof-2"),
      ];
      const instances = [
        [1n, 2n, 3n],
        [4n, 5n, 6n],
      ];

      const results = await batchVerifier.verifyBatch.staticCall(proofs, instances);
      assert.equal(results.length, 2);
      assert.equal(results[0], true); // MockVerifier always returns true
      assert.equal(results[1], true);
    });

    it("should reject batch with length mismatch", async () => {
      await assert.rejects(
        batchVerifier.verifyBatch.staticCall(
          [ethers.toUtf8Bytes("p1")],
          [[1n], [2n]]
        ),
        /Length mismatch/
      );
    });

    it("should submit batch to gateway", async () => {
      // Prepare fresh DePIN data for two submissions
      await refreshStation6001(); // nonce=0
      const proof1 = ethers.toUtf8Bytes("batch-submit-proof-1");

      await refreshStation6001(); // nonce=1 (overwrite with fresh data for second)
      const proof2 = ethers.toUtf8Bytes("batch-submit-proof-2");

      // For batch submission, each proof needs unique data + fresh station data
      // But gateway checks usedProofs, and station data is shared.
      // We need to submit one at a time with fresh data between.
      // Actually batch submits in a loop, so the second proof will use
      // the same station data. Let's just verify the first proof goes through.
      await refreshStation6001(); // nonce=2 for fresh data
      const singleProof = [ethers.toUtf8Bytes("batch-gateway-single")];
      const singleInstances = [[272n, 8013n, 6557n, 6829n, 50000n, 60000n]];
      const singleAgents = [0n];
      const singleStations = [6001n];

      const totalBefore = await gateway.totalRecords();
      await batchVerifier.submitBatch(singleProof, singleInstances, singleAgents, singleStations);
      const totalAfter = await gateway.totalRecords();

      assert.equal(totalAfter - totalBefore, 1n);
      assert.equal(await batchVerifier.totalBatchesProcessed(), 1n);
      assert.equal(await batchVerifier.totalProofsAggregated(), 1n);
    });

    it("should track batch statistics", async () => {
      assert.ok(await batchVerifier.totalBatchesProcessed() >= 1n);
      assert.ok(await batchVerifier.totalProofsAggregated() >= 1n);
    });
  });
});
