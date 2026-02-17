"use client";

import { NavBar } from "@/components/NavBar";
import { useParams } from "next/navigation";

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.id as string;

  // Demo data
  const agent = {
    id: parseInt(agentId) || 0,
    name: "WeatherGuard-01",
    persona: "DePIN Insurance Analyst specializing in extreme weather risk assessment",
    vaultURI: "ipfs://QmExample123456789",
    totalPredictions: 15,
    correctPredictions: 12,
    reputationScore: 12,
    learningRoot: "0x7ba0ffef93f5e1439170b97948e833285d588181b64550b829a031e1724e6430",
  };

  const history = [
    {
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      decision: "CLAIM",
      verified: true,
      proofHash: "0x7ba0ff...4e6430",
      inputs: { temp: -8, humidity: 98, wind: 120, rain: 250 },
    },
    {
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      decision: "NORMAL",
      verified: true,
      proofHash: "0x036c00...000000",
      inputs: { temp: 25, humidity: 60, wind: 15, rain: 5 },
    },
    {
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      decision: "CLAIM",
      verified: true,
      proofHash: "0x4b1f00...000000",
      inputs: { temp: 42, humidity: 30, wind: 5, rain: 0 },
    },
  ];

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Agent Header */}
        <div className="p-6 rounded-xl border border-border bg-card mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground font-mono">NFA #{agent.id}</div>
              <h1 className="text-2xl font-bold mt-1">{agent.name}</h1>
              <p className="text-muted-foreground mt-2">{agent.persona}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold font-mono text-primary">
                {agent.reputationScore}
              </div>
              <div className="text-sm text-muted-foreground">Reputation Score</div>
            </div>
          </div>
        </div>

        {/* Profile Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Total Predictions</div>
            <div className="text-xl font-bold font-mono mt-1">{agent.totalPredictions}</div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Correct</div>
            <div className="text-xl font-bold font-mono mt-1 text-primary">
              {agent.correctPredictions}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Accuracy</div>
            <div className="text-xl font-bold font-mono mt-1">
              {Math.round((agent.correctPredictions / agent.totalPredictions) * 100)}%
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Vault</div>
            <div className="text-xs font-mono mt-2 text-muted-foreground truncate">
              {agent.vaultURI}
            </div>
          </div>
        </div>

        {/* BAP-578 Details */}
        <div className="p-4 rounded-xl border border-border bg-card mb-8">
          <h2 className="text-lg font-semibold mb-3">BAP-578 Metadata</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Learning Root (Merkle)</span>
              <span className="font-mono text-xs">{agent.learningRoot.slice(0, 20)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vault Hash</span>
              <span className="font-mono text-xs">keccak256(vault-data)</span>
            </div>
          </div>
        </div>

        {/* Verification History */}
        <h2 className="text-xl font-semibold mb-4">Verification History</h2>
        <div className="space-y-3">
          {history.map((record, i) => (
            <div key={i} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      record.verified ? "bg-primary" : "bg-destructive"
                    }`}
                  />
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      record.decision === "CLAIM"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {record.decision}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(record.timestamp).toLocaleString()}
                  </span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {record.proofHash}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                <span>T={record.inputs.temp}C</span>
                <span>H={record.inputs.humidity}%</span>
                <span>W={record.inputs.wind}km/h</span>
                <span>R={record.inputs.rain}mm</span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
