# ZK-Claw

**Verifiable Intelligence Gateway for Sovereign AI Agents on BNB Chain**

ZK-Claw makes AI agent decisions trustless by fusing DePIN hardware signatures, zero-knowledge ML proofs, and on-chain dual verification into a single atomic transaction.

## The Problem

AI agents managing on-chain assets are opaque black boxes. Users have no way to verify whether an agent's input data is genuine (it could be fabricated), whether its ML computation was honest (it could be manipulated), or whether its decisions are accountable (there is no audit trail). Without cryptographic guarantees at both the data layer and the computation layer, autonomous agents remain fundamentally untrustworthy for any high-stakes on-chain operation.

## Architecture

```
+---------------------+     +---------------------+     +---------------------+
|  L1: DePIN Oracle   |---->|  L2: ZKML Prover    |---->|  L3: AI Agent       |
|  Hardware Signing    |     |  EZKL + Halo2       |     |  NFA (BAP-578)      |
|  ECDSA + Nonce       |     |  KZG Commitment     |     |  ERC-6551 TBA       |
+---------------------+     +---------------------+     +---------------------+
         |                                                       |
         v                                                       v
+---------------------+     +---------------------+     +---------------------+
|  DePIN Transport    |     |  L4: Gateway         |     |  Agent Infra        |
|  MQTT / Waku P2P    |     |  Dual Verification   |     |  Paymaster + Stake  |
|  Multi-Station      |     |  ZK + DePIN Gate     |     |  Batch Verifier     |
+---------------------+     +---------------------+     +---------------------+
                                      |
                                      v
                             +---------------------+
                             |  L5: Frontend       |
                             |  Next.js 14         |
                             |  wagmi v2 + SSE     |
                             +---------------------+
```

## How It Works (Data Flow)

1. **DePIN sensor signs data with hardware key** -- A registered weather station submits temperature, humidity, wind speed, and rainfall readings. The data is signed with the station's bound ECDSA key (simulating TEE/Secure Element). A per-station nonce prevents replay.

2. **Multi-station consensus (optional)** -- Multiple stations reporting on the same region are grouped. `MultiStationConsensus` reads all station data and checks that readings fall within configurable tolerance bounds, ensuring no single station can fabricate data.

3. **Agent detects anomaly, sends to ZKML prover** -- The AI agent reads the authenticated sensor data and prepares normalized inputs for the ML model.

4. **EZKL generates Halo2 proof** -- The prover runs the 3-layer MLP through the EZKL circuit (`gen_witness` -> `prove`), producing a ZK-SNARK that proves honest inference without revealing model weights.

5. **Agent submits (proof, public_instances, station_id) to Gateway** -- The agent calls `submitVerifiedInference` with the full proof bytes and EZKL public instances.

6. **Gateway dual-verifies: ZK proof valid AND hardware signature valid** -- The Gateway calls the on-chain Halo2Verifier to check the ZK proof, then queries the DePIN Oracle to verify hardware signature authenticity, data freshness (30-minute window), and normalization cross-validation against public instances. Both gates must pass or the transaction reverts.

7. **Record created, NFA reputation updated, anchored to Greenfield** -- The inference record is stored on-chain with full audit trail. The agent's NFA reputation score is incremented (both total and correct predictions tracked), ERC-8004 validation entries are written, and proof data can be anchored to BNB Greenfield for permanent decentralized storage.

## Security Features

| Feature | Implementation |
|---------|---------------|
| Proof Replay Prevention | `keccak256(proof)` uniqueness check per submission |
| BN254 Signed Comparison | Handles negative logits via field wrap-around (`value > HALF_P` means negative) |
| Normalization Cross-Validation | On-chain DePIN raw data vs ZK public instances (tolerance +/-3 quantization units) |
| Data Freshness | 30-minute staleness window (`DATA_FRESHNESS_WINDOW = 1800`) |
| Hardware Signature | ECDSA verification via `ecrecover` against device registry |
| Dual Verification Hard Gate | Both ZK proof AND DePIN signature must pass -- `require()` enforced, reverts on failure |
| Nonce-Protected DePIN Data | Per-station incrementing nonce prevents data replay |
| Two-Step Admin Transfer | `transferAdmin` -> `pendingAdmin` -> `acceptAdmin` pattern on Gateway and DePINOracle |
| Reentrancy Protection | OpenZeppelin `ReentrancyGuard` on Gateway, NFA, ERC6551Account |
| Merkle-Verified Learning | Agent learning history committed as Merkle root, verifiable on-chain |
| Anti-Sybil Reputation | Self-feedback blocked in ReputationRegistry (ERC-8004) |
| Lifetime Mint Cap | Per-address mint count enforced (not bypassable via transfer) |
| Staking & Slashing | Operators stake BNB; 10% slash penalty for misbehavior |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Hardhat 3, OpenZeppelin 5.x |
| ZKML | EZKL v23, Halo2 (KZG), ONNX Runtime |
| Frontend | Next.js 14, Tailwind CSS, wagmi v2, RainbowKit |
| Prover Service | FastAPI, Celery + Redis, Python 3.11, Docker Compose |
| Agent Standard | BAP-578 (NFA), ERC-8004 (Validation + Reputation) |
| Agent Wallet | ERC-6551 Token Bound Account (per-NFA smart wallet) |
| Gas Abstraction | ERC-4337 EntryPoint + AgentPaymaster |
| DePIN Transport | MQTT (opt-in), Waku P2P (opt-in) |
| Storage | BNB Greenfield anchoring (on-chain URI recording) |
| Network | BNB Smart Chain Testnet (chainId 97) |

## Smart Contracts (13 deployed)

### Core Contracts

| Contract | Purpose |
|----------|---------|
| `ZKClawGateway` | Core orchestrator: dual verification hard gate (ZK + DePIN), inference recording, auto-payout, Greenfield anchoring, UUPS upgradeable |
| `NFA` (BAP-578) | Non-Fungible Agent with lifecycle management (pause/resume/terminate), BNB funding, ERC-6551 TBA auto-creation, reputation tracking, Merkle-verified learning |
| `Halo2Verifier` | EZKL-generated on-chain ZK proof verifier (Halo2 KZG, logrows=15) |
| `DePINOracle` | Hardware signature verification via ECDSA, device registry, nonce-based replay protection, two-step admin transfer |
| `ValidationRegistry` | ERC-8004 pull-based validation: request/response with monotonic scoring |
| `ReputationRegistry` | ERC-8004 push-based reputation: feedback, revocation, WAD-normalized aggregation |

### Agent Infrastructure

| Contract | Purpose |
|----------|---------|
| `ERC6551Registry` | Token Bound Account factory: creates per-NFA smart contract wallets |
| `ERC6551Account` | TBA implementation: owner derived from NFT, executeCall with reentrancy guard |
| `AgentPaymaster` | ERC-4337 gas sponsorship: approveAgent/revokeAgent/sponsoredCall |
| `EntryPoint` | Simplified ERC-4337 entry point: validateUserOp + batch handleOps |
| `BatchVerifier` | Proof aggregation: batch verification + Merkle root submission |

### DePIN & Staking

| Contract | Purpose |
|----------|---------|
| `StakeSlash` | Operator BNB staking with 10% slashing penalty (manual governance) |
| `MultiStationConsensus` | Multi-station data consensus with configurable tolerance bounds |

### Deployed Addresses (BSC Testnet)

| Contract | Address |
|----------|---------|
| Halo2Verifier | `0x821178a3F39E74BAea65096779d0ef4A45D237E3` |
| NFA (BAP-578) | `0x55FA67f9cF6ca4680fbae3594c82bC59E934174e` |
| ValidationRegistry | `0x3426bf7c5c20A9a9351860cE6B3Ba053fA5eD799` |
| ReputationRegistry | `0xB789cD02880D69aeFFab27Cd0fcCfe135f2C6846` |
| DePINOracle | `0x51541674cA5E54a496e2A0F157d32fdBA04E3a48` |
| ZKClawGateway | `0xC9A6624cEB63F805a27200876abCF656cba7Bbab` |
| BatchVerifier | `0x09d0601CafA279dC2AcbD23B830F2E96Bd7C1a39` |
| AgentPaymaster | `0x0ceDCff4104E8Cb6f0cB4B7333B67877cD0C9D69` |
| EntryPoint | `0xa638dCC4fDCB4b3424f0B74Cb13Eb737954256f4` |
| ERC6551Registry | `0x9d0641f1C0487c0d93007742a0AE3B07DE5b54C0` |
| ERC6551Account | `0xB2c45C459CF69f8f742D43bB099f7d07856e6fb1` |
| StakeSlash | `0xeeeEF5B5e1519a3286612Cf74637B40C2ed0fD4D` |
| MultiStationConsensus | `0xD53F834c099Ac5e21c29F7461Ee662BD33Ac7EB0` |

**Deployer**: `0xEF3e8cF1bd5F2836e414153e27c569093695ea31`

## Testing

**154 tests across 3 test suites, 0 failures.**

| Test Suite | Tests | Coverage |
|-----------|-------|----------|
| `ZKClaw.test.ts` | 86 | Core contracts: Gateway, NFA, DePINOracle, Halo2Verifier, ValidationRegistry, ReputationRegistry |
| `NewContracts.test.ts` | 34 | Agent infrastructure: ERC6551, Paymaster, EntryPoint, BatchVerifier, StakeSlash, Consensus |
| `E2E.test.ts` | 34 | 10 full end-to-end chain flows |

### E2E Test Flows

1. DePIN station registration + hardware ECDSA signature + bad signature detection
2. NFA BAP-578 minting + ERC-6551 TBA auto-creation + 3-per-address lifetime cap
3. Gateway verified inference (CLAIM/NORMAL decisions + replay prevention + Greenfield anchoring)
4. Batch verification + Merkle root submission
5. Multi-station consensus (pass + fail scenarios with tolerance bounds)
6. Staking + 10% slash penalty + unstake
7. Paymaster gas sponsorship + agent approval/revocation
8. Two-step admin transfer + cross-contract access control
9. NFA lifecycle (pause/resume/terminate -- irreversible)
10. Cross-contract integration consistency

## ZKML Pipeline

The EZKL pipeline converts a trained ONNX model into a verifiable ZK circuit:

```
gen_settings -> calibrate -> compile -> gen_srs -> setup -> gen_witness -> prove -> verify
```

Then for on-chain deployment:

```
create_evm_verifier -> deploy Halo2Verifier.sol
```

### V1 Model (deployed)

**Model**: 3-layer MLP (4 -> 32 -> 16 -> 2), 738 parameters, 97.7% accuracy

- **Inputs**: `[temperature, humidity, windSpeed, rainfall]` (min-max normalized)
- **Outputs**: `[logit_normal, logit_claim]` (BN254 field elements, negative values wrap around `p`)
- **Decision**: `logit_claim > logit_normal` triggers CLAIM, otherwise NORMAL
- **Claim trigger**: temp < -5C OR temp > 40C OR wind > 100km/h OR rain > 200mm OR (humidity > 95% AND rain > 100mm)

Normalization parameters are stored in `norm_params.json` and cross-validated on-chain against DePIN raw data.

### V2 Model (in-circuit normalization)

**Model**: Same MLP with prepended normalization layer via ONNX graph surgery (`build_normalized_model.py`)

- **Inputs**: Raw sensor values `[temperature, humidity, windSpeed, rainfall]` (no external preprocessing)
- **Normalization**: `(x - min) / (max - min)` computed inside the ZK circuit
- **Security**: Eliminates normalization spoofing attack -- raw data becomes the public input, verifiable against DePIN oracle
- **Verifier**: `Halo2VerifierV2.sol` (71.6KB source -- requires split deployment for production, see Known Limitations)

## Frontend (7 pages + 5 API routes)

| Route | Description |
|-------|-------------|
| `/` | Landing page: architecture overview, feature highlights |
| `/dashboard` | Agent list with reputation scores, mint/manage entry point |
| `/verify` | Core demo: weather data input, ZK proof generation, on-chain submission with real-time progress |
| `/agent/[id]` | Agent profile: BAP-578 metadata, TBA wallet address, verification history |
| `/agent/[id]/manage` | Agent management: mint, pause/resume/terminate, fund/withdraw |
| `/paymaster` | Paymaster admin: approve/revoke agents, fund/withdraw treasury |
| `/batch` | Batch verification: JSON proof input, preview verification results |

| API Route | Description |
|-----------|-------------|
| `POST /api/prove` | ZK proof generation (demo mode or remote prover with API key auth) |
| `GET /api/agents` | On-chain agent list via viem |
| `GET /api/records` | Recent 20 verification records |
| `GET /api/history/[id]` | Single agent verification history |
| `GET /api/sse` | SSE real-time proof progress (UUID validation) |

## Quick Start

```bash
# Clone
git clone https://github.com/caohuize111/zk-claw.git
cd zk-claw

# Install dependencies
npm install
cd contracts && npm install && cd ..

# Run contract tests (154 tests)
cd contracts && npx hardhat test

# Start frontend
npm run dev

# Run prover service (requires EZKL + Python 3.11)
cd prover-service
pip install -r requirements.txt
python main.py

# Or with Docker Compose (Redis + FastAPI + Celery worker)
docker compose up
```

### EZKL Pipeline (one-time setup)

```bash
cd zkml
pip install ezkl torch numpy onnx onnxruntime

# Train model and export ONNX
python train_model.py

# V1 pipeline: settings -> compile -> setup -> prove -> verify -> generate EVM verifier
python generate_proof.py          # Use --no-clean to preserve existing artifacts

# V2 pipeline (in-circuit normalization)
python build_normalized_model.py
python generate_proof_v2.py       # Use --no-clean to preserve existing artifacts
```

### Agent Daemon

```bash
cd agent
npm install

# Demo mode (single inference cycle)
npm run demo

# Continuous monitoring mode
npm run start
```

Configure via `agent/.env` (see `.env.example`):
- `PRIVATE_KEY` -- Agent operator key
- `STATION_ID` -- DePIN station to monitor
- `API_URL` -- Prover service endpoint
- `PROVER_API_KEY` -- API authentication key
- `USE_MQTT` / `MQTT_BROKER_URL` -- Optional MQTT transport
- `USE_GREENFIELD` -- Optional Greenfield storage anchoring

## Project Structure

```
zk-claw/
  contracts/                        # Hardhat 3 smart contracts (154 tests)
    contracts/
      ZKClawGateway.sol             # Core gateway: dual verification + recording + UUPS
      NFA.sol                       # BAP-578 NFA + ERC-6551 TBA + reputation
      DePINOracle.sol               # Hardware signature oracle + nonce replay protection
      BatchVerifier.sol             # Proof aggregation: batch verify + Merkle root
      ValidationRegistry.sol        # ERC-8004 validation registry
      ReputationRegistry.sol        # ERC-8004 reputation registry
      verifier/
        Halo2Verifier.sol           # EZKL-generated verifier (v1, logrows=15)
        Halo2VerifierV2.sol         # EZKL-generated verifier (v2, in-circuit normalization)
      agent/
        ERC6551Registry.sol         # Token Bound Account factory
        ERC6551Account.sol          # TBA implementation (owner = NFT holder)
        AgentPaymaster.sol          # ERC-4337 gas sponsorship
        EntryPoint.sol              # Simplified ERC-4337 entry point
      staking/
        StakeSlash.sol              # BNB staking + 10% slash penalty
      consensus/
        MultiStationConsensus.sol   # Multi-station data consensus
      proxy/
        ZKClawGatewayV2.sol         # UUPS upgrade demo (not for production)
    test/
      ZKClaw.test.ts                # Core contract tests (86 tests)
      NewContracts.test.ts          # Agent infrastructure tests (34 tests)
      E2E.test.ts                   # End-to-end chain flow tests (34 tests)
    scripts/
      deploy.ts                     # Full deployment script (13 contracts + demo state)
  src/                              # Next.js 14 frontend
    app/
      page.tsx                      # Landing page
      dashboard/page.tsx            # Agent list + reputation
      verify/page.tsx               # Core demo: ZK proof + on-chain submission
      agent/[id]/page.tsx           # Agent profile + history
      agent/[id]/manage/page.tsx    # Agent lifecycle management
      paymaster/page.tsx            # Paymaster admin
      batch/page.tsx                # Batch verification
      api/prove/route.ts            # ZK proof generation API
      api/agents/route.ts           # Agent list API
      api/records/route.ts          # Verification records API
      api/history/[id]/route.ts     # Agent history API
      api/sse/route.ts              # SSE real-time progress
    lib/
      contracts.ts                  # ABI definitions
      contract-addresses.ts         # Auto-generated deployed addresses
      wagmi-config.ts               # Chain and wallet config
      chain-reader.ts               # Server-side viem reads
    components/
      NavBar.tsx                    # Responsive navigation
  zkml/                             # EZKL pipeline
    model.onnx                      # V1: trained 3-layer MLP (normalized inputs)
    model_v2.onnx                   # V2: MLP with in-circuit normalization (raw inputs)
    train_model.py                  # Model training + ONNX export
    generate_proof.py               # V1 EZKL 8-step pipeline (--no-clean flag)
    generate_proof_v2.py            # V2 EZKL pipeline (--no-clean flag)
    build_normalized_model.py       # ONNX graph surgery: prepend normalization layer
    optimize.py                     # Logrows benchmarking
    norm_params.json                # Min-max normalization parameters
    artifacts/                      # V1 generated proofs, keys, SRS, verifier
    artifacts_v2/                   # V2 generated proofs, keys, SRS, verifier
  prover-service/                   # Standalone proof generation API
    main.py                         # FastAPI async prover (Celery/Redis or asyncio)
    worker.py                       # Celery worker for async proof generation
    celery_app.py                   # Celery configuration
    docker-compose.yml              # 3-service stack (Redis + API + Worker)
    Dockerfile                      # Docker deployment config
    requirements.txt                # Python dependencies
  agent/                            # AI Agent daemon
    daemon.ts                       # 5-layer automated inference pipeline
    transport/
      mqtt-transport.ts             # MQTT transport (opt-in, reconnect + timeout)
      waku-transport.ts             # Waku P2P transport (opt-in)
    storage/
      greenfield-client.ts          # BNB Greenfield storage (placeholder)
    bundler/
      pimlico-client.ts             # Pimlico ERC-4337 bundler client
    package.json                    # ethers v6 + tsx
    .env.example                    # Configuration template
  .github/workflows/
    ci.yml                          # CI: test-contracts, build-frontend, lint-prover, lint-agent
```

## Roadmap

| Feature | V1 (Deployed) | V2 (Implemented) | V3 (Planned) |
|---------|--------------|-------------------|---------------|
| Data Normalization | On-chain cross-validation | In-circuit preprocessing (ONNX graph surgery) | Full model retraining with raw inputs |
| Agent Wallet | NFA + logic address | ERC-6551 Token Bound Account (auto-created on mint) | Multi-chain TBA |
| Gas Management | User pays | ERC-4337 Paymaster (sponsoredCall) | Full EntryPoint v0.7 integration |
| Proof Scaling | Single verification | BatchVerifier (batch verify + Merkle root) | Recursive proof aggregation |
| Hardware Trust | ECDSA simulation | Nonce-based replay protection | TEE/SE (IoTeX W3bstream, Phala) |
| Prover Infrastructure | FastAPI + semaphore | Celery/Redis dual-mode + Docker Compose | GPU cluster + distributed proving |
| Data Transport | Direct submission | Agent daemon + MQTT | Waku decentralized P2P messaging |
| Verification Gate | Soft check (log only) | Hard gate (require + revert) | Auto-slashing for malicious submissions |
| Consensus | Single station | Multi-station consensus (toleranceBps) | Weighted consensus with reputation |
| Storage | On-chain only | BNB Greenfield anchoring | IPFS + Greenfield redundancy |

## Known Limitations

- **V1 normalization**: Performed outside the ZK circuit; on-chain cross-validation compensates but is not zero-knowledge itself. V2 model with in-circuit normalization is implemented but its verifier (71.6KB) exceeds the 24KB EIP-170 deployment limit -- production use requires split deployment or further circuit optimization
- TEE/Secure Enclave is simulated with EOA keys (production requires real hardware integration)
- Halo2Verifier V1 uses logrows=15 (13.1KB, within 24KB limit); V2 needs higher logrows due to normalization ops
- AgentPaymaster uses a simplified `sponsoredCall` pattern rather than full ERC-4337 EntryPoint integration (sufficient for BSC testnet demo)
- StakeSlash is wired for manual governance -- automatic slashing triggered by Gateway verification failures is planned for V3
- BNB Greenfield upload is a placeholder for the hackathon; on-chain `anchorToGreenField` records URIs but actual object storage integration is future work

## License

MIT
