# ZK-Claw: Verifiable Intelligence Gateway for Sovereign AI Agents

**Unruggable AI -- Every agent decision backed by mathematical proof.**

ZK-Claw is a verifiable intelligence gateway that combines DePIN hardware-signed sensor data, ZKML (Zero-Knowledge Machine Learning) proof of AI inference, and on-chain reputation accumulation for Non-Fungible Agents (NFA). Built for the BNB Chain ecosystem.

## Architecture

```
DePIN Sensor (Hardware Signed)
        |
        v
  MockDePINOracle ---- ecrecover signature verification
        |
        v
  ZKML Inference (EZKL) ---- PyTorch MLP -> ONNX -> ZK Proof
        |
        v
  ZKClawGateway ---- on-chain proof verification + decision recording
       / | \
      v  v  v
   NFA   ERC-8004   Greenfield
(BAP-578) (Validation) (Storage Anchor)
```

**Dual Trust Architecture:**
- **Layer 1 (Data Authenticity):** Hardware sensor keys sign raw data; `ecrecover` on-chain verifies the source is genuine -- prevents fake data attacks.
- **Layer 2 (Inference Integrity):** EZKL generates ZK-SNARK proofs that the ML model executed correctly on the signed data -- no one can tamper with the decision logic.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Model | PyTorch MLP (4->32->16->2), 97.7% accuracy |
| ZK Proving | EZKL v23 (Halo2), proof size ~18KB |
| Smart Contracts | Solidity 0.8.24, Hardhat v3, OpenZeppelin v5 |
| Frontend | Next.js 14, wagmi v2, RainbowKit, shadcn/ui |
| Network | BSC Testnet (production target: opBNB) |
| Storage | BNB Greenfield (anchor references on-chain) |

## Smart Contracts (BSC Testnet)

| Contract | Address | Role |
|----------|---------|------|
| MockVerifier | `0x319729205CfBFd9CD1e8130Ed9D342542e310386` | ZK proof verification |
| MockNFA (BAP-578) | `0x9B83Bb788B4f96cA8c377EAFC5610502140214d1` | Agent identity + reputation |
| MockValidationRegistry (ERC-8004) | `0x7f54dA182693394Ff0Bf77479e6d7b9003cf8f25` | Verifiable trust history |
| MockDePINOracle | `0xed7B5A8fc0249BdfB70363C083Ea828976eDFe89` | Hardware-signed sensor data |
| ZKClawGateway | `0xae765e473f5549607093B1685e3199Bd6f0AD058` | Core orchestrator |

## How It Works

### 1. DePIN Data Collection
Weather sensors (simulating Marco-style hardware) collect temperature, humidity, wind speed, and rainfall. Each reading is signed with the station's private key (stored in Secure Element / TEE in production).

### 2. ZKML Inference
The signed data feeds into a PyTorch MLP trained on 2000 weather samples. EZKL converts the ONNX model into a Halo2 arithmetic circuit, generating a ZK-SNARK proof that the inference was executed correctly -- without revealing model weights.

### 3. On-Chain Verification
`ZKClawGateway.submitVerifiedInference()` performs dual verification:
- Checks the ZK proof via the Halo2 verifier
- Checks the DePIN data signature via `ecrecover`
- Records the decision (normal / claim triggered)
- Updates the NFA's reputation score (BAP-578)
- Writes validation entry to ERC-8004 registry
- Anchors proof data to BNB Greenfield

### 4. Reputation Accumulation
Each successful verification increases the agent's on-chain reputation. The score is part of the NFA (NFT) -- it cannot be faked, only earned through verified actions. Third parties query `getSummary()` to audit trust history.

## Quick Start

### Prerequisites
- Node.js >= 18
- Python 3.10+ with `ezkl`, `torch`, `numpy`

### Install & Build
```bash
# Frontend
npm install
npm run build

# Contracts
cd contracts
npm install
npx hardhat test   # 28 tests
```

### Run ZKML Pipeline
```bash
cd zkml
python train_model.py      # Train model, export ONNX
python generate_proof.py   # Full EZKL pipeline: settings -> proof -> verifier
```

### Deploy Contracts
```bash
cd contracts
PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network bscTestnet
```

### Run Frontend
```bash
npm run dev
# Open http://localhost:3000
```

## Project Structure

```
zk-claw/
  contracts/           # Hardhat v3 + Solidity
    contracts/
      ZKClawGateway.sol
      MockNFA.sol              # BAP-578
      MockValidationRegistry.sol  # ERC-8004
      MockDePINOracle.sol      # Hardware signature verification
      MockVerifier.sol
    test/ZKClaw.test.ts        # 28 tests
    scripts/deploy.ts
  zkml/                # EZKL ZKML Pipeline
    train_model.py
    generate_proof.py
    model.onnx
    input.json
  src/                 # Next.js 14 Frontend
    app/
      page.tsx                 # Landing
      dashboard/page.tsx       # Agent overview
      verify/page.tsx          # Core demo flow
      agent/[id]/page.tsx      # Agent profile
      api/prove/route.ts       # EZKL proof generation
      api/weather/route.ts     # Simulated DePIN data
```

## Standards Integration

- **BAP-578 (NFA):** Agent identity as NFT with PredictionProfile, logicAddress binding, Merkle Tree Learning state
- **ERC-8004 (Trustless Agents):** Pull-based validation registry with monotonically increasing scores (0-100)
- **BNB Greenfield:** Decentralized storage for raw sensor data and proof artifacts; on-chain anchoring via content hash

## Roadmap

- [ ] Deploy Halo2Verifier on-chain (currently >24KB, exploring split deployment)
- [ ] Integrate real DePIN hardware (ESP32 + TEE for key storage)
- [ ] BNB Greenfield SDK integration for actual object storage
- [ ] opBNB mainnet deployment (200M gas limit for ZK verification)
- [ ] Lagrange DeepProve integration for sub-second proof generation
- [ ] Multi-agent coordination with cross-verified inference chains

## License

MIT
