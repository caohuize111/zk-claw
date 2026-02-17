# ZK-Claw

**Verifiable Intelligence Gateway for Autonomous AI Agents on BNB Chain**

ZK-Claw makes AI agent decisions *unruggable*. Every inference is backed by a ZK-SNARK proof -- the agent's developer cannot tamper with the decision logic after deployment.

The system chains together three trust layers:
1. **DePIN hardware signatures** bind sensor readings to physical stations
2. **ZKML proofs** (EZKL / Halo2) guarantee the ML model executed correctly without revealing weights
3. **On-chain verification** records results, accumulates NFA reputation (BAP-578), and writes to ERC-8004 validation registry

Built for the **Good Vibes Only: OpenClaw Edition** hackathon (Builders track).

---

## Architecture

```
  DePIN Weather Station          ZKML Prover (EZKL)          BNB Chain (BSC Testnet)
  =====================          ==================          =======================

  Marco Station #1001            PyTorch MLP (4->32->16->2)  ZKClawGateway
  temp / humidity /              ONNX export                   |-- verify ZK proof
  wind / rainfall                     |                        |-- check hardware sig
       |                         Halo2 circuit compile         |-- record decision
  ECDSA hardware sign                 |                        |-- update NFA reputation
       |                         KZG commitment                |-- write ERC-8004 entry
       v                              |                        |-- anchor to Greenfield
  MockDePINOracle.sol            ZK-SNARK proof                     |
  ecrecover on-chain                  |                        MockNFA (BAP-578)
                                      v                        MockValidationRegistry
                                 /api/prove                    (ERC-8004)
                                 returns proof + decision
```

**Dual Trust Model:**
- **Data layer:** Hardware sensor keys sign raw readings. `ecrecover` on-chain verifies the source is a genuine physical station -- blocks fake data injection.
- **Inference layer:** EZKL compiles the PyTorch model into an arithmetic circuit and generates a Halo2 SNARK. The proof attests that the correct model ran on the signed data -- blocks weight tampering.

---

## Deployed Contracts (BSC Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| MockVerifier | `0x319729205CfBFd9CD1e8130Ed9D342542e310386` | ZK proof verification |
| MockNFA | `0x9B83Bb788B4f96cA8c377EAFC5610502140214d1` | BAP-578 agent identity + reputation |
| MockValidationRegistry | `0x7f54dA182693394Ff0Bf77479e6d7b9003cf8f25` | ERC-8004 trust history |
| MockDePINOracle | `0xed7B5A8fc0249BdfB70363C083Ea828976eDFe89` | Hardware-signed sensor data |
| ZKClawGateway | `0xae765e473f5549607093B1685e3199Bd6f0AD058` | Core orchestrator |

All contracts verified on [BSCScan Testnet](https://testnet.bscscan.com/).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Model | PyTorch MLP (4 -> 32 -> 16 -> 2), trained on 2000 synthetic weather samples, 97.7% accuracy |
| ZK Proving | EZKL (Halo2 proof system, KZG commitments), proof size ~18 KB |
| Smart Contracts | Solidity 0.8.24, Hardhat v3, OpenZeppelin v5, 28 passing tests |
| Frontend | Next.js 14 (App Router), wagmi v2, RainbowKit, Tailwind CSS |
| Chain Reading | viem (server-side) + wagmi (client-side) |
| Network | BSC Testnet (chain 97), configured for opBNB Testnet (chain 5611) |
| Storage | BNB Greenfield anchoring (content hash on-chain, data off-chain) |

---

## How It Works

### 1. DePIN Data Collection

Weather stations (simulating Marco hardware) record temperature, humidity, wind speed, and rainfall. Each reading is signed with the station's ECDSA private key. `MockDePINOracle.submitWeatherData()` stores the data and verifies the signature via `ecrecover`.

### 2. ZKML Inference + Proof Generation

The signed sensor data feeds into a PyTorch MLP that decides whether conditions warrant an insurance claim. The EZKL pipeline:

```
train_model.py                    generate_proof.py
  sklearn-style training            ezkl gen-settings
  export ONNX (opset 18)           ezkl calibrate-settings
  save norm_params.json            ezkl compile-circuit
                                    ezkl get-srs (KZG params)
                                    ezkl setup (pk + vk)
                                    ezkl gen-witness
                                    ezkl prove -> proof.json
                                    ezkl verify (local check)
```

The proof attests: "this specific decision was computed by this specific model on this specific input" -- without exposing model weights.

### 3. On-Chain Verification

`ZKClawGateway.submitVerifiedInference()` performs dual verification:
- Checks the Halo2 ZK proof via the verifier contract
- Checks the DePIN data signature via `ecrecover`
- Extracts the decision from public instances (CLAIM vs NORMAL)
- Records the inference with full audit trail
- Updates the NFA's reputation score (BAP-578)
- Writes a validation entry to ERC-8004 registry
- Optionally anchors proof data to BNB Greenfield

Proof replay is prevented -- each `proofHash` can only be used once.

### 4. Reputation Accumulation

Each verified inference increments the agent's on-chain reputation. The score lives inside the NFA (NFT) and cannot be faked -- only earned through successful ZK-verified actions. Third parties query `MockValidationRegistry.getSummary()` to audit cumulative trust.

---

## Frontend

Four pages built with Next.js 14 App Router:

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Hero section with live on-chain stats, terminal-style EZKL pipeline visualization, architecture overview |
| Dashboard | `/dashboard` | Agent cards with reputation scores and accuracy bars, verification record timeline with status badges |
| Verify | `/verify` | Core demo: 4-step flow (DePIN input -> ZKML proof -> chain submit -> verified result) with weather presets |
| Agent Profile | `/agent/[id]` | BAP-578 metadata, PredictionProfile stats, Merkle learning root, full verification history |

**API routes:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/prove` | POST | Accepts weather data, normalizes, runs EZKL prove pipeline, returns proof + decision |
| `/api/agents` | GET | Reads agent list + gateway stats from chain via viem |
| `/api/records` | GET | Returns latest 20 verification records from chain |
| `/api/history/[id]` | GET | Returns single agent info + verification history |
| `/api/weather` | GET | Simulated DePIN station data (3 stations) |

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Python 3.10+ with `ezkl`, `torch`, `numpy`, `onnx`
- BSC Testnet tBNB from [faucet](https://www.bnbchain.org/en/testnet-faucet)

### 1. Frontend

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### 2. Contracts

```bash
cd contracts
npm install
npx hardhat test    # 28 tests

# Deploy to BSC Testnet
PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network bscTestnet
```

The deploy script automatically:
- Deploys all 5 contracts
- Registers a demo weather station (stationId=1001)
- Submits hardware-signed weather data
- Mints a demo NFA agent (WeatherGuard-01)
- Binds ZKClawGateway as the agent's logic contract
- Submits a demo inference
- Anchors proof to Greenfield
- Writes frontend config to `src/lib/deployed-contracts.ts`

### 3. ZKML Pipeline

```bash
cd zkml
pip install ezkl torch numpy onnx

python train_model.py       # Train MLP, export ONNX, save norm_params
python generate_proof.py    # Full EZKL pipeline: settings -> compile -> setup -> prove -> verify
```

Artifacts generated in `zkml/artifacts/`:
- `model.compiled` -- Halo2 arithmetic circuit
- `pk.key` / `vk.key` -- Proving and verification keys
- `kzg.srs` -- Structured reference string
- `proof.json` -- ZK-SNARK proof
- `settings.json` -- Circuit parameters

### 4. Production Build

```bash
npm run build    # 8 routes compiled
npm run start    # Production server
```

---

## Project Structure

```
zk-claw/
  contracts/                          # Hardhat v3
    contracts/
      ZKClawGateway.sol               # Core orchestrator (284 lines)
      MockNFA.sol                     # BAP-578 agent identity
      MockValidationRegistry.sol      # ERC-8004 validation
      MockDePINOracle.sol             # DePIN hardware signatures
      MockVerifier.sol                # Fallback verifier
      interfaces/IHalo2Verifier.sol
      verifier/Halo2Verifier.sol      # EZKL-generated (reference)
    test/ZKClaw.test.ts               # 28 tests
    scripts/deploy.ts                 # Full deployment + demo init

  zkml/                               # Python EZKL Pipeline
    train_model.py                    # PyTorch MLP training + ONNX export
    generate_proof.py                 # Full EZKL proving pipeline
    model.onnx                        # Trained model
    norm_params.json                  # Feature normalization parameters
    artifacts/                        # Keys, proofs, circuit, SRS

  src/                                # Next.js 14 Frontend
    app/
      page.tsx                        # Landing (server component)
      dashboard/page.tsx              # Dashboard (client)
      verify/page.tsx                 # Verify demo (client)
      agent/[id]/page.tsx             # Agent profile (client)
      api/prove/route.ts              # EZKL proof generation endpoint
      api/agents/route.ts             # Chain data reader
      api/records/route.ts            # Verification records
      api/history/[id]/route.ts       # Per-agent history
      api/weather/route.ts            # Simulated DePIN data
      providers.tsx                   # wagmi + RainbowKit (SSR-safe)
      web3-provider.tsx               # Client-only web3 wrapper
    components/NavBar.tsx             # Responsive navigation
    lib/
      chain-reader.ts                 # Server-side viem client
      contracts.ts                    # ABI definitions
      contract-addresses.ts           # Deployed addresses
      wagmi-config.ts                 # Client wagmi config
```

---

## Standards Integration

### BAP-578 (Non-Fungible Agent)

MockNFA implements the agent identity standard with:
- `mint()` -- Create agent with metadata (name, persona, vaultURI, vaultHash)
- `setLogicAddress()` -- Bind ZKClawGateway as the agent's logic contract
- `executeAction()` -- Delegatecall to logic for sovereign decisions
- `PredictionProfile` -- On-chain track record (total, correct, reputation, learningRoot)
- `updateLearningRoot()` -- Merkle tree commitment for learning state

### ERC-8004 (Trustless Agents)

MockValidationRegistry implements pull-based validation with:
- `validationRequest()` -- NFA requests ZKML validation
- `validationResponse()` -- Gateway writes verified result (scores only go up, never down)
- `getSummary()` -- Third parties query aggregated trust score

### BNB Greenfield

`ZKClawGateway.anchorToGreenField()` stores:
- Greenfield object URI (e.g., `gnfd://zk-claw-bucket/proof-001`)
- Content hash (keccak256 of raw sensor data + proof artifacts)
- On-chain timestamp for immutable audit trail

---

## ML Model Details

| Parameter | Value |
|-----------|-------|
| Architecture | MLP: Linear(4,32) -> ReLU -> Linear(32,16) -> ReLU -> Linear(16,2) |
| Parameters | 738 |
| Training | 2000 synthetic weather samples, 1000 epochs, Adam lr=0.003 |
| Accuracy | 97.7% |
| Input | [temperature, humidity, wind_speed, rainfall] normalized to [0,1] |
| Output | [logit_normal, logit_claim] -- argmax determines decision |
| Claim trigger | temp < -5C OR temp > 40C OR wind > 100km/h OR rain > 200mm OR (humidity > 95% AND rain > 100mm) |

---

## Roadmap

- [x] Train PyTorch MLP + export ONNX
- [x] EZKL pipeline: prove + verify locally
- [x] 5 smart contracts + 28 tests
- [x] Deploy to BSC Testnet with demo state
- [x] Next.js 14 frontend (4 pages + 5 API routes)
- [x] DePIN hardware signature verification
- [x] Greenfield storage anchoring
- [x] 10-round end-to-end bug check
- [ ] Deploy Halo2Verifier on-chain (currently >24KB, exploring split deployment)
- [ ] Integrate real DePIN hardware (ESP32 + TEE key storage)
- [ ] BNB Greenfield SDK for actual object upload
- [ ] opBNB mainnet deployment (200M gas limit)
- [ ] Multi-agent coordination with cross-verified inference chains

---

## License

MIT
