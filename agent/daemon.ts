/**
 * ZK-Claw Agent Daemon
 *
 * Automates the full AI Agent pipeline:
 *   L1 DePIN  -- Submit hardware-signed weather data to on-chain oracle
 *   L2 ZKML   -- Generate ZK proof via /api/prove
 *   L3 Agent  -- Assemble and prepare on-chain transaction
 *   L4 Chain  -- Submit verified inference to ZKClawGateway
 *   L5 Done   -- Confirm dual verification result
 *
 * Usage:
 *   npm run demo   -- Single-shot demo (for recording)
 *   npm run start  -- Continuous monitoring mode
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
import { MqttTransport } from "./transport/mqtt-transport";
import { GreenfieldClient } from "./storage/greenfield-client";

dotenv.config({ path: path.join(__dirname, ".env") });

// ══════════════════════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════════════════════

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const RPC_URL =
  process.env.RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8443";
const API_URL = process.env.API_URL || "http://localhost:3000";
const GATEWAY_ADDRESS =
  process.env.GATEWAY_ADDRESS ||
  "0xC9A6624cEB63F805a27200876abCF656cba7Bbab";
const ORACLE_ADDRESS =
  process.env.ORACLE_ADDRESS ||
  "0x51541674cA5E54a496e2A0F157d32fdBA04E3a48";
const STATION_ID = parseInt(process.env.STATION_ID || "1001", 10);

const POLL_INTERVAL_MS = 30_000; // 30 seconds for continuous mode

// Optional transport / storage / bundler config
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "";
const GREENFIELD_RPC_URL = process.env.GREENFIELD_RPC_URL || "";
const GREENFIELD_CHAIN_ID = process.env.GREENFIELD_CHAIN_ID || "5600";
const USE_MQTT = process.env.USE_MQTT === "true";
const USE_GREENFIELD = process.env.USE_GREENFIELD === "true";
const PROVER_API_KEY = process.env.PROVER_API_KEY || "dev-key-change-me";

// ══════════════════════════════════════════════════════════════
// Minimal ABIs (ethers.js v6 human-readable)
// ══════════════════════════════════════════════════════════════

const GATEWAY_ABI = [
  "function submitVerifiedInference(bytes proof, uint256[] publicInstances, uint256 agentId, uint256 stationId) external",
  "function totalRecords() view returns (uint256)",
  "function totalVerifications() view returns (uint256)",
];

const ORACLE_ABI = [
  "function submitWeatherData(uint256 stationId, int256 temperature, uint256 humidity, uint256 windSpeed, uint256 rainfall, bytes signature) external",
  "function getLatestData(uint256 stationId) view returns (tuple(uint256 stationId, int256 temperature, uint256 humidity, uint256 windSpeed, uint256 rainfall, uint256 timestamp, bytes32 dataHash, bool signatureVerified, address recoveredSigner))",
  "function isDataAuthentic(uint256 stationId) view returns (bool)",
  "function stationNonces(uint256 stationId) view returns (uint256)",
];

// ══════════════════════════════════════════════════════════════
// Logging
// ══════════════════════════════════════════════════════════════

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function log(tag: string, msg: string): void {
  console.log(`[${timestamp()}] [${tag}] ${msg}`);
}

function logBanner(text: string): void {
  const ts = timestamp();
  console.log(`[${ts}] ${"=".repeat(54)}`);
  console.log(`[${ts}] ${text}`);
  console.log(`[${ts}] ${"=".repeat(54)}`);
}

function shortHash(h: string): string {
  if (h.length <= 14) return h;
  return h.slice(0, 8) + "..." + h.slice(-4);
}

// ══════════════════════════════════════════════════════════════
// Utility: Convert EZKL little-endian hex instances to BigInt
// Matches the conversion used in /api/prove and the frontend
// ══════════════════════════════════════════════════════════════

function leHexToBigInt(leHex: string): bigint {
  // Strip 0x prefix if present
  const hex = leHex.startsWith("0x") ? leHex.slice(2) : leHex;
  const bytes = hex.match(/.{2}/g) || [];
  const beHex = bytes.reverse().join("");
  return BigInt("0x" + beHex);
}

// ══════════════════════════════════════════════════════════════
// Utility: Generate a hardware signature for DePIN data
// In production this comes from the physical weather station;
// for demo we sign with the agent's own key.
// ══════════════════════════════════════════════════════════════

async function generateHardwareSignature(
  signer: ethers.Wallet,
  oracle: ethers.Contract,
  stationId: number,
  temperature: number,
  humidity: number,
  windSpeed: number,
  rainfall: number
): Promise<string> {
  // Read current nonce from on-chain oracle for replay protection
  const nonce = await oracle.stationNonces(stationId);
  const packed = ethers.solidityPacked(
    ["uint256", "int256", "uint256", "uint256", "uint256", "uint256"],
    [stationId, temperature, humidity, windSpeed, rainfall, nonce]
  );
  const hash = ethers.keccak256(packed);
  return signer.signMessage(ethers.getBytes(hash));
}

// ══════════════════════════════════════════════════════════════
// Step 1: Submit DePIN weather data to on-chain oracle
// ══════════════════════════════════════════════════════════════

async function submitDePINData(
  oracle: ethers.Contract,
  signer: ethers.Wallet,
  weather: { temperature: number; humidity: number; windSpeed: number; rainfall: number }
): Promise<string> {
  log("L1 DePIN", `Submitting weather data: temp=${weather.temperature}C, humidity=${weather.humidity}%, wind=${weather.windSpeed}km/h, rain=${weather.rainfall}mm`);

  const signature = await generateHardwareSignature(
    signer,
    oracle,
    STATION_ID,
    weather.temperature,
    weather.humidity,
    weather.windSpeed,
    weather.rainfall
  );
  log("L1 DePIN", `Hardware signature: ${shortHash(signature)}`);

  const tx = await oracle.submitWeatherData(
    STATION_ID,
    weather.temperature,
    weather.humidity,
    weather.windSpeed,
    weather.rainfall,
    signature
  );
  const receipt = await tx.wait();
  if (receipt.status === 0) throw new Error("Transaction reverted: " + receipt.hash);
  log("L1 DePIN", `Data submitted to oracle. TX: ${shortHash(receipt.hash)}`);
  return receipt.hash;
}

// ══════════════════════════════════════════════════════════════
// Step 2: Call /api/prove to generate ZK proof
// ══════════════════════════════════════════════════════════════

interface ProveResponse {
  decision: string;
  hexProof: string;
  publicInstances: string[];
  proofHash: string;
  proofSize: number;
  verifyTime?: number;
}

async function generateZKProof(
  weather: { temperature: number; humidity: number; windSpeed: number; rainfall: number }
): Promise<ProveResponse> {
  log("L2 ZKML", "Generating ZK proof via /api/prove ...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/prove`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": PROVER_API_KEY,
      },
      body: JSON.stringify(weather),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`/api/prove returned ${res.status}: ${errText}`);
  }

  const data = await res.json();
  log(
    "L2 ZKML",
    `Proof generated: ${data.proofSize} bytes, decision=${data.decision}`
  );
  return data as ProveResponse;
}

// ══════════════════════════════════════════════════════════════
// Step 3+4: Assemble and submit on-chain transaction
// ══════════════════════════════════════════════════════════════

async function submitOnChain(
  gateway: ethers.Contract,
  proof: ProveResponse
): Promise<string> {
  log("L3 Agent", "Assembling on-chain transaction...");
  log("L3 Agent", `Proof hash: ${shortHash(proof.proofHash)}`);

  // Convert LE hex instances to BigInt array (same as frontend)
  const instances = proof.publicInstances.map((x) => leHexToBigInt(x));

  log("L4 Chain", "Submitting to ZKClawGateway...");
  const tx = await gateway.submitVerifiedInference(
    proof.hexProof,
    instances,
    0, // agentId
    STATION_ID
  );

  const receipt = await tx.wait();
  if (receipt.status === 0) throw new Error("Transaction reverted: " + receipt.hash);
  log("L4 Chain", `TX confirmed: ${shortHash(receipt.hash)}`);
  return receipt.hash;
}

// ══════════════════════════════════════════════════════════════
// Event listeners for on-chain events
// ══════════════════════════════════════════════════════════════

function setupEventListeners(
  gateway: ethers.Contract,
  oracle: ethers.Contract
): void {
  log("EVENTS", "Setting up on-chain event listeners...");

  gateway.on("InferenceSubmitted", (agentId, recordIndex, proofHash, verified, decision, dataAuthentic) => {
    log("EVENT", `InferenceSubmitted: agent=${agentId}, record=${recordIndex}, verified=${verified}, decision=${decision}, authentic=${dataAuthentic}`);
  });

  oracle.on("WeatherDataSubmitted", (stationId, dataHash, timestamp, signatureVerified) => {
    log("EVENT", `WeatherDataSubmitted: station=${stationId}, verified=${signatureVerified}`);
  });

  log("EVENTS", "Event listeners registered.");
}

// ══════════════════════════════════════════════════════════════
// Full pipeline: DePIN -> ZK Proof -> On-chain submission
// ══════════════════════════════════════════════════════════════

async function runPipeline(
  oracle: ethers.Contract,
  gateway: ethers.Contract,
  signer: ethers.Wallet,
  weather: { temperature: number; humidity: number; windSpeed: number; rainfall: number }
): Promise<void> {
  try {
    // Step 1: Submit DePIN data
    await submitDePINData(oracle, signer, weather);

    // Step 2: Generate ZK proof
    const proof = await generateZKProof(weather);

    // Step 3+4: Submit on-chain
    await submitOnChain(gateway, proof);

    // Optional: Anchor to Greenfield
    if (USE_GREENFIELD && GREENFIELD_RPC_URL) {
      try {
        const gfClient = new GreenfieldClient(GREENFIELD_RPC_URL, GREENFIELD_CHAIN_ID);
        await gfClient.connect();
        const { uri, contentHash } = await gfClient.storeProofData(0, {
          weather, proof: { hash: proof.proofHash, size: proof.proofSize }
        });
        log("L5 Done", `Anchored to Greenfield: ${uri}`);
      } catch (err: any) {
        log("WARN", `Greenfield anchoring failed: ${err.message}`);
      }
    }

    // Step 5: Done
    log("L5 Done", "Dual verification complete. Inference recorded on-chain.");
  } catch (err: any) {
    log("ERROR", `Pipeline failed: ${err.message}`);
    if (err.code === "CALL_EXCEPTION") {
      log("ERROR", "Transaction reverted. Check contract state or gas.");
    }
    if (err.cause) {
      log("ERROR", `Cause: ${err.cause}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Demo mode: Single-shot with extreme weather data
// ══════════════════════════════════════════════════════════════

async function runDemo(
  oracle: ethers.Contract,
  gateway: ethers.Contract,
  signer: ethers.Wallet
): Promise<void> {
  logBanner("ZK-CLAW AGENT DAEMON -- Demo Mode");
  console.log();

  // Extreme weather scenario: cold, humid, high wind, heavy rain
  const weather = {
    temperature: -8,
    humidity: 98,
    windSpeed: 120,
    rainfall: 250,
  };

  log("L1 DePIN", "Extreme weather detected! Starting automated pipeline...");
  console.log();

  await runPipeline(oracle, gateway, signer, weather);

  console.log();
  logBanner("Demo complete.");
}

// ══════════════════════════════════════════════════════════════
// Continuous mode: Poll DePIN oracle for new data
// ══════════════════════════════════════════════════════════════

function isExtremeWeather(temp: number, wind: number, rain: number): boolean {
  return temp < -5 || temp > 40 || wind > 100 || rain > 200;
}

async function runContinuous(
  oracle: ethers.Contract,
  gateway: ethers.Contract,
  signer: ethers.Wallet
): Promise<void> {
  logBanner("ZK-CLAW AGENT DAEMON -- Continuous Mode");
  log("INFO", `Polling station ${STATION_ID} every ${POLL_INTERVAL_MS / 1000}s`);
  log("INFO", "Thresholds: temp < -5 or > 40, wind > 100, rain > 200");
  console.log();

  // Setup event listeners
  setupEventListeners(gateway, oracle);

  // Optional: Setup MQTT transport
  if (USE_MQTT && MQTT_BROKER_URL) {
    try {
      const mqtt = new MqttTransport();
      await mqtt.connect(MQTT_BROKER_URL);
      mqtt.subscribe(`zkclaw/depin/station/+/weather`, (topic, payload) => {
        log("MQTT", `Received: ${topic} -> ${payload.toString().slice(0, 100)}`);
      });
      log("MQTT", `Connected to ${MQTT_BROKER_URL}`);
    } catch (err: any) {
      log("WARN", `MQTT connection failed: ${err.message}`);
    }
  }

  let lastTimestamp = BigInt(0);

  const poll = async () => {
    try {
      const data = await oracle.getLatestData(STATION_ID);
      const ts = BigInt(data.timestamp);

      // Skip if no new data
      if (ts <= lastTimestamp) {
        return;
      }
      lastTimestamp = ts;

      const temp = Number(data.temperature);
      const humidity = Number(data.humidity);
      const wind = Number(data.windSpeed);
      const rain = Number(data.rainfall);

      log(
        "POLL",
        `New data: temp=${temp}C, humidity=${humidity}%, wind=${wind}km/h, rain=${rain}mm`
      );

      if (isExtremeWeather(temp, wind, rain)) {
        log("POLL", "Extreme weather detected! Triggering ZK proof pipeline...");
        console.log();
        await runPipeline(oracle, gateway, signer, {
          temperature: temp,
          humidity,
          windSpeed: wind,
          rainfall: rain,
        });
        console.log();
      } else {
        log("POLL", "Weather within normal range. No action needed.");
      }
    } catch (err: any) {
      // Gracefully handle polling errors (oracle down, RPC hiccup, etc.)
      log("POLL", `Error polling oracle: ${err.message}`);
    }
  };

  // Initial poll
  await poll();

  // Recurring poll
  setInterval(poll, POLL_INTERVAL_MS);
}

// ══════════════════════════════════════════════════════════════
// Entrypoint
// ══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const isDemo = process.argv.includes("--demo");

  // Validate configuration
  if (!PRIVATE_KEY || PRIVATE_KEY === "0x_your_private_key_here") {
    console.error("ERROR: PRIVATE_KEY not set. Copy .env.example to .env and fill in values.");
    process.exit(1);
  }

  // Initialize provider and signer
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  log("INIT", `Agent address: ${signer.address}`);
  log("INIT", `RPC: ${RPC_URL}`);
  log("INIT", `Gateway: ${shortHash(GATEWAY_ADDRESS)}`);
  log("INIT", `Oracle: ${shortHash(ORACLE_ADDRESS)}`);
  log("INIT", `Station ID: ${STATION_ID}`);

  // Check balance
  const balance = await provider.getBalance(signer.address);
  log("INIT", `Balance: ${ethers.formatEther(balance)} BNB`);
  if (balance === BigInt(0)) {
    log("WARN", "Balance is 0. Transactions will fail. Fund the wallet with testnet BNB.");
  }
  console.log();

  // Initialize contracts
  const gateway = new ethers.Contract(GATEWAY_ADDRESS, GATEWAY_ABI, signer);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, signer);

  if (isDemo) {
    await runDemo(oracle, gateway, signer);
  } else {
    await runContinuous(oracle, gateway, signer);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
