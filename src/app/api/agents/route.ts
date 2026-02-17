import { NextResponse } from "next/server";

// Demo agent data (until contracts deployed + frontend reads on-chain)
const AGENTS = [
  {
    id: 0,
    name: "WeatherGuard-01",
    persona: "DePIN Insurance Analyst",
    reputationScore: 12,
    totalPredictions: 15,
    correctPredictions: 12,
    vaultURI: "ipfs://QmExample123",
    learningRoot: "0x7ba0ffef93f5e1439170b97948e833285d588181b64550b829a031e1724e6430",
    isActive: true,
  },
  {
    id: 1,
    name: "StormWatcher-01",
    persona: "Extreme Weather Monitor",
    reputationScore: 8,
    totalPredictions: 10,
    correctPredictions: 8,
    vaultURI: "ipfs://QmStorm456",
    learningRoot: "0x036c000000000000000000000000000000000000000000000000000000000000",
    isActive: true,
  },
  {
    id: 2,
    name: "ClimateOracle-01",
    persona: "Climate Risk Assessor",
    reputationScore: 5,
    totalPredictions: 6,
    correctPredictions: 5,
    vaultURI: "ipfs://QmClimate789",
    learningRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
    isActive: true,
  },
];

export async function GET() {
  return NextResponse.json({ agents: AGENTS, total: AGENTS.length });
}
