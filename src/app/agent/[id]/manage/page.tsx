"use client";

import { NavBar } from "@/components/NavBar";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { CONTRACTS } from "@/lib/wagmi-config";
import { NFA_FULL_ABI } from "@/lib/contracts";
import {
  ArrowLeft,
  Shield,
  Wallet,
  ExternalLink,
  Pause,
  Play,
  Skull,
  Send,
  ArrowDownToLine,
  Plus,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const STATE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "ACTIVE", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  1: { label: "PAUSED", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  2: { label: "TERMINATED", color: "text-destructive bg-destructive/10 border-destructive/20" },
};

export default function AgentManagePage() {
  const params = useParams();
  const agentId = params.id as string;
  const tokenId = BigInt(agentId);
  const { isConnected } = useAccount();

  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  // Mint form
  const [mintName, setMintName] = useState("");
  const [mintPersona, setMintPersona] = useState("");
  const [mintVaultURI, setMintVaultURI] = useState("");

  const nfaAddr = CONTRACTS.NFA as `0x${string}`;

  // Read agent state
  const { data: agentState, refetch: refetchState } = useReadContract({
    address: nfaAddr,
    abi: NFA_FULL_ABI,
    functionName: "getState",
    args: [tokenId],
  });

  // Read TBA address
  const { data: tbaAddress } = useReadContract({
    address: nfaAddr,
    abi: NFA_FULL_ABI,
    functionName: "getTokenBoundAccount",
    args: [tokenId],
  });

  // Read balance
  const { data: agentBalance, refetch: refetchBalance } = useReadContract({
    address: nfaAddr,
    abi: NFA_FULL_ABI,
    functionName: "getAgentBalance",
    args: [tokenId],
  });

  // Read metadata
  const { data: metadata } = useReadContract({
    address: nfaAddr,
    abi: NFA_FULL_ABI,
    functionName: "getAgentMetadata",
    args: [tokenId],
  });

  // Write actions
  const { writeContract: pauseAgent, data: pauseTx, isPending: isPausing } = useWriteContract();
  const { writeContract: unpauseAgent, data: unpauseTx, isPending: isUnpausing } = useWriteContract();
  const { writeContract: terminateAgent, data: terminateTx, isPending: isTerminating } = useWriteContract();
  const { writeContract: fundAgent, data: fundTx, isPending: isFunding } = useWriteContract();
  const { writeContract: withdrawFromAgent, data: withdrawTx, isPending: isWithdrawing } = useWriteContract();
  const { writeContract: mintAgent, data: mintTx, isPending: isMinting } = useWriteContract();

  // Wait for receipts
  const { isSuccess: pauseSuccess } = useWaitForTransactionReceipt({ hash: pauseTx });
  const { isSuccess: unpauseSuccess } = useWaitForTransactionReceipt({ hash: unpauseTx });
  const { isSuccess: terminateSuccess } = useWaitForTransactionReceipt({ hash: terminateTx });
  useWaitForTransactionReceipt({ hash: fundTx });
  useWaitForTransactionReceipt({ hash: withdrawTx });
  useWaitForTransactionReceipt({ hash: mintTx });

  // Refetch on success
  useEffect(() => {
    if (pauseSuccess || unpauseSuccess || terminateSuccess) {
      refetchState();
      refetchBalance();
    }
  }, [pauseSuccess, unpauseSuccess, terminateSuccess]);

  const stateNum = agentState !== undefined ? Number(agentState) : -1;
  const stateInfo = STATE_LABELS[stateNum] || { label: "UNKNOWN", color: "text-muted-foreground bg-secondary border-border" };
  const tba = tbaAddress as `0x${string}` | undefined;
  const isZeroAddr = tba === "0x0000000000000000000000000000000000000000";

  const handlePause = () => {
    pauseAgent({ address: nfaAddr, abi: NFA_FULL_ABI, functionName: "pauseAgent", args: [tokenId] });
  };

  const handleUnpause = () => {
    unpauseAgent({ address: nfaAddr, abi: NFA_FULL_ABI, functionName: "unpauseAgent", args: [tokenId] });
  };

  const handleTerminate = () => {
    if (!confirmTerminate) {
      setConfirmTerminate(true);
      return;
    }
    terminateAgent({ address: nfaAddr, abi: NFA_FULL_ABI, functionName: "terminateAgent", args: [tokenId] });
    setConfirmTerminate(false);
  };

  const handleFund = () => {
    if (!fundAmount) return;
    fundAgent({
      address: nfaAddr,
      abi: NFA_FULL_ABI,
      functionName: "fundAgent",
      args: [tokenId],
      value: parseEther(fundAmount),
    });
  };

  const handleWithdraw = () => {
    if (!withdrawAmount) return;
    withdrawFromAgent({
      address: nfaAddr,
      abi: NFA_FULL_ABI,
      functionName: "withdrawFromAgent",
      args: [tokenId, parseEther(withdrawAmount)],
    });
  };

  const handleMint = () => {
    if (!mintName) return;
    const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    mintAgent({
      address: nfaAddr,
      abi: NFA_FULL_ABI,
      functionName: "mint",
      args: [{ name: mintName, persona: mintPersona, vaultURI: mintVaultURI, vaultHash: zeroHash }],
    });
  };

  const metaTuple = metadata as { name: string; persona: string; vaultURI: string; vaultHash: string } | undefined;

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Navigation */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href={`/agent/${agentId}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Agent Profile
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Manage Agent #{agentId}</h1>
            <span className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${stateInfo.color}`}>
              {stateInfo.label}
            </span>
          </div>
          {metaTuple && (
            <p className="text-muted-foreground text-sm">{metaTuple.name} -- {metaTuple.persona}</p>
          )}
        </div>

        {!isConnected && (
          <div className="mb-8 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
            <div className="text-sm text-amber-400 font-medium">
              Connect wallet to manage this agent.
            </div>
          </div>
        )}

        {/* TBA Wallet Card */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6 card-hover">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Token Bound Account (ERC-6551)</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">TBA Address</div>
              {tba && !isZeroAddr ? (
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

        {/* Action Buttons */}
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <button
            onClick={handlePause}
            disabled={isPausing || stateNum !== 0 || !isConnected}
            className="py-3 rounded-xl font-semibold text-sm border border-amber-500/30 bg-amber-500/10 text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPausing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
            {isPausing ? "Pausing..." : "Pause"}
          </button>
          <button
            onClick={handleUnpause}
            disabled={isUnpausing || stateNum !== 1 || !isConnected}
            className="py-3 rounded-xl font-semibold text-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-pointer hover:bg-emerald-500/20 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isUnpausing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isUnpausing ? "Unpausing..." : "Unpause"}
          </button>
          <button
            onClick={handleTerminate}
            disabled={isTerminating || stateNum === 2 || !isConnected}
            className="py-3 rounded-xl font-semibold text-sm border border-destructive/30 bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isTerminating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : confirmTerminate ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Skull className="w-4 h-4" />
            )}
            {isTerminating ? "Terminating..." : confirmTerminate ? "Confirm Terminate" : "Terminate"}
          </button>
        </div>

        {/* Fund + Withdraw */}
        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          {/* Fund */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <Send className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">Fund Agent</h2>
            </div>
            <input
              type="number"
              step="0.001"
              placeholder="BNB amount"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200 mb-3"
            />
            <button
              onClick={handleFund}
              disabled={isFunding || !fundAmount || !isConnected}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-primary text-white cursor-pointer hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isFunding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isFunding ? "Funding..." : "Fund"}
            </button>
          </div>

          {/* Withdraw */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <ArrowDownToLine className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold">Withdraw</h2>
            </div>
            <input
              type="number"
              step="0.001"
              placeholder="BNB amount"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200 mb-3"
            />
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !withdrawAmount || !isConnected}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isWithdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              {isWithdrawing ? "Withdrawing..." : "Withdraw"}
            </button>
          </div>
        </div>

        {/* Mint New Agent */}
        <div className="p-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Mint New Agent</h2>
          </div>
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Name</label>
              <input
                type="text"
                placeholder="Agent name"
                value={mintName}
                onChange={(e) => setMintName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Persona</label>
              <input
                type="text"
                placeholder="Agent persona description"
                value={mintPersona}
                onChange={(e) => setMintPersona(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Vault URI</label>
              <input
                type="text"
                placeholder="https://greenfield.bnbchain.org/..."
                value={mintVaultURI}
                onChange={(e) => setMintVaultURI(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
              />
            </div>
          </div>
          <button
            onClick={handleMint}
            disabled={isMinting || !mintName || !isConnected}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-primary text-white cursor-pointer hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isMinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {isMinting ? "Minting..." : "Mint NFA"}
          </button>
          {mintTx && (
            <div className="mt-3 text-center">
              <a
                href={`https://testnet.bscscan.com/tx/${mintTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-primary hover:underline"
              >
                tx: {mintTx.slice(0, 14)}...{mintTx.slice(-10)}
              </a>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
