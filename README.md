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
|  ECDSA + Nonce       |     |  KZG Commitment     |     |  Lifecycle + Rep    |
+---------------------+     +---------------------+     +---------------------+
                                                                |
                                                                v
+---------------------+     +---------------------+
|  L5: Frontend       |<----|  L4: Gateway         |
|  Next.js 14         |     |  Dual Verification   |
|  wagmi v2           |     |  ZK + DePIN Gate     |
+---------------------+     +---------------------+
```

## How It Works (Data Flow)

1. **DePIN sensor signs data with hardware key** -- A registered weather station submits temperature, humidity, wind speed, and rainfall readings. The data is signed with the station's bound ECDSA key (simulating TEE/Secure Element). A per-station nonce prevents replay.

2. **Agent detects anomaly, sends to ZKML prover** -- The AI agent reads the authenticated sensor data and prepares normalized inputs for the ML model.

3. **EZKL generates Halo2 proof** -- The prover runs the 3-layer MLP through the EZKL circuit (`gen_witness` -> `prove`), producing a ZK-SNARK that proves honest inference without revealing model weights.

4. **Agent submits (proof, public_instances, station_id) to Gateway** -- The agent calls `submitVerifiedInference` with the full proof bytes and EZKL public instances.

5. **Gateway dual-verifies: ZK proof valid AND hardware signature valid** -- The Gateway calls the on-chain Halo2Verifier to check the ZK proof, then queries the DePIN Oracle to verify hardware signature authenticity, data freshness (30-minute window), and normalization cross-validation against public instances.

6. **Record created, NFA reputation updated, anchored to Greenfield** -- The inference record is stored on-chain with full audit trail. The agent's NFA reputation score is incremented, ERC-8004 validation entries are written, and proof data can be anchored to BNB Greenfield for permanent decentralized storage.

## Security Features

| Feature | Implementation |
|---------|---------------|
| Proof Replay Prevention | `keccak256(proof)` uniqueness check per submission |
| BN254 Signed Comparison | Handles negative logits via field wrap-around (`value > HALF_P` means negative) |
| Normalization Cross-Validation | On-chain DePIN raw data vs ZK public instances (tolerance +/-3 quantization units) |
| Data Freshness | 30-minute staleness window (`DATA_FRESHNESS_WINDOW = 1800`) |
| Hardware Signature | ECDSA verification via `ecrecover` against device registry |
| Dual Verification Hard Gate | Both ZK proof AND DePIN signature must pass -- `require()` enforced, invalid proof/data reverts transaction |
| Nonce-Protected DePIN Data | Per-station incrementing nonce prevents data replay |
| Merkle-Verified Learning | Agent learning history committed as Merkle root, verifiable on-chain |
| Anti-Sybil Reputation | Self-feedback blocked in ReputationRegistry (ERC-8004) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Hardhat 3, OpenZeppelin 5.x |
| ZKML | EZKL v23, Halo2 (KZG), ONNX Runtime |
| Frontend | Next.js 14, Tailwind CSS, wagmi v2, RainbowKit |
| Prover Service | FastAPI, Python 3.11, Docker |
| Agent Standard | BAP-578 (NFA), ERC-8004 (Validation + Reputation) |
| Agent Wallet | ERC-6551 Token Bound Account (per-NFA smart wallet) |
| Gas Abstraction | ERC-4337 Paymaster (sponsored agent transactions) |
| Network | BNB Smart Chain Testnet |

## Smart Contracts

### Core Contracts

| Contract | Purpose |
|----------|---------|
| `ZKClawGateway` | Core orchestrator: dual verification hard gate (ZK + DePIN), inference recording, Greenfield anchoring |
| `NFA` (BAP-578) | Non-Fungible Agent with lifecycle management, BNB funding, ERC-6551 TBA auto-creation, reputation tracking, Merkle-verified learning |
| `Halo2Verifier` | EZKL-generated on-chain ZK proof verifier (Halo2 KZG, logrows=15) |
| `Halo2VerifierV2` | V2 verifier for in-circuit normalized model (raw sensor inputs as public inputs) |
| `MockDePINOracle` | Hardware signature verification via ECDSA, device registry, nonce-based replay protection |
| `ValidationRegistry` | ERC-8004 pull-based validation: request/response with monotonic scoring |
| `ReputationRegistry` | ERC-8004 push-based reputation: feedback, revocation, WAD-normalized aggregation |

### Agent Infrastructure (v2)

| Contract | Purpose |
|----------|---------|
| `ERC6551Registry` | Token Bound Account factory: creates per-NFA smart contract wallets |
| `ERC6551Account` | TBA implementation: owner derived from NFT, executeCall for autonomous transactions |
| `AgentPaymaster` | Simplified ERC-4337 gas sponsorship: approveAgent/revokeAgent/sponsoredCall |
| `BatchVerifier` | Proof aggregation: batch verification + batch gateway submission in single transaction |

### Deployed Contracts (BSC Testnet)

| Contract | Address |
|----------|---------|
| MockVerifier | `0x319729205CfBFd9CD1e8130Ed9D342542e310386` |
| MockNFA | `0x9B83Bb788B4f96cA8c377EAFC5610502140214d1` |
| MockValidationRegistry | `0x7f54dA182693394Ff0Bf77479e6d7b9003cf8f25` |
| MockDePINOracle | `0xed7B5A8fc0249BdfB70363C083Ea828976eDFe89` |
| ZKClawGateway | `0xae765e473f5549607093B1685e3199Bd6f0AD058` |

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

## Quick Start

```bash
# Clone
git clone https://github.com/caohuize111/zk-claw.git
cd zk-claw

# Install dependencies
npm install
cd contracts && npm install && cd ..

# Run contract tests (74 tests)
cd contracts && npx hardhat test

# Start frontend
npm run dev

# Run prover service (requires EZKL + Python 3.11)
cd prover-service
pip install -r requirements.txt
python main.py
```

### EZKL Pipeline (one-time setup)

```bash
cd zkml
pip install ezkl torch numpy onnx

# Train model and export ONNX
python train_model.py

# V1 pipeline: settings -> compile -> setup -> prove -> verify -> generate EVM verifier
python generate_proof.py

# V2 pipeline (in-circuit normalization): build normalized model + full pipeline
python build_normalized_model.py
python generate_proof_v2.py
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

## Project Structure

```
zk-claw/
  contracts/                    # Hardhat 3 smart contracts (74 tests)
    contracts/
      ZKClawGateway.sol         # Core gateway: dual verification hard gate + recording
      NFA.sol                   # BAP-578 NFA + ERC-6551 TBA auto-creation
      MockDePINOracle.sol       # DePIN hardware signature oracle + nonce replay protection
      BatchVerifier.sol         # Proof aggregation: batch verify + batch submit
      ValidationRegistry.sol    # ERC-8004 validation registry
      ReputationRegistry.sol    # ERC-8004 reputation registry
      verifier/
        Halo2Verifier.sol       # EZKL-generated verifier (v1, logrows=15)
        Halo2VerifierV2.sol     # EZKL-generated verifier (v2, in-circuit normalization)
      agent/
        ERC6551Registry.sol     # Token Bound Account factory
        ERC6551Account.sol      # TBA implementation (owner = NFT holder)
        AgentPaymaster.sol      # ERC-4337 gas sponsorship
      interfaces/
        IHalo2Verifier.sol
        IBAP578.sol
    test/
      ZKClaw.test.ts            # Contract test suite (74 tests)
  src/                          # Next.js 14 frontend
    app/
      page.tsx                  # Landing page
      dashboard/page.tsx        # Dashboard with stats
      verify/page.tsx           # 5-layer pipeline visualization + chain submission
      agent/[id]/page.tsx       # Agent profile and history
    lib/
      contracts.ts              # ABI definitions
      wagmi-config.ts           # Chain and contract config
    components/
      NavBar.tsx                # Responsive navigation
  zkml/                         # EZKL pipeline
    model.onnx                  # V1: trained 3-layer MLP (normalized inputs)
    model_v2.onnx               # V2: MLP with in-circuit normalization (raw inputs)
    train_model.py              # Model training + ONNX export
    generate_proof.py           # V1 EZKL 8-step pipeline
    generate_proof_v2.py        # V2 EZKL pipeline (in-circuit normalization)
    build_normalized_model.py   # ONNX graph surgery: prepend normalization layer
    optimize.py                 # Logrows benchmarking
    norm_params.json            # Min-max normalization parameters
    artifacts/                  # V1 generated proofs, keys, SRS, verifier
    artifacts_v2/               # V2 generated proofs, keys, SRS, verifier
  prover-service/               # Standalone proof generation API
    main.py                     # FastAPI async prover with semaphore
    Dockerfile                  # Docker deployment config
  agent/                        # AI Agent daemon
    daemon.ts                   # 5-layer automated inference pipeline
    package.json                # ethers v6 + tsx
    .env.example                # Configuration template
```

## Roadmap

| Feature | V1 (Deployed) | V2 (Implemented) | V3 (Planned) |
|---------|--------------|-------------------|---------------|
| Data Normalization | On-chain cross-validation | In-circuit preprocessing (ONNX graph surgery) | Full model retraining with raw inputs |
| Agent Wallet | NFA + logic address | ERC-6551 Token Bound Account (auto-created on mint) | Multi-chain TBA |
| Gas Management | User pays | ERC-4337 Paymaster (sponsoredCall) | EntryPoint v0.7 integration |
| Proof Scaling | Single verification | BatchVerifier (batch verify + submit) | Recursive proof aggregation |
| Hardware Trust | ECDSA simulation | Nonce-based replay protection | TEE/SE (IoTeX W3bstream, Phala) |
| Prover Infrastructure | FastAPI + semaphore | Dual-mode API (pregenerated + realtime) | GPU cluster + Celery/Redis |
| Data Transport | Direct submission | Agent daemon (auto-monitor) | MQTT / Waku decentralized messaging |
| Verification Gate | Soft check (log only) | Hard gate (require + revert) | Slashing for malicious submissions |

## Known Limitations

- **V1 normalization**: Performed outside the ZK circuit; on-chain cross-validation compensates but is not zero-knowledge itself. V2 model with in-circuit normalization is implemented but its verifier (71.6KB) exceeds the 24KB EIP-170 deployment limit -- production use requires split deployment or further circuit optimization
- TEE/Secure Enclave is simulated with EOA keys (production requires real hardware integration)
- Single-station verification (no multi-station consensus/quorum)
- Halo2Verifier V1 uses logrows=15 (13.1KB, within 24KB limit); V2 needs higher logrows due to normalization ops
- AgentPaymaster uses a simplified `sponsoredCall` pattern rather than full ERC-4337 EntryPoint integration (sufficient for BSC testnet demo)

## License

MIT
