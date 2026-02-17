"use client";

import { NavBar } from "@/components/NavBar";
import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSendTransaction } from "wagmi";
import { parseEther, formatEther } from "viem";
import { CONTRACTS } from "@/lib/wagmi-config";
import { PAYMASTER_ABI } from "@/lib/contracts";
import {
  Wallet,
  DollarSign,
  UserCheck,
  UserX,
  Search,
  Send,
  ArrowDownToLine,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export default function PaymasterPage() {
  const { isConnected } = useAccount();
  const [approveAddr, setApproveAddr] = useState("");
  const [revokeAddr, setRevokeAddr] = useState("");
  const [checkAddr, setCheckAddr] = useState("");
  const [checkResult, setCheckResult] = useState<boolean | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const paymasterAddr = CONTRACTS.AgentPaymaster as `0x${string}`;

  // Read stats
  const { data: balance } = useReadContract({
    address: paymasterAddr,
    abi: PAYMASTER_ABI,
    functionName: "balance",
  });

  const { data: totalSponsored } = useReadContract({
    address: paymasterAddr,
    abi: PAYMASTER_ABI,
    functionName: "totalSponsored",
  });

  // Check approved
  const { data: isApproved, refetch: refetchApproved } = useReadContract({
    address: paymasterAddr,
    abi: PAYMASTER_ABI,
    functionName: "approvedAgents",
    args: checkAddr ? [checkAddr as `0x${string}`] : undefined,
    query: { enabled: false },
  });

  // Write actions
  const { writeContract: approveAgent, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { writeContract: revokeAgent, data: revokeTxHash, isPending: isRevoking } = useWriteContract();
  const { writeContract: withdrawFn, data: withdrawTxHash, isPending: isWithdrawing } = useWriteContract();
  const { sendTransaction, data: fundTxHash, isPending: isFunding } = useSendTransaction();

  // Wait for receipts
  const { isLoading: isConfirmingApprove } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isLoading: isConfirmingRevoke } = useWaitForTransactionReceipt({ hash: revokeTxHash });
  const { isLoading: isConfirmingWithdraw } = useWaitForTransactionReceipt({ hash: withdrawTxHash });
  const { isLoading: isConfirmingFund } = useWaitForTransactionReceipt({ hash: fundTxHash });

  const handleApprove = () => {
    if (!approveAddr) return;
    approveAgent({
      address: paymasterAddr,
      abi: PAYMASTER_ABI,
      functionName: "approveAgent",
      args: [approveAddr as `0x${string}`],
    });
  };

  const handleRevoke = () => {
    if (!revokeAddr) return;
    revokeAgent({
      address: paymasterAddr,
      abi: PAYMASTER_ABI,
      functionName: "revokeAgent",
      args: [revokeAddr as `0x${string}`],
    });
  };

  const handleFund = () => {
    if (!fundAmount) return;
    sendTransaction({
      to: paymasterAddr,
      value: parseEther(fundAmount),
    });
  };

  const handleWithdraw = () => {
    if (!withdrawAmount) return;
    withdrawFn({
      address: paymasterAddr,
      abi: PAYMASTER_ABI,
      functionName: "withdraw",
      args: [parseEther(withdrawAmount)],
    });
  };

  const handleCheck = async () => {
    if (!checkAddr) return;
    const result = await refetchApproved();
    setCheckResult(result.data as boolean);
  };

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-10">
        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">Agent Paymaster</h1>
          <p className="text-muted-foreground text-sm">
            Manage gas sponsorship for approved AI agents.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <div className="p-5 rounded-xl border border-border bg-card card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-primary">
              {balance !== undefined ? formatEther(balance as bigint) : "--"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Balance (BNB)</div>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-emerald-400">
              {totalSponsored !== undefined ? formatEther(totalSponsored as bigint) : "--"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Total Sponsored (BNB)</div>
          </div>
        </div>

        {!isConnected && (
          <div className="mb-8 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
            <div className="text-sm text-amber-400 font-medium">
              Connect wallet to interact with the Paymaster contract.
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Approve Agent */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold">Approve Agent</h2>
            </div>
            <input
              type="text"
              placeholder="0x... agent address"
              value={approveAddr}
              onChange={(e) => setApproveAddr(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200 mb-3"
            />
            <button
              onClick={handleApprove}
              disabled={isApproving || isConfirmingApprove || !approveAddr || !isConnected}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(isApproving || isConfirmingApprove) ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              {isApproving ? "Approving..." : isConfirmingApprove ? "Confirming..." : "Approve"}
            </button>
          </div>

          {/* Revoke Agent */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <UserX className="w-4 h-4 text-destructive" />
              <h2 className="text-base font-semibold">Revoke Agent</h2>
            </div>
            <input
              type="text"
              placeholder="0x... agent address"
              value={revokeAddr}
              onChange={(e) => setRevokeAddr(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200 mb-3"
            />
            <button
              onClick={handleRevoke}
              disabled={isRevoking || isConfirmingRevoke || !revokeAddr || !isConnected}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-destructive/20 text-destructive border border-destructive/30 cursor-pointer hover:bg-destructive/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(isRevoking || isConfirmingRevoke) ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
              {isRevoking ? "Revoking..." : isConfirmingRevoke ? "Confirming..." : "Revoke"}
            </button>
          </div>

          {/* Fund Paymaster */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <Send className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">Fund Paymaster</h2>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                step="0.001"
                placeholder="BNB amount"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
              />
            </div>
            <button
              onClick={handleFund}
              disabled={isFunding || isConfirmingFund || !fundAmount || !isConnected}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-primary text-white cursor-pointer hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(isFunding || isConfirmingFund) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isFunding ? "Sending..." : isConfirmingFund ? "Confirming..." : "Send BNB"}
            </button>
          </div>

          {/* Withdraw */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <ArrowDownToLine className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold">Withdraw (Admin)</h2>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                step="0.001"
                placeholder="BNB amount"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
              />
            </div>
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing || isConfirmingWithdraw || !withdrawAmount || !isConnected}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(isWithdrawing || isConfirmingWithdraw) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              {isWithdrawing ? "Withdrawing..." : isConfirmingWithdraw ? "Confirming..." : "Withdraw"}
            </button>
          </div>
        </div>

        {/* Check Agent Approval */}
        <div className="mt-6 p-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Check Agent Approval</h2>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="0x... agent address"
              value={checkAddr}
              onChange={(e) => { setCheckAddr(e.target.value); setCheckResult(null); }}
              className="flex-1 px-3 py-2.5 rounded-lg border border-border/50 bg-background/80 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
            />
            <button
              onClick={handleCheck}
              disabled={!checkAddr}
              className="px-5 py-2.5 rounded-lg font-semibold text-sm bg-primary/10 text-primary border border-primary/30 cursor-pointer hover:bg-primary/20 transition-all duration-200 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search className="w-4 h-4" />
              Check
            </button>
          </div>
          {checkResult !== null && (
            <div className="mt-4 flex items-center gap-2">
              {checkResult ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-400">Agent is approved</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Agent is not approved</span>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
