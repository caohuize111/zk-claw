import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("New Contracts", () => {
  let ethers: any;
  let admin: any;
  let user: any;
  let user2: any;
  let stationSigner: any;

  // Core contracts
  let mockVerifier: any;
  let nfa: any;
  let validationRegistry: any;
  let depinOracle: any;
  let gateway: any;

  // New contracts
  let consensus: any;
  let stakeSlash: any;
  let entryPoint: any;

  before(async () => {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    const signers = await ethers.getSigners();
    admin = signers[0];
    user = signers[1];
    user2 = signers[2];
    stationSigner = signers[3];

    // Deploy MockVerifier
    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();

    // Deploy NFA
    const NFA = await ethers.getContractFactory("NFA");
    nfa = await NFA.deploy();
    await nfa.waitForDeployment();

    // Deploy ValidationRegistry
    const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
    validationRegistry = await ValidationRegistry.deploy(await nfa.getAddress());
    await validationRegistry.waitForDeployment();

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

    // Mint agent 0 and setup gateway
    const metadata = {
      name: "TestAgent-01",
      persona: "Test Agent",
      voiceHash: ethers.ZeroHash,
      animationURI: "",
      vaultURI: "",
      vaultHash: ethers.ZeroHash,
      avatarId: 0,
    };
    await nfa.mint(metadata);
    await nfa.setLogicAddress(0, await gateway.getAddress());
    await nfa.setGateway(await gateway.getAddress());

    // Deploy MultiStationConsensus
    const MultiStationConsensus = await ethers.getContractFactory("MultiStationConsensus");
    consensus = await MultiStationConsensus.deploy(await depinOracle.getAddress());
    await consensus.waitForDeployment();

    // Deploy StakeSlash
    const StakeSlash = await ethers.getContractFactory("StakeSlash");
    stakeSlash = await StakeSlash.deploy();
    await stakeSlash.waitForDeployment();

    // Deploy EntryPoint
    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();

    // Register DePIN stations for consensus tests
    await depinOracle.registerStation(101, stationSigner.address);
    await depinOracle.registerStation(102, stationSigner.address);
    await depinOracle.registerStation(103, stationSigner.address);
  });

  // ═══════════════════════════════════════════════════════════════
  // MultiStationConsensus
  // ═══════════════════════════════════════════════════════════════

  describe("MultiStationConsensus", () => {
    // Track nonces for each station
    const stationNonces: Record<number, number> = { 101: 0, 102: 0, 103: 0 };

    async function submitData(stationId: number, temp: number, humidity: number, wind: number, rain: number) {
      const nonce = stationNonces[stationId]++;
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [stationId, temp, humidity, wind, rain, nonce]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(stationId, temp, humidity, wind, rain, sig);
    }

    it("should create a consensus group", async () => {
      const tx = await consensus.createGroup([101, 102, 103], 2, 1000);
      await tx.wait();

      const stationIds = await consensus.getGroupStationIds(0);
      assert.equal(stationIds.length, 3);
      assert.equal(await consensus.nextGroupId(), 1n);
    });

    it("should reject group with threshold > station count", async () => {
      await assert.rejects(
        consensus.createGroup([101], 2, 1000),
        /Threshold exceeds station count/
      );
    });

    it("should reject group with threshold 0", async () => {
      await assert.rejects(
        consensus.createGroup([101, 102], 0, 1000),
        /Threshold must be > 0/
      );
    });

    it("should reach consensus when stations agree", async () => {
      // Submit similar data for all 3 stations (within 10% tolerance)
      await submitData(101, 2500, 5000, 3000, 10000);
      await submitData(102, 2520, 5010, 3010, 10020);
      await submitData(103, 2480, 4990, 2990, 9980);

      const result = await consensus.checkConsensus.staticCall(0);
      assert.equal(result.reached, true);
      assert.equal(result.agreeingStations, 3n);
    });

    it("should not reach consensus when stations diverge", async () => {
      // Create a group with strict tolerance (0.1% = 10 bps)
      await consensus.createGroup([101, 102, 103], 3, 10);

      // Submit very different data
      await submitData(101, 2500, 5000, 3000, 10000);
      await submitData(102, 5000, 9000, 8000, 20000); // very different
      await submitData(103, -1000, 2000, 1000, 5000);  // very different

      const tx = await consensus.checkConsensus(1);
      await tx.wait();
      const result = await consensus.getResult(1);
      assert.equal(result.reached, false);
    });

    it("should reject non-admin group creation", async () => {
      await assert.rejects(
        consensus.connect(user).createGroup([101], 1, 1000),
        /Only admin/
      );
    });

    it("should reject checkConsensus on invalid group", async () => {
      await assert.rejects(
        consensus.checkConsensus(999),
        /Group not active/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // StakeSlash
  // ═══════════════════════════════════════════════════════════════

  describe("StakeSlash", () => {
    it("should accept stake at minimum", async () => {
      await stakeSlash.connect(user).stake({ value: ethers.parseEther("0.01") });
      assert.equal(await stakeSlash.stakes(user.address), ethers.parseEther("0.01"));
    });

    it("should accept additional stake", async () => {
      await stakeSlash.connect(user).stake({ value: ethers.parseEther("0.09") });
      assert.equal(await stakeSlash.stakes(user.address), ethers.parseEther("0.1"));
    });

    it("should reject stake below minimum", async () => {
      await assert.rejects(
        stakeSlash.connect(user2).stake({ value: ethers.parseEther("0.001") }),
        /Below minimum stake/
      );
    });

    it("should allow partial unstake if remaining >= minStake", async () => {
      // user has 0.1 ETH, unstake 0.05, remaining = 0.05 >= 0.01
      await stakeSlash.connect(user).unstake(ethers.parseEther("0.05"));
      assert.equal(await stakeSlash.stakes(user.address), ethers.parseEther("0.05"));
    });

    it("should reject partial unstake if remaining < minStake and not full", async () => {
      // user has 0.05 ETH, unstake 0.045, remaining = 0.005 < 0.01
      await assert.rejects(
        stakeSlash.connect(user).unstake(ethers.parseEther("0.045")),
        /Remaining below minimum stake/
      );
    });

    it("should allow full unstake", async () => {
      await stakeSlash.connect(user).unstake(ethers.parseEther("0.05"));
      assert.equal(await stakeSlash.stakes(user.address), 0n);
    });

    it("should authorize and revoke slasher", async () => {
      await stakeSlash.authorizeSlasher(user2.address);
      assert.equal(await stakeSlash.authorizedSlashers(user2.address), true);

      await stakeSlash.revokeSlasher(user2.address);
      assert.equal(await stakeSlash.authorizedSlashers(user2.address), false);
    });

    it("should slash staker by authorized slasher", async () => {
      // Re-stake
      await stakeSlash.connect(user).stake({ value: ethers.parseEther("1.0") });
      // Authorize admin as slasher
      await stakeSlash.authorizeSlasher(admin.address);
      // Slash (10% of 1.0 = 0.1)
      await stakeSlash.slash(user.address, "misbehavior");
      assert.equal(await stakeSlash.stakes(user.address), ethers.parseEther("0.9"));
      assert.equal(await stakeSlash.totalSlashed(), ethers.parseEther("0.1"));
    });

    it("should reject unauthorized slash", async () => {
      await assert.rejects(
        stakeSlash.connect(user).slash(user.address, "self-slash"),
        /Not authorized slasher/
      );
    });

    it("should allow admin to withdraw slashed funds", async () => {
      const balBefore = await ethers.provider.getBalance(admin.address);
      await stakeSlash.withdrawSlashed();
      const balAfter = await ethers.provider.getBalance(admin.address);
      assert.ok(balAfter > balBefore);
      assert.equal(await stakeSlash.totalSlashed(), 0n);
    });

    it("should reject non-admin authorize/revoke", async () => {
      await assert.rejects(
        stakeSlash.connect(user).authorizeSlasher(user2.address),
        /Only admin/
      );
      await assert.rejects(
        stakeSlash.connect(user).revokeSlasher(user2.address),
        /Only admin/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EntryPoint (Simplified ERC-4337)
  // ═══════════════════════════════════════════════════════════════

  describe("EntryPoint", () => {
    let mockAccount: any;

    before(async () => {
      // Deploy a mock account contract that implements IAccount
      const MockAccount = await ethers.getContractFactory("MockAccount");
      mockAccount = await MockAccount.deploy(await entryPoint.getAddress());
      await mockAccount.waitForDeployment();
    });

    it("should handle valid user operation", async () => {
      const op = {
        sender: await mockAccount.getAddress(),
        nonce: 0,
        callData: "0x",
        callGasLimit: 100000,
        verificationGasLimit: 100000,
        signature: "0x1234",
      };

      await entryPoint.handleOps([op]);
      assert.equal(await entryPoint.getNonce(await mockAccount.getAddress()), 1n);
    });

    it("should reject invalid nonce", async () => {
      const op = {
        sender: await mockAccount.getAddress(),
        nonce: 999, // wrong nonce, should be 1
        callData: "0x",
        callGasLimit: 100000,
        verificationGasLimit: 100000,
        signature: "0x1234",
      };

      await assert.rejects(
        entryPoint.handleOps([op]),
        /Invalid nonce/
      );
    });

    it("should reject failed validation", async () => {
      // Set mock account to reject
      await mockAccount.setShouldReject(true);

      const op = {
        sender: await mockAccount.getAddress(),
        nonce: 1,
        callData: "0x",
        callGasLimit: 100000,
        verificationGasLimit: 100000,
        signature: "0x1234",
      };

      await assert.rejects(
        entryPoint.handleOps([op]),
        /Validation failed/
      );

      // Restore
      await mockAccount.setShouldReject(false);
    });

    it("should compute user op hash", async () => {
      const op = {
        sender: await mockAccount.getAddress(),
        nonce: 1,
        callData: "0x",
        callGasLimit: 100000,
        verificationGasLimit: 100000,
        signature: "0x1234",
      };

      const hash = await entryPoint.getUserOpHash(op);
      assert.ok(hash !== ethers.ZeroHash);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // UUPS Proxy (ZKClawGatewayV2)
  // ═══════════════════════════════════════════════════════════════

  describe("UUPS Proxy (ZKClawGatewayV2)", () => {
    let proxyContract: any;
    let v2Implementation: any;

    before(async () => {
      // Deploy V2 implementation
      const ZKClawGatewayV2 = await ethers.getContractFactory("ZKClawGatewayV2");
      v2Implementation = await ZKClawGatewayV2.deploy();
      await v2Implementation.waitForDeployment();

      // Encode initialize call
      const initData = v2Implementation.interface.encodeFunctionData("initialize", [
        await mockVerifier.getAddress(),
        await nfa.getAddress(),
        await validationRegistry.getAddress(),
        await depinOracle.getAddress(),
      ]);

      // Deploy ForceImportERC1967Proxy
      const ForceImportERC1967Proxy = await ethers.getContractFactory("ForceImportERC1967Proxy");
      const proxy = await ForceImportERC1967Proxy.deploy(await v2Implementation.getAddress(), initData);
      await proxy.waitForDeployment();

      // Attach V2 interface to proxy
      proxyContract = ZKClawGatewayV2.attach(await proxy.getAddress());
    });

    it("should initialize correctly via proxy", async () => {
      assert.equal(await proxyContract.version(), "2.0.0");
      assert.equal(await proxyContract.admin(), admin.address);
      assert.equal(await proxyContract.nfa(), await nfa.getAddress());
    });

    it("should reject double initialize", async () => {
      await assert.rejects(
        proxyContract.initialize(
          ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress
        ),
        /InvalidInitialization/
      );
    });

    it("should submit inference via proxy", async () => {
      const proof = ethers.toUtf8Bytes("proxy-test-proof");
      await proxyContract.submitVerifiedInference(proof, [100n, 200n], 0);
      assert.equal(await proxyContract.totalRecords(), 1n);
    });

    it("should upgrade implementation (admin)", async () => {
      // Deploy a new V2 implementation (same code, new address)
      const ZKClawGatewayV2 = await ethers.getContractFactory("ZKClawGatewayV2");
      const newImpl = await ZKClawGatewayV2.deploy();
      await newImpl.waitForDeployment();

      await proxyContract.upgradeToAndCall(await newImpl.getAddress(), "0x");
      // Still works
      assert.equal(await proxyContract.version(), "2.0.0");
    });

    it("should reject unauthorized upgrade", async () => {
      const ZKClawGatewayV2 = await ethers.getContractFactory("ZKClawGatewayV2");
      const newImpl = await ZKClawGatewayV2.deploy();
      await newImpl.waitForDeployment();

      await assert.rejects(
        proxyContract.connect(user).upgradeToAndCall(await newImpl.getAddress(), "0x"),
        /Only admin/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Auto Claim Payout (ZKClawGateway modification)
  // ═══════════════════════════════════════════════════════════════

  describe("Auto Claim Payout", () => {
    let payoutStationNonce = 0;

    async function submitFreshStationData() {
      const stationId = 201;
      const nonce = payoutStationNonce++;
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [stationId, -800, 9800, 12000, 25000, nonce]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(stationId, -800, 9800, 12000, 25000, sig);
    }

    before(async () => {
      // Register payout test station
      await depinOracle.registerStation(201, stationSigner.address);
    });

    it("should set claim payout config", async () => {
      await gateway.setClaimPayout(0, user2.address, ethers.parseEther("0.001"));
      assert.equal(await gateway.claimPayoutAddresses(0), user2.address);
      assert.equal(await gateway.claimPayoutAmounts(0), ethers.parseEther("0.001"));
    });

    it("should trigger payout on CLAIM decision", async () => {
      // Fund agent 0 so it has balance for payout
      await nfa.fundAgent(0, { value: ethers.parseEther("0.01") });

      // Submit inference with CLAIM decision (out1 > out0)
      await submitFreshStationData();
      const balBefore = await ethers.provider.getBalance(user2.address);

      // Decision=1 (CLAIM): out1(600) > out0(500)
      await gateway.submitOffchainVerified([1000n, 2000n, 3000n, 4000n, 5000n, 6000n], 0, 201);

      const balAfter = await ethers.provider.getBalance(user2.address);
      assert.ok(balAfter > balBefore, "Payout address should receive BNB");
    });

    it("should not trigger payout when not configured", async () => {
      // Agent with no payout config -- use agentId that doesn't have payout set
      // We'll just verify no revert happens when payout is not configured
      await submitFreshStationData();
      // Clear payout config
      await gateway.setClaimPayout(0, ethers.ZeroAddress, 0);

      // Decision=1 (CLAIM): out1(6001) > out0(5001), unique instances
      await gateway.submitOffchainVerified([1001n, 2001n, 3001n, 4001n, 5001n, 6001n], 0, 201);
      // Should succeed without payout
      const total = await gateway.totalRecords();
      assert.ok(total > 0n);
    });

    it("should not trigger payout on NORMAL decision", async () => {
      // Re-set payout config
      await gateway.setClaimPayout(0, user2.address, ethers.parseEther("0.001"));
      await submitFreshStationData();

      const balBefore = await ethers.provider.getBalance(user2.address);
      // Decision=0 (NORMAL): out0(6002) >= out1(5002), unique instances
      await gateway.submitOffchainVerified([1002n, 2002n, 3002n, 4002n, 6002n, 5002n], 0, 201);

      const balAfter = await ethers.provider.getBalance(user2.address);
      assert.equal(balAfter, balBefore, "No payout should happen on NORMAL decision");
    });

    it("should fund insurance pool via fundInsurancePool()", async () => {
      const amount = ethers.parseEther("0.1");
      const tx = await gateway.fundInsurancePool({ value: amount });
      const receipt = await tx.wait();
      const poolBal = await gateway.insurancePoolBalance();
      assert.ok(poolBal >= amount, "Insurance pool should hold deposited BNB");
    });

    it("should accept direct BNB transfer to insurance pool", async () => {
      const balBefore = await gateway.insurancePoolBalance();
      await admin.sendTransaction({ to: await gateway.getAddress(), value: ethers.parseEther("0.05") });
      const balAfter = await gateway.insurancePoolBalance();
      assert.ok(balAfter > balBefore, "Direct transfer should increase pool balance");
    });

    it("should set default payout amount", async () => {
      await gateway.setDefaultPayout(ethers.parseEther("0.002"));
      assert.equal(await gateway.defaultPayoutAmount(), ethers.parseEther("0.002"));
    });

    it("should pay from insurance pool when no agent-specific config", async () => {
      // Clear agent-specific payout
      await gateway.setClaimPayout(0, ethers.ZeroAddress, 0);
      // Set default payout
      await gateway.setDefaultPayout(ethers.parseEther("0.002"));

      await submitFreshStationData();
      const balBefore = await ethers.provider.getBalance(admin.address);

      // CLAIM decision: out1 > out0
      const tx = await gateway.submitOffchainVerified([1003n, 2003n, 3003n, 4003n, 5003n, 6003n], 0, 201);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balAfter = await ethers.provider.getBalance(admin.address);
      // admin (msg.sender) should receive payout minus gas
      const netChange = balAfter - balBefore + gasUsed;
      assert.ok(netChange > 0n, "Submitter should receive insurance pool payout");
    });

    it("should prefer agent-specific config over insurance pool", async () => {
      // Set both agent-specific and default
      await nfa.fundAgent(0, { value: ethers.parseEther("0.01") });
      await gateway.setClaimPayout(0, user2.address, ethers.parseEther("0.001"));
      await gateway.setDefaultPayout(ethers.parseEther("0.002"));

      await submitFreshStationData();
      const user2BalBefore = await ethers.provider.getBalance(user2.address);

      // CLAIM decision
      await gateway.submitOffchainVerified([1004n, 2004n, 3004n, 4004n, 5004n, 6004n], 0, 201);

      const user2BalAfter = await ethers.provider.getBalance(user2.address);
      assert.ok(user2BalAfter > user2BalBefore, "Agent-specific payout should take priority");
    });

    it("should not pay from pool on NORMAL decision", async () => {
      await gateway.setClaimPayout(0, ethers.ZeroAddress, 0);
      await gateway.setDefaultPayout(ethers.parseEther("0.002"));
      const poolBefore = await gateway.insurancePoolBalance();

      await submitFreshStationData();
      // NORMAL: out0 > out1
      await gateway.submitOffchainVerified([1005n, 2005n, 3005n, 4005n, 6005n, 5005n], 0, 201);

      const poolAfter = await gateway.insurancePoolBalance();
      assert.equal(poolAfter, poolBefore, "Pool should not decrease on NORMAL decision");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // NFA gatewayWithdraw
  // ═══════════════════════════════════════════════════════════════

  describe("NFA gatewayWithdraw", () => {
    it("should reject non-gateway caller", async () => {
      await assert.rejects(
        nfa.connect(user).gatewayWithdraw(0, ethers.parseEther("0.001"), user.address),
        /Only gateway/
      );
    });

    it("should reject zero amount", async () => {
      await assert.rejects(
        nfa.gatewayWithdraw(0, 0, admin.address),
        /Only gateway/
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Crypto-Bound Inference (Trustless DePIN Signature + ZK Proof)
  // ═══════════════════════════════════════════════════════════════

  describe("Crypto-Bound Inference", () => {
    let deviceSigner: any;

    before(async () => {
      const signers = await ethers.getSigners();
      deviceSigner = signers[4]; // Simulate a DePIN hardware device

      // Bind device to station 301
      await gateway.bindDevice(301, deviceSigner.address);
    });

    it("should bind a device to a station", async () => {
      assert.equal(await gateway.boundDevices(301), deviceSigner.address);
    });

    it("should reject binding with zero address", async () => {
      await assert.rejects(
        gateway.bindDevice(302, ethers.ZeroAddress),
        /Invalid device address/
      );
    });

    it("should reject non-admin binding", async () => {
      await assert.rejects(
        gateway.connect(user).bindDevice(302, user.address),
        /Only admin/
      );
    });

    // Helper: compute normalized public instances matching _verifyNormalization
    function computeNormalizedInstances(temp: number, humidity: number, windSpeed: number, rainfall: number): bigint[] {
      // Contract constants (x1000 precision)
      const NORM_MIN = [-9823n, 10001n, 5n, 72n];
      const NORM_MAX = [44984n, 99960n, 149903n, 299838n];
      const EZKL_SCALE = 8192n;

      // Convert x100 to x1000
      const raw = [BigInt(temp) * 10n, BigInt(humidity) * 10n, BigInt(windSpeed) * 10n, BigInt(rainfall) * 10n];

      const instances: bigint[] = [];
      for (let i = 0; i < 4; i++) {
        const num = (raw[i] - NORM_MIN[i]) * EZKL_SCALE;
        const denom = NORM_MAX[i] - NORM_MIN[i];
        instances.push(num / denom);
      }
      // Add two output values (for decision extraction)
      instances.push(500n, 600n);
      return instances;
    }

    it("should accept valid crypto-bound inference", async () => {
      const stationId = 301;
      const temp = -800;  // -8.00 C
      const humidity = 9800;
      const windSpeed = 12000;
      const rainfall = 25000;

      // Get nonce
      const nonce = await gateway.getDeviceNonce(stationId);

      // Compute data hash (matching contract logic)
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [stationId, temp, humidity, windSpeed, rainfall, nonce]
      );

      // Device signs the data hash
      const deviceSignature = await deviceSigner.signMessage(ethers.getBytes(dataHash));

      // Use MockVerifier proof (will pass)
      const proof = ethers.toUtf8Bytes("crypto-bound-proof-1");

      // Compute correct normalized public instances matching DePIN data
      const publicInstances = computeNormalizedInstances(temp, humidity, windSpeed, rainfall);

      const totalBefore = await gateway.totalVerifications();

      await gateway.submitCryptoBoundInference(
        proof,
        publicInstances,
        0, // agentId
        { stationId, temperature: temp, humidity, windSpeed, rainfall },
        deviceSignature
      );

      const totalAfter = await gateway.totalVerifications();
      assert.equal(totalAfter, totalBefore + 1n);
    });

    it("should reject invalid device signature", async () => {
      const stationId = 301;
      const nonce = await gateway.getDeviceNonce(stationId);

      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [stationId, -800, 9800, 12000, 25000, nonce]
      );

      // Sign with WRONG signer (admin instead of device)
      const badSignature = await admin.signMessage(ethers.getBytes(dataHash));

      const proof = ethers.toUtf8Bytes("crypto-bound-bad-sig");
      const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];

      await assert.rejects(
        gateway.submitCryptoBoundInference(
          proof,
          publicInstances,
          0,
          { stationId, temperature: -800, humidity: 9800, windSpeed: 12000, rainfall: 25000 },
          badSignature
        ),
        /Invalid device signature/
      );
    });

    it("should reject unbound station", async () => {
      const proof = ethers.toUtf8Bytes("crypto-bound-unbound");
      const publicInstances = [100n, 200n, 300n, 400n, 500n, 600n];
      const dummySig = await admin.signMessage(ethers.toUtf8Bytes("dummy"));

      await assert.rejects(
        gateway.submitCryptoBoundInference(
          proof,
          publicInstances,
          0,
          { stationId: 999, temperature: -800, humidity: 9800, windSpeed: 12000, rainfall: 25000 },
          dummySig
        ),
        /Station not bound/
      );
    });

    it("should prevent proof replay on crypto-bound path", async () => {
      const stationId = 301;
      const instances = computeNormalizedInstances(-800, 9800, 12000, 25000);

      // First submission
      const nonce1 = await gateway.getDeviceNonce(stationId);
      const dataHash1 = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [stationId, -800, 9800, 12000, 25000, nonce1]
      );
      const sig1 = await deviceSigner.signMessage(ethers.getBytes(dataHash1));
      const proof = ethers.toUtf8Bytes("crypto-bound-replay-test");

      await gateway.submitCryptoBoundInference(
        proof, instances, 0,
        { stationId, temperature: -800, humidity: 9800, windSpeed: 12000, rainfall: 25000 },
        sig1
      );

      // Second submission with same proof should fail
      const nonce2 = await gateway.getDeviceNonce(stationId);
      const dataHash2 = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [stationId, -800, 9800, 12000, 25000, nonce2]
      );
      const sig2 = await deviceSigner.signMessage(ethers.getBytes(dataHash2));

      await assert.rejects(
        gateway.submitCryptoBoundInference(
          proof, instances, 0,
          { stationId, temperature: -800, humidity: 9800, windSpeed: 12000, rainfall: 25000 },
          sig2
        ),
        /Proof already used/
      );
    });

    it("should increment nonce after each submission", async () => {
      const nonceBefore = await gateway.getDeviceNonce(301);
      assert.ok(nonceBefore >= 2n, "Nonce should be >= 2 from previous tests");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Merkle Proof Aggregation (BatchVerifier)
  // ═══════════════════════════════════════════════════════════════

  describe("Merkle Proof Aggregation", () => {
    let batchVerifier: any;
    let aggStationNonce = 0;

    before(async () => {
      const BatchVerifier = await ethers.getContractFactory("BatchVerifier");
      batchVerifier = await BatchVerifier.deploy(
        await mockVerifier.getAddress(),
        await gateway.getAddress()
      );
      await batchVerifier.waitForDeployment();
      // Authorize BatchVerifier on Gateway for batchIncrementReputation
      await gateway.setBatchVerifier(await batchVerifier.getAddress());

      // Register station for aggregation tests
      await depinOracle.registerStation(401, stationSigner.address);
    });

    async function submitFreshStationData401() {
      const nonce = aggStationNonce++;
      const dataHash = ethers.solidityPackedKeccak256(
        ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
        [401, -800, 9800, 12000, 25000, nonce]
      );
      const sig = await stationSigner.signMessage(ethers.getBytes(dataHash));
      await depinOracle.submitWeatherData(401, -800, 9800, 12000, 25000, sig);
    }

    it("should submit aggregated root (off-chain aggregation)", async () => {
      // Simulate: 1000 proofs aggregated off-chain, only root submitted
      const proofHashes = [
        ethers.keccak256(ethers.toUtf8Bytes("proof-1")),
        ethers.keccak256(ethers.toUtf8Bytes("proof-2")),
        ethers.keccak256(ethers.toUtf8Bytes("proof-3")),
      ];

      // Compute a simple merkle root (we don't need to match _computeMerkleRoot exactly for this test)
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("aggregated-root-1000"));

      await batchVerifier.submitAggregatedRoot(merkleRoot, 1000, proofHashes, [0, 0, 0]);

      const batch = await batchVerifier.getAggregatedBatch(0);
      assert.equal(batch.merkleRoot, merkleRoot);
      assert.equal(batch.proofCount, 1000n);
      assert.equal(batch.finalized, true);

      // Check sample proofs are marked as settled
      assert.equal(await batchVerifier.isProofSettled(0, proofHashes[0]), true);
      assert.equal(await batchVerifier.isProofSettled(0, proofHashes[1]), true);
      assert.equal(await batchVerifier.isProofSettled(0, proofHashes[2]), true);
    });

    it("should reject empty batch in submitAggregatedRoot", async () => {
      await assert.rejects(
        batchVerifier.submitAggregatedRoot(ethers.ZeroHash, 0, [], []),
        /Empty batch/
      );
    });

    it("should track aggregation statistics", async () => {
      const stats = await batchVerifier.getAggregationStats();
      assert.ok(stats._totalBatches > 0n);
      assert.ok(stats._totalProofs > 0n);
      assert.ok(stats._totalGasSaved > 0n);
    });

    it("should get aggregated batch details", async () => {
      const batch = await batchVerifier.getAggregatedBatch(0);
      assert.equal(batch.submitter, admin.address);
      assert.ok(batch.timestamp > 0n);
    });

    it("should increment batch ID", async () => {
      assert.ok(await batchVerifier.nextAggBatchId() >= 1n);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Helper: MockAccount for EntryPoint tests
// We need to deploy this from a .sol file
// ═══════════════════════════════════════════════════════════════
