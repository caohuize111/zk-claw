"use client";

import { NavBar } from "@/components/NavBar";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS } from "@/lib/wagmi-config";
import { NFA_FULL_ABI } from "@/lib/contracts";
import {
  ArrowLeft,
  Shield,
  Activity,
  Target,
  Database,
  GitBranch,
  Hash,
  Clock,
  CheckCircle2,
  XCircle,
  Fingerprint,
  ExternalLink,
  Wallet,
  Settings,
} from "lucide-react";

interface AgentInfo {
  id: number;
  name: string;
  persona: string;
  vaultURI: string;
  vaultHash: string;
  totalPredictions: number;
  correctPredictions: number;
  reputationScore: number;
  learningRoot: string;
}

interface VerificationRecord {
  index: number;
  agentId: number;
  decision: string;
  verified: boolean;
  timestamp: number;
  proofHash: string;
  inputHash: string;
  dataAuthentic: boolean;
}

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [history, setHistory] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/history/${agentId}`);
        const data = await res.json();
        setAgent(data.agent);
        setHistory(data.history || []);
      } catch (e) {
        console.error("Failed to load agent data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  const accuracy =
    agent && agent.totalPredictions > 0
      ? Math.round((agent.correctPredictions / agent.totalPredictions) * 100)
      : 0;

  // TBA reads
  let tokenId: bigint;
  try {
    tokenId = BigInt(agentId);
  } catch {
    return <div className="p-8 text-center text-destructive">Invalid agent ID</div>;
  }
  const nfaAddr = CONTRACTS.NFA as `0x${string}`;

  const { data: tbaAddress } = useReadContract({
    address: nfaAddr,
    abi: NFA_FULL_ABI,
    functionName: "getTokenBoundAccount",
    args: [tokenId],
  });

  const { data: agentBalance } = useReadContract({
    address: nfaAddr,
    abi: NFA_FULL_ABI,
    functionName: "getAgentBalance",
    args: [tokenId],
  });

  const tba = tbaAddress as `0x${string}` | undefined;
  const isZeroTba = tba === "0x0000000000000000000000000000000000000000";

  /* ------------------------------------------------------------------ */
  /*  Loading State                                                      */
  /* ------------------------------------------------------------------ */
  if (loading) {
    return (
      <>
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Back link skeleton */}
          <div className="skeleton h-4 w-40 mb-8" />

          {/* Header skeleton */}
          <div className="rounded-xl border border-border bg-card p-6 mb-8">
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                <div className="skeleton h-4 w-20" />
                <div className="skeleton h-8 w-56" />
                <div className="skeleton h-4 w-80" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="skeleton w-20 h-20 rounded-full" />
                <div className="skeleton h-3 w-16" />
              </div>
            </div>
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="skeleton h-3 w-24 mb-3" />
                <div className="skeleton h-6 w-16" />
              </div>
            ))}
          </div>

          {/* BAP-578 skeleton */}
          <div className="rounded-xl border border-border bg-card p-5 mb-8">
            <div className="skeleton h-5 w-48 mb-4" />
            <div className="space-y-4">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-full" />
            </div>
          </div>

          {/* History skeleton */}
          <div className="skeleton h-6 w-56 mb-4" />
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        </main>
      </>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Not Found State                                                    */
  /* ------------------------------------------------------------------ */
  if (!agent) {
    return (
      <>
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full border-2 border-border flex items-center justify-center mb-6">
              <Shield className="w-7 h-7 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Agent Not Found</h1>
            <p className="text-muted-foreground mb-6">
              NFA #{agentId} does not exist on-chain or has not been indexed.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Main Profile                                                       */
  /* ------------------------------------------------------------------ */
  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* ---- Navigation ---- */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </Link>
          <Link
            href={`/agent/${agentId}/manage`}
            className="inline-flex items-center gap-2 text-sm text-primary/70 hover:text-primary transition-colors"
          >
            <Settings className="w-4 h-4" />
            Manage Agent
          </Link>
        </div>

        {/* ---- Agent Header Card ---- */}
        <div className="rounded-xl bg-card border border-border p-6 mb-8 card-hover">
          <div className="flex flex-col-reverse sm:flex-row items-start justify-between gap-4 sm:gap-6">
            {/* Left: Identity */}
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/10 border border-primary/20 mb-3">
                <Shield className="w-3 h-3 text-primary" />
                <span className="text-xs font-mono text-primary">
                  NFA #{agent.id}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">
                {agent.name}
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {agent.persona}
              </p>
            </div>

            {/* Right: Reputation Score */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="relative w-20 h-20 rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center">
                <span className="text-3xl font-bold font-mono text-primary">
                  {agent.reputationScore}
                </span>
              </div>
              <span className="text-xs text-muted-foreground mt-2 tracking-wide uppercase">
                Reputation
              </span>
            </div>
          </div>
        </div>

        {/* ---- Stats Grid ---- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Total Predictions */}
          <div className="rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Total Predictions
              </span>
            </div>
            <div className="text-2xl font-bold font-mono">
              {agent.totalPredictions}
            </div>
          </div>

          {/* Correct */}
          <div className="rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Correct
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {agent.correctPredictions}
            </div>
          </div>

          {/* Accuracy */}
          <div className="rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Accuracy
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 mb-2">
              {accuracy}%
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-500"
                style={{ width: `${accuracy}%` }}
              />
            </div>
          </div>

          {/* Vault URI */}
          <div className="rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Vault URI
              </span>
            </div>
            <div className="text-xs font-mono text-muted-foreground truncate mt-1" title={agent.vaultURI}>
              {agent.vaultURI || "Not configured"}
            </div>
            {agent.vaultURI && (
              <a
                href={agent.vaultURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary/60 hover:text-primary mt-2 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open
              </a>
            )}
          </div>
        </div>

        {/* ---- BAP-578 Metadata Card ---- */}
        <div className="rounded-xl border border-border bg-card p-5 mb-8 card-hover">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">BAP-578 On-Chain Identity</h2>
          </div>

          {/* Learning Root */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <GitBranch className="w-4 h-4 flex-shrink-0" />
              <span>Learning Root (Merkle)</span>
            </div>
            <span className="font-mono text-xs text-foreground/70 max-w-[220px] truncate" title={agent.learningRoot}>
              {agent.learningRoot
                ? `${agent.learningRoot.slice(0, 22)}...`
                : "0x0000000000000000000000"}
            </span>
          </div>

          <div className="border-t border-border/50" />

          {/* Vault Hash */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Hash className="w-4 h-4 flex-shrink-0" />
              <span>Vault Hash</span>
            </div>
            <span className="font-mono text-xs text-foreground/70 max-w-[220px] truncate" title={agent.vaultHash}>
              {agent.vaultHash
                ? `${agent.vaultHash.slice(0, 22)}...`
                : "0x0000000000000000000000"}
            </span>
          </div>
        </div>

        {/* ---- Token Bound Account (ERC-6551) ---- */}
        <div className="rounded-xl border border-border bg-card p-5 mb-8 card-hover">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Token Bound Account (ERC-6551)</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">TBA Address</div>
              {tba && !isZeroTba ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground truncate">{tba}</span>
                  <a
                    href={`https://testnet.bscscan.com/address/${tba}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Not created</span>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Balance</div>
              <div className="text-2xl font-bold font-mono text-primary">
                {agentBalance !== undefined ? formatEther(agentBalance as bigint) : "--"}
                <span className="text-sm text-muted-foreground ml-1">BNB</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Verification History ---- */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-xl font-semibold">Verification History</h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
            {history.length}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No verification records for this agent.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />

            <div className="space-y-4">
              {history.map((record) => (
                <div key={record.index} className="relative pl-9">
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-0 top-4 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${
                      record.verified
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-destructive/50 bg-destructive/10"
                    }`}
                  >
                    {record.verified ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-destructive" />
                    )}
                  </div>

                  {/* Record Card */}
                  <div className="rounded-xl border border-border bg-card p-4 card-hover">
                    {/* Top row: badges + timestamp */}
                    <div className="flex items-center flex-wrap gap-2 mb-3">
                      {/* Record index badge */}
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                        Record #{record.index}
                      </span>

                      {/* Decision badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          record.decision === "CLAIM"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-primary/10 text-primary border border-primary/20"
                        }`}
                      >
                        {record.decision}
                      </span>

                      {/* HW Signed badge */}
                      {record.dataAuthentic && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Fingerprint className="w-3 h-3" />
                          HW Signed
                        </span>
                      )}

                      {/* Timestamp, pushed to right */}
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {record.timestamp > 0
                          ? new Date(record.timestamp * 1000).toLocaleString()
                          : "pending"}
                      </span>
                    </div>

                    {/* Hash details */}
                    <div className="flex flex-col sm:flex-row gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Hash className="w-3 h-3 flex-shrink-0 text-muted-foreground/50" />
                        <span className="text-muted-foreground/60">proof:</span>
                        <span className="font-mono truncate">
                          {record.proofHash.slice(0, 20)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Hash className="w-3 h-3 flex-shrink-0 text-muted-foreground/50" />
                        <span className="text-muted-foreground/60">input:</span>
                        <span className="font-mono truncate">
                          {record.inputHash.slice(0, 20)}...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
