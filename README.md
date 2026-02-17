# ZK-Claw: Verifiable Intelligence Gateway

ZK-Claw is a verifiable intelligence gateway for AI agents on BNB Chain. It combines Zero-Knowledge Machine Learning (ZKML) with DePIN hardware authentication to ensure every AI agent decision is cryptographically provable and tamper-proof. Built on a 5-layer architecture spanning data capture, ZK proof generation, on-chain verification, and reputation settlement.

## Quick Links

| Content | Location |
| --- | --- |
| Problem, Solution, Impact | docs/PROJECT.md |
| Architecture, Setup, Demo | docs/TECHNICAL.md |
| Contract Addresses | bsc.address |
| Demo Video & Slides | docs/EXTRAS.md |

## Key Numbers

- 13 smart contracts deployed on BSC Testnet
- 107 contract tests passing
- 5-layer verification pipeline (DePIN → ZKML → Assembly → On-Chain → Settlement)
- 8 frontend pages + 5 API routes
- Standards: BAP-578, ERC-8004, ERC-6551, ERC-4337

## Tech Stack

- ZKML: EZKL (Halo2 proving system)
- Contracts: Solidity 0.8.24, Hardhat 3
- Frontend: Next.js 14, Tailwind CSS, wagmi v2, Reown AppKit
- Prover: FastAPI + Celery + Redis (Docker Compose)
- Agent: Node.js daemon with MQTT/Waku transport
- Network: BNB Smart Chain Testnet

## Quick Start

```bash
git clone https://github.com/caohuize111/zk-claw.git
cd zk-claw
npm install
npm run dev
```

See docs/TECHNICAL.md for full setup instructions.

## Repository Structure

- **/contracts** - 13 Solidity smart contracts (Hardhat 3)
- **/src** - Next.js 14 frontend (8 pages, 5 API routes)
- **/agent** - Agent daemon with transport layers
- **/prover-service** - FastAPI + Celery prover (Docker)
- **/zkml** - EZKL model artifacts and pipeline
- **/docs** - Project documentation
- **/.github** - CI/CD workflows

## License

MIT
