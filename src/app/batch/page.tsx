"use client";

import { NavBar } from "@/components/NavBar";
import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/lib/wagmi-config";
import { BATCH_VERIFIER_ABI } from "@/lib/contracts";
import {
  Layers,
  Hash,
  Send,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

const EXAMPLE_JSON = JSON.stringify(
  [
    {
      proof: "0xdead0001...(replace with real hex proof bytes)",
      instances: [12345, 67890],
      agentId: 0,
      stationId: 1001,
    },
    {
      proof: "0xdead0002...(replace with real hex proof bytes)",
      instances: [11111, 22222],
      agentId: 1,
      stationId: 1002,
    },
  ],
  null,
  2
);

interface BatchEntry {
  proof: string;
  instances: number[];
  agentId: number;
  stationId: number;
}

export default function BatchPage() {
  const { isConnected } = useAccount();
  const [jsonInput, setJsonInput] = useState(EXAMPLE_JSON);
  const [parseError, setParseError] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<(boolean | null)[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const batchAddr = CONTRACTS.BatchVerifier as `0x${string}`;

  // Read stats
  const { data: totalBatches } = useReadContract({
    address: batchAddr,
    abi: BATCH_VERIFIER_ABI,
    functionName: "totalBatchesProcessed",
  });

  const { data: totalProofs } = useReadContract({
    address: batchAddr,
    abi: BATCH_VERIFIER_ABI,
    functionName: "totalProofsAggregated",
  });

  // Write
  const { writeContract: submitBatch, data: submitTxHash, isPending: isSubmitting } = useWriteContract();
  const { isLoading: isConfirmingBatch } = useWaitForTransactionReceipt({ hash: submitTxHash });

  const parseBatchInput = (): BatchEntry[] | null => {
    try {
      const entries = JSON.parse(jsonInput) as BatchEntry[];
      if (!Array.isArray(entries) || entries.length === 0) {
        setParseError("Input must be a non-empty JSON array");
        return null;
      }
      setParseError(null);
      return entries;
    } catch {
      setParseError("Invalid JSON format");
      return null;
    }
  };

  const handleVerify = async () => {
    const entries = parseBatchInput();
    if (!entries) return;
    setStatusMessage("Preview Mode -- results are simulated. Deploy BatchVerifier to verify on-chain.");

    const results = entries.map(() => true);
    setVerifyResults(results);
  };

  const handleSubmit = () => {
    const entries = parseBatchInput();
    if (!entries) return;

    const proofs = entries.map((e) => e.proof as `0x${string}`);
    const instances = entries.map((e) => e.instances.map((i) => BigInt(i)));
    const agentIds = entries.map((e) => BigInt(e.agentId));
    const stationIds = entries.map((e) => BigInt(e.stationId));

    submitBatch({
      address: batchAddr,
      abi: BATCH_VERIFIER_ABI,
      functionName: "submitBatch",
      args: [proofs, instances, agentIds, stationIds],
    });
  };

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-10">
        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">Batch Verifier</h1>
          <p className="text-muted-foreground text-sm">
            Submit and verify multiple ZK proofs in a single transaction.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <div className="p-5 rounded-xl border border-border bg-card card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-primary">
              {totalBatches !== undefined ? Number(totalBatches).toString() : "--"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Batches Processed</div>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Hash className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-emerald-400">
              {totalProofs !== undefined ? Number(totalProofs).toString() : "--"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Proofs Aggregated</div>
          </div>
        </div>

        {!isConnected && (
          <div className="mb-8 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
            <div className="text-sm text-amber-400 font-medium">
              Connect wallet to submit batch transactions.
            </div>
          </div>
        )}

        {/* Batch Input */}
        <div className="p-5 rounded-xl border border-border bg-card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Proof Batch Data</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Enter a JSON array of objects with: proof (hex), instances (number[]), agentId, stationId
          </p>
          <textarea
            value={jsonInput}
            onChange={(e) => { setJsonInput(e.target.value); setParseError(null); setVerifyResults(null); setStatusMessage(null); }}
            rows={12}
            className="w-full px-3 py-3 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200 resize-y"
            spellCheck={false}
          />
          {parseError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {parseError}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <button
            onClick={handleVerify}
            className="py-3 rounded-xl font-semibold text-sm border border-primary/30 bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Verify Batch (Preview)
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isConfirmingBatch || !isConnected}
            className="py-3 rounded-xl font-semibold text-sm bg-primary text-white cursor-pointer hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {(isSubmitting || isConfirmingBatch) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSubmitting ? "Submitting..." : isConfirmingBatch ? "Confirming..." : "Submit Batch"}
          </button>
        </div>

        {/* Verify Results */}
        {verifyResults && (
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold">Verification Results</h2>
            </div>
            {statusMessage && (
              <div className="mb-3 text-sm text-amber-400">{statusMessage}</div>
            )}
            <div className="space-y-2">
              {verifyResults.map((result, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50"
                >
                  <span className="text-sm font-mono text-muted-foreground">
                    Proof #{i}
                  </span>
                  <div className="flex items-center gap-2">
                    {result === null ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Not deployed</span>
                      </>
                    ) : result ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">Valid</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium text-destructive">Invalid</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submitted tx link */}
        {submitTxHash && (
          <div className="mt-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center">
            <div className="text-sm text-emerald-400 font-medium mb-1">Batch submitted</div>
            <a
              href={`https://testnet.bscscan.com/tx/${submitTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-primary hover:underline"
            >
              {submitTxHash.slice(0, 14)}...{submitTxHash.slice(-10)}
            </a>
          </div>
        )}
      </main>
    </>
  );
}
