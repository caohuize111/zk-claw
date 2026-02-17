import { NavBar } from "@/components/NavBar";
import Link from "next/link";
import { fetchAgents, fetchGatewayStats } from "@/lib/chain-reader";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  let agentCount = 0;
  let stats = {
    totalVerifications: 0,
    totalClaimsTriggered: 0,
    totalRecords: 0,
    totalAuthenticated: 0,
  };

  try {
    const [agents, gatewayStats] = await Promise.all([
      fetchAgents(),
      fetchGatewayStats(),
    ]);
    agentCount = agents.length;
    stats = gatewayStats;
  } catch (e) {
    console.error("Failed to fetch landing stats:", e);
  }

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero — asymmetric split */}
        <section className="grid lg:grid-cols-2 gap-12 lg:gap-16 pt-16 pb-20">
          {/* Left: text */}
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live on BSC Testnet
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              ZK-Claw
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
              Verifiable intelligence gateway for autonomous AI agents. ZKML
              proofs guarantee ML inference is correct without revealing model
              weights.
            </p>

            <div className="flex gap-3 mb-10">
              <Link
                href="/verify"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Try Demo
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Dashboard
              </Link>
            </div>

            {/* Inline stats */}
            <div className="flex gap-8 text-sm">
              {[
                { value: agentCount, label: "Agents" },
                { value: stats.totalVerifications, label: "Verifications" },
                { value: stats.totalClaimsTriggered, label: "Claims" },
                { value: stats.totalAuthenticated, label: "HW Signed" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {s.value}
                  </div>
                  <div className="text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: terminal */}
          <div className="flex items-center">
            <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
              {/* Title bar */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-secondary/30">
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  zkml-pipeline
                </span>
              </div>
              {/* Terminal body */}
              <div className="p-5 font-mono text-[13px] leading-[1.8] space-y-0.5">
                <div className="text-muted-foreground/50">
                  # DePIN weather data → ZKML proof → on-chain verify
                </div>
                <div className="h-2" />
                <div>
                  <span className="text-emerald-400">$</span>{" "}
                  <span className="text-foreground">ezkl gen-witness</span>{" "}
                  <span className="text-muted-foreground">--data input.json</span>
                </div>
                <div className="text-muted-foreground/40 pl-3">
                  Computing inference from ONNX model...
                </div>
                <div className="h-1" />
                <div>
                  <span className="text-emerald-400">$</span>{" "}
                  <span className="text-foreground">ezkl prove</span>{" "}
                  <span className="text-muted-foreground">
                    --witness witness.json
                  </span>
                </div>
                <div className="text-muted-foreground/40 pl-3">
                  Generating Halo2 SNARK proof (4.4s)
                </div>
                <div className="h-1" />
                <div>
                  <span className="text-emerald-400">$</span>{" "}
                  <span className="text-foreground">ezkl verify</span>{" "}
                  <span className="text-muted-foreground">--proof proof.json</span>
                </div>
                <div className="text-emerald-400 pl-3">
                  Proof verified (18,272 bytes)
                </div>
                <div className="h-2" />
                <div className="text-muted-foreground/40">
                  → submitVerifiedInference(proof, inputs, agentId=0)
                </div>
                <div className="text-primary pl-3">
                  Decision: CLAIM | Reputation: +1
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture — clean 4-col grid */}
        <section className="pb-16">
          <h2 className="text-lg font-semibold mb-5">Architecture</h2>
          <div className="grid sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden">
            {[
              {
                title: "DePIN Oracle",
                desc: "Hardware-signed weather data. ECDSA signatures bind readings to physical stations.",
              },
              {
                title: "ZKML Prover",
                desc: "EZKL compiles PyTorch MLP to Halo2 circuit. ZK proof of correct inference.",
              },
              {
                title: "ZKClawGateway",
                desc: "Smart contract verifies proof on BSC. Records result, updates reputation.",
              },
              {
                title: "NFA Reputation",
                desc: "BAP-578 identity + ERC-8004 validation. Provable on-chain track record.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-card p-5">
                <div className="font-medium text-sm mb-1.5">{item.title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </div>
              </div>
            ))}
          </div>

          {/* Standards tags */}
          <div className="flex flex-wrap gap-2 mt-5">
            {[
              "BAP-578",
              "ERC-8004",
              "EZKL / Halo2",
              "BNB Greenfield",
              "DePIN",
              "BSC Testnet",
            ].map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-md text-xs font-mono border border-border text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground font-mono">
          ZK-Claw -- Good Vibes Only: OpenClaw Edition
        </footer>
      </main>
    </>
  );
}
