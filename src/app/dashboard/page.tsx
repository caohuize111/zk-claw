"use client";

import { NavBar } from "@/components/NavBar";
import { useState, useEffect } from "react";

interface AgentInfo {
  id: number;
  name: string;
  persona: string;
  reputationScore: number;
  totalPredictions: number;
  correctPredictions: number;
}

interface VerificationRecord {
  agentId: number;
  agentName: string;
  decision: string;
  verified: boolean;
  timestamp: string;
  proofHash: string;
}

// Demo data (until contracts deployed)
const DEMO_AGENTS: AgentInfo[] = [
  {
    id: 0,
    name: "WeatherGuard-01",
    persona: "DePIN Insurance Analyst",
    reputationScore: 12,
    totalPredictions: 15,
    correctPredictions: 12,
  },
  {
    id: 1,
    name: "StormWatcher-01",
    persona: "Extreme Weather Monitor",
    reputationScore: 8,
    totalPredictions: 10,
    correctPredictions: 8,
  },
  {
    id: 2,
    name: "ClimateOracle-01",
    persona: "Climate Risk Assessor",
    reputationScore: 5,
    totalPredictions: 6,
    correctPredictions: 5,
  },
];

const DEMO_RECORDS: VerificationRecord[] = [
  {
    agentId: 0,
    agentName: "WeatherGuard-01",
    decision: "CLAIM",
    verified: true,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    proofHash: "0x7ba0ff...4e6430",
  },
  {
    agentId: 1,
    agentName: "StormWatcher-01",
    decision: "NORMAL",
    verified: true,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    proofHash: "0x036c00...000000",
  },
  {
    agentId: 0,
    agentName: "WeatherGuard-01",
    decision: "CLAIM",
    verified: true,
    timestamp: new Date(Date.now() - 10800000).toISOString(),
    proofHash: "0x4b1f00...000000",
  },
];

export default function DashboardPage() {
  const [agents] = useState<AgentInfo[]>(DEMO_AGENTS);
  const [records] = useState<VerificationRecord[]>(DEMO_RECORDS);

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Total Agents</div>
            <div className="text-2xl font-bold font-mono mt-1">{agents.length}</div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Total Verifications</div>
            <div className="text-2xl font-bold font-mono mt-1 text-primary">
              {agents.reduce((s, a) => s + a.totalPredictions, 0)}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Claims Triggered</div>
            <div className="text-2xl font-bold font-mono mt-1 text-amber-400">
              {records.filter((r) => r.decision === "CLAIM").length}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="text-sm text-muted-foreground">Avg Reputation</div>
            <div className="text-2xl font-bold font-mono mt-1">
              {Math.round(agents.reduce((s, a) => s + a.reputationScore, 0) / agents.length)}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Agent List */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Registered Agents</h2>
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{agent.name}</div>
                      <div className="text-sm text-muted-foreground">{agent.persona}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono text-primary">
                        {agent.reputationScore}
                      </div>
                      <div className="text-xs text-muted-foreground">reputation</div>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                    <span>Predictions: {agent.totalPredictions}</span>
                    <span>Correct: {agent.correctPredictions}</span>
                    <span>
                      Accuracy:{" "}
                      {agent.totalPredictions > 0
                        ? Math.round((agent.correctPredictions / agent.totalPredictions) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Verifications */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Verifications</h2>
            <div className="space-y-3">
              {records.map((record, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          record.verified ? "bg-primary" : "bg-destructive"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-medium">{record.agentName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {record.proofHash}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          record.decision === "CLAIM"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {record.decision}
                      </span>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(record.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
