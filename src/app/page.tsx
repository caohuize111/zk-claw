import { NavBar } from "@/components/NavBar";
import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <NavBar />
      <main className="min-h-screen">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 pt-20 pb-16">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Built for OpenClaw Hackathon
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
              <span className="text-primary">ZK-Claw</span>
              <br />
              Verifiable Intelligence Gateway
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Every AI agent decision backed by mathematical proof.
              Zero-Knowledge ML verification for sovereign Non-Fungible Agents on BNB Chain.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Link
                href="/verify"
                className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              >
                Try Demo
              </Link>
              <Link
                href="/dashboard"
                className="px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-secondary/50 transition-colors"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* Three Layer Architecture */}
        <section className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-center mb-12">Three-Layer Architecture</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {/* Layer 1: DePIN Input */}
            <div className="p-6 rounded-xl border border-border bg-card space-y-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <span className="text-blue-400 font-mono text-lg font-bold">01</span>
              </div>
              <h3 className="text-lg font-semibold">DePIN Anchoring</h3>
              <p className="text-sm text-muted-foreground">
                Hardware-signed weather data from Marco stations feeds ZKML as public inputs.
                Physical reality anchored to digital proofs.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {["Temperature", "Humidity", "Wind Speed", "Rainfall"].map((f) => (
                  <span key={f} className="px-2 py-1 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Layer 2: ZKML Prover */}
            <div className="p-6 rounded-xl border border-primary/30 bg-card space-y-4 ring-1 ring-primary/20">
              <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                <span className="text-primary font-mono text-lg font-bold">02</span>
              </div>
              <h3 className="text-lg font-semibold">ZKML Prover (EZKL)</h3>
              <p className="text-sm text-muted-foreground">
                Neural network inference converted to Halo2 ZK-SNARK proofs.
                Model weights stay private; decisions are provably correct.
              </p>
              <div className="font-mono text-xs text-muted-foreground bg-secondary/50 p-3 rounded-lg">
                ONNX Model &rarr; Circuit &rarr; Prove &rarr; Verify
              </div>
            </div>

            {/* Layer 3: On-chain Verification */}
            <div className="p-6 rounded-xl border border-border bg-card space-y-4">
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <span className="text-amber-400 font-mono text-lg font-bold">03</span>
              </div>
              <h3 className="text-lg font-semibold">NFA + ERC-8004</h3>
              <p className="text-sm text-muted-foreground">
                Verified inference updates BAP-578 agent reputation and ERC-8004 validation scores.
                Sovereign agents with mathematical trust.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {["BAP-578", "ERC-8004", "opBNB"].map((t) => (
                  <span key={t} className="px-2 py-1 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Key Stats */}
        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Proof System", value: "Halo2" },
              { label: "Proof Size", value: "~18 KB" },
              { label: "Model Params", value: "58" },
              { label: "Target Chain", value: "opBNB" },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-xl border border-border bg-card text-center">
                <div className="text-2xl font-bold text-primary font-mono">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Unruggable AI */}
        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="p-8 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <h2 className="text-2xl font-bold mb-4">Unruggable AI</h2>
            <p className="text-muted-foreground max-w-2xl">
              Traditional AI agents are black boxes -- developers can manipulate decisions
              without accountability. ZK-Claw changes this: every inference generates a
              zero-knowledge proof that mathematically guarantees the decision was computed
              correctly from the claimed inputs, without revealing model weights.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
            ZK-Claw -- Good Vibes Only: OpenClaw Edition Hackathon
          </div>
        </footer>
      </main>
    </>
  );
}
