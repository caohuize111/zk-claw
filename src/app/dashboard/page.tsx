"use client";

import { NavBar } from "@/components/NavBar";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Fingerprint,
  Activity,
  ArrowUpRight,
  Clock,
  Hash,
  Plus,
} from "lucide-react";

interface AgentInfo {
  id: number;
  name: string;
  persona: string;
  reputationScore: number;
  totalPredictions: number;
  correctPredictions: number;
  vaultURI: string;
  learningRoot: string;
}

interface VerificationRecord {
  index: number;
  agentId: number;
  decision: string;
  verified: boolean;
  timestamp: number;
  proofHash: string;
  dataAuthentic: boolean;
}

interface GatewayStats {
  totalVerifications: number;
  totalClaimsTriggered: number;
  totalRecords: number;
  totalAuthenticated: number;
}

function StatCardSkeleton() {
  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton w-10 h-10 rounded-lg" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
      <div className="skeleton h-8 w-16 rounded mb-1" />
      <div className="skeleton h-3 w-24 rounded" />
    </div>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="p-4 rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="skeleton h-5 w-14 rounded" />
            <div className="skeleton h-5 w-28 rounded" />
          </div>
          <div className="skeleton h-3 w-40 rounded" />
        </div>
        <div className="skeleton h-10 w-14 rounded" />
      </div>
      <div className="skeleton h-2 w-full rounded-full mb-2" />
      <div className="skeleton h-3 w-32 rounded" />
    </div>
  );
}

function RecordSkeleton() {
  return (
    <div className="flex gap-3 ml-3">
      <div className="relative flex flex-col items-center">
        <div className="skeleton w-3 h-3 rounded-full" />
        <div className="skeleton w-px flex-1 mt-1" />
      </div>
      <div className="pb-6 flex-1">
        <div className="skeleton h-4 w-32 rounded mb-2" />
        <div className="skeleton h-3 w-48 rounded mb-1" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, recordsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/records"),
        ]);
        const agentsData = await agentsRes.json();
        const recordsData = await recordsRes.json();

        setAgents(agentsData.agents || []);
        setStats(agentsData.stats || null);
        setRecords(recordsData.records || []);
      } catch (e) {
        console.error("Failed to load dashboard data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    {
      label: "Agents (NFA)",
      value: agents.length,
      icon: Users,
      colorClass: "bg-primary/10 text-primary",
      valueClass: "text-primary",
    },
    {
      label: "ZK Verifications",
      value: stats?.totalVerifications ?? 0,
      icon: ShieldCheck,
      colorClass: "bg-primary/10 text-primary",
      valueClass: "text-primary",
    },
    {
      label: "Claims Triggered",
      value: stats?.totalClaimsTriggered ?? 0,
      icon: AlertTriangle,
      colorClass: "bg-amber-500/10 text-amber-400",
      valueClass: "text-amber-400",
    },
    {
      label: "HW Authenticated",
      value: stats?.totalAuthenticated ?? 0,
      icon: Fingerprint,
      colorClass: "bg-emerald-500/10 text-emerald-400",
      valueClass: "text-emerald-400",
    },
  ];

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/agent/0/manage"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Manage / Mint</span>
              <span className="sm:hidden">Mint</span>
            </Link>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live from BSC Testnet
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="card-hover p-5 rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.colorClass}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <div
                    className={`text-3xl font-bold font-mono tracking-tight ${card.valueClass}`}
                  >
                    {card.value}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {card.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Agent List */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold">Registered Agents</h2>
              {!loading && (
                <span className="text-xs font-mono text-muted-foreground ml-auto">
                  {agents.length} total
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <AgentCardSkeleton key={i} />
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className="p-8 rounded-xl border border-border bg-card text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No agents registered
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => {
                  const accuracy =
                    agent.totalPredictions > 0
                      ? Math.round(
                          (agent.correctPredictions / agent.totalPredictions) *
                            100
                        )
                      : 0;

                  return (
                    <Link
                      key={agent.id}
                      href={`/agent/${agent.id}`}
                      className="group card-hover block p-4 rounded-xl border border-border bg-card"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              NFA #{agent.id}
                            </span>
                            <span className="font-semibold text-sm">
                              {agent.name}
                            </span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {agent.persona}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <div className="text-2xl font-bold font-mono text-primary leading-none">
                            {(agent.reputationScore / 100).toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                            reputation
                          </div>
                        </div>
                      </div>

                      {/* Accuracy Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">
                            Accuracy
                          </span>
                          <span className="font-mono text-foreground">
                            {accuracy}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${accuracy}%` }}
                          />
                        </div>
                      </div>

                      {/* Predictions Count */}
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {agent.totalPredictions} predictions
                        </span>
                        <span>
                          {agent.correctPredictions} correct
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Recent Verifications (Timeline) */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-semibold">Recent Verifications</h2>
              {!loading && (
                <span className="text-xs font-mono text-muted-foreground ml-auto">
                  {records.length} records
                </span>
              )}
            </div>

            {loading ? (
              <div className="space-y-0">
                {Array.from({ length: 4 }).map((_, i) => (
                  <RecordSkeleton key={i} />
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 rounded-xl border border-border bg-card text-center">
                <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No verification records
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

                <div className="space-y-0">
                  {records.map((record, idx) => {
                    const isLast = idx === records.length - 1;

                    return (
                      <div key={record.index} className="relative flex gap-4 pl-0">
                        {/* Timeline dot */}
                        <div className="relative z-10 flex-shrink-0 mt-1">
                          <div
                            className={`w-[15px] h-[15px] rounded-full border-2 ${
                              record.verified
                                ? "bg-emerald-500 border-emerald-500/30"
                                : "bg-destructive border-destructive/30"
                            }`}
                          />
                        </div>

                        {/* Content */}
                        <div className={`flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                          <div className="p-3 rounded-lg border border-border bg-card card-hover">
                            {/* Top row: agent ID + badges */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">
                                  Agent #{record.agentId}
                                </span>
                                {record.dataAuthentic && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium uppercase tracking-wider">
                                    HW Signed
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                  record.decision === "CLAIM"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : "bg-primary/10 text-primary border border-primary/20"
                                }`}
                              >
                                {record.decision}
                              </span>
                            </div>

                            {/* Proof hash */}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono mb-1.5">
                              <Hash className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">
                                {record.proofHash.slice(0, 18)}...
                              </span>
                            </div>

                            {/* Timestamp */}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span>
                                {record.timestamp > 0
                                  ? new Date(
                                      record.timestamp * 1000
                                    ).toLocaleString()
                                  : "Pending confirmation"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
