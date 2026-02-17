"use client";

import { NavBar } from "@/components/NavBar";
import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS } from "@/lib/wagmi-config";
import { GATEWAY_ABI } from "@/lib/contracts";
import {
  CloudRain,
  Cpu,
  Send,
  CheckCircle2,
  Thermometer,
  Droplets,
  Wind,
  CloudRainWind,
  Radio,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Loader2,
} from "lucide-react";

type Step = "input" | "proving" | "submitting" | "complete";

interface WeatherInput {
  temperature: number;
  humidity: number;
  windSpeed: number;
  rainfall: number;
  stationId: number;
}

interface ProofResult {
  decision: string;
  confidence: string;
  proofSize: number;
  proofHash: string;
  publicInstances: string[];
  verifyTime: number;
}

const STEPS = [
  { key: "input", label: "DePIN Input", icon: CloudRain },
  { key: "proving", label: "ZKML Proof", icon: Cpu },
  { key: "submitting", label: "Chain Submit", icon: Send },
  { key: "complete", label: "Verified", icon: CheckCircle2 },
] as const;

const PRESETS = [
  {
    label: "Extreme Storm",
    values: { temperature: -8, humidity: 98, windSpeed: 120, rainfall: 250, stationId: 1001 },
  },
  {
    label: "Normal Day",
    values: { temperature: 25, humidity: 60, windSpeed: 15, rainfall: 5, stationId: 1001 },
  },
  {
    label: "Heat Wave",
    values: { temperature: 42, humidity: 30, windSpeed: 5, rainfall: 0, stationId: 1002 },
  },
  {
    label: "Typhoon",
    values: { temperature: 18, humidity: 95, windSpeed: 140, rainfall: 280, stationId: 1003 },
  },
];

const WEATHER_FIELDS = [
  { key: "temperature", label: "Temperature (C)", icon: Thermometer, min: -20, max: 50 },
  { key: "humidity", label: "Humidity (%)", icon: Droplets, min: 0, max: 100 },
  { key: "windSpeed", label: "Wind Speed (km/h)", icon: Wind, min: 0, max: 200 },
  { key: "rainfall", label: "Rainfall (mm)", icon: CloudRainWind, min: 0, max: 500 },
];

const PIPELINE_STEPS = [
  { label: "gen_witness", desc: "Computing inference from ONNX model" },
  { label: "prove", desc: "Generating Halo2 SNARK proof" },
  { label: "verify", desc: "Checking proof validity" },
];

export default function VerifyPage() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>("input");
  const [weather, setWeather] = useState<WeatherInput>({
    temperature: -8,
    humidity: 98,
    windSpeed: 120,
    rainfall: 250,
    stationId: 1001,
  });
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { writeContract, isPending: isWriting } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  const stepIndex = (["input", "proving", "submitting", "complete"] as const).indexOf(step);

  const handleProve = async () => {
    setStep("proving");
    setError(null);

    try {
      const res = await fetch("/api/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weather),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Proof generation failed");
      }

      const data = await res.json();
      setResult(data);
      setStep("submitting");
    } catch (e: any) {
      setError(e.message);
      setStep("input");
    }
  };

  const handleSubmitOnChain = async () => {
    if (!result || !isConnected) return;

    try {
      const decision = result.decision === "CLAIM" ? 1 : 0;

      writeContract(
        {
          address: CONTRACTS.ZKClawGateway as `0x${string}`,
          abi: GATEWAY_ABI,
          functionName: "submitOffchainVerified",
          args: [
            result.proofHash as `0x${string}`,
            result.publicInstances.map((x) =>
              typeof x === "string" && !x.startsWith("0x") ? BigInt("0x" + x) : BigInt(x)
            ),
            BigInt(0), // agentId
            BigInt(weather.stationId),
            decision,
          ],
        },
        {
          onSuccess: (hash) => {
            setTxHash(hash);
            setStep("complete");
          },
          onError: (err) => {
            setError(`Chain submission failed: ${err.message}`);
          },
        }
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReset = () => {
    setStep("input");
    setResult(null);
    setError(null);
    setTxHash(null);
  };

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-10">
        {/* Page Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1">Verify Inference</h1>
          <p className="text-muted-foreground text-sm">
            Submit DePIN weather data, generate a ZK proof of ML inference, and verify on-chain.
          </p>
        </div>

        {/* ── Step Indicator ── */}
        <div className="flex items-center mb-10">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i <= stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`
                      relative w-10 h-10 rounded-full flex items-center justify-center
                      border-2 transition-all duration-300
                      ${isCurrent
                        ? "border-primary bg-primary/10"
                        : isActive
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-secondary/30"
                      }
                    `}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? "text-primary" : "text-muted-foreground/50"
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-medium whitespace-nowrap ${
                      isActive ? "text-primary" : "text-muted-foreground/50"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-3 mt-[-18px] transition-colors duration-500 ${
                      i < stepIndex ? "bg-primary/40" : "bg-border/50"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm font-medium">
            {error}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 1 -- DePIN Input
           ══════════════════════════════════════════════════════════════ */}
        {step === "input" && (
          <div className="space-y-8">
            {/* Presets */}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">
                Weather Presets
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const isSelected =
                    weather.temperature === p.values.temperature &&
                    weather.humidity === p.values.humidity &&
                    weather.windSpeed === p.values.windSpeed &&
                    weather.rainfall === p.values.rainfall;
                  return (
                    <button
                      key={p.label}
                      onClick={() => setWeather(p.values)}
                      className={`
                        px-4 py-1.5 rounded-full text-sm font-medium
                        border transition-all duration-200 cursor-pointer
                        ${isSelected
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-secondary/40"
                        }
                      `}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input Grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              {WEATHER_FIELDS.map((field) => {
                const Icon = field.icon;
                return (
                  <div
                    key={field.key}
                    className="p-4 rounded-xl border border-border/60 bg-card/50 card-hover"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-4 h-4 text-primary/70" />
                      <label className="text-sm font-medium text-muted-foreground">
                        {field.label}
                      </label>
                    </div>
                    <input
                      type="number"
                      value={weather[field.key as keyof WeatherInput]}
                      onChange={(e) =>
                        setWeather({ ...weather, [field.key]: parseFloat(e.target.value) || 0 })
                      }
                      min={field.min}
                      max={field.max}
                      className="
                        w-full px-3 py-2.5 rounded-lg
                        border border-border/50 bg-background/80
                        text-foreground font-mono text-lg
                        focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                        transition-all duration-200
                        placeholder:text-muted-foreground/30
                      "
                    />
                  </div>
                );
              })}
            </div>

            {/* Station ID */}
            <div className="p-4 rounded-xl border border-border/60 bg-card/50 card-hover">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="w-4 h-4 text-primary/70" />
                <label className="text-sm font-medium text-muted-foreground">Station ID</label>
              </div>
              <input
                type="number"
                value={weather.stationId}
                onChange={(e) =>
                  setWeather({ ...weather, stationId: parseInt(e.target.value) || 1001 })
                }
                className="
                  w-full px-3 py-2.5 rounded-lg
                  border border-border/50 bg-background/80
                  text-foreground font-mono text-lg
                  focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                  transition-all duration-200
                "
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleProve}
              className="
                w-full py-3.5 rounded-xl font-semibold text-sm
                bg-primary text-white cursor-pointer
                hover:bg-primary active:bg-primary/80
                transition-all duration-200
                flex items-center justify-center gap-2
              "
            >
              Generate ZK Proof
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 2 -- ZKML Proving
           ══════════════════════════════════════════════════════════════ */}
        {step === "proving" && (
          <div className="py-12 flex flex-col items-center gap-8">
            <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>

            <div className="text-center">
              <div className="text-lg font-semibold text-foreground mb-1">
                Generating ZK Proof
              </div>
              <div className="text-sm text-muted-foreground font-mono">
                ONNX Model &rarr; EZKL Circuit &rarr; Halo2 Proof
              </div>
            </div>

            {/* Pipeline Visualization */}
            <div className="w-full max-w-lg space-y-0">
              {PIPELINE_STEPS.map((ps, i) => (
                <div key={ps.label} className="flex items-start gap-4">
                  {/* Timeline column */}
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary/60 mt-1.5" />
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="w-px h-8 bg-border" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-4">
                    <div className="text-sm font-mono font-semibold text-primary">{ps.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{ps.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 3 -- Chain Submit
           ══════════════════════════════════════════════════════════════ */}
        {step === "submitting" && result && (
          <div className="space-y-6">
            {/* Proof Result Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-6 text-center">
                <div className="text-primary text-xl font-bold mb-1">ZK Proof Generated</div>
                <div className="text-muted-foreground text-sm">
                  Proof verified locally. Ready to submit on-chain.
                </div>
              </div>
              <div className="border-t border-border/40" />
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
                {/* Decision */}
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Decision
                  </div>
                  <div
                    className={`text-2xl font-bold font-mono ${
                      result.decision === "CLAIM" ? "text-amber-400" : "text-primary"
                    }`}
                  >
                    {result.decision}
                  </div>
                </div>
                {/* Proof Size */}
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Proof Size
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {result.proofSize}
                    <span className="text-sm text-muted-foreground ml-1">bytes</span>
                  </div>
                </div>
                {/* Verify Time */}
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Verify Time
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {result.verifyTime}
                    <span className="text-sm text-muted-foreground ml-1">ms</span>
                  </div>
                </div>
                {/* Proof Hash */}
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Proof Hash
                  </div>
                  <div className="text-sm font-mono text-muted-foreground break-all leading-relaxed mt-1">
                    {result.proofHash}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit or Connect Wallet */}
            {isConnected ? (
              <button
                onClick={handleSubmitOnChain}
                disabled={isWriting}
                className="
                  w-full py-3.5 rounded-xl font-semibold text-sm
                  bg-primary text-white cursor-pointer
                  hover:bg-primary active:bg-primary/80
                  transition-all duration-200
                  flex items-center justify-center gap-2
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
              >
                <Send className="w-4 h-4" />
                {isWriting ? "Signing Transaction..." : "Submit to ZKClawGateway"}
              </button>
            ) : (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                <div className="text-sm text-amber-400 font-medium">
                  Connect wallet to submit on-chain. Proof is valid -- you can also record it manually.
                </div>
              </div>
            )}

            {/* Skip Link */}
            <button
              onClick={() => setStep("complete")}
              className="
                w-full py-2 text-sm text-muted-foreground cursor-pointer
                hover:text-foreground transition-colors duration-200
              "
            >
              Skip chain submission (view results only)
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 4 -- Complete
           ══════════════════════════════════════════════════════════════ */}
        {step === "complete" && result && (
          <div className="space-y-8">
            {/* Verified Header */}
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center gap-3 mb-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                <span className="text-4xl font-bold text-emerald-400 tracking-tight">
                  Verified
                </span>
              </div>
              <div className="text-muted-foreground text-sm">
                ZK proof generated and verified successfully
              </div>
              {txHash && (
                <a
                  href={`https://testnet.bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    inline-flex items-center gap-1.5 mt-4 px-4 py-2
                    rounded-lg border border-primary/30 bg-primary/5
                    text-sm text-primary font-mono
                    hover:bg-primary/10 hover:border-primary/50
                    transition-all duration-200
                  "
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              )}
            </div>

            {/* Result Grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl border border-border/60 bg-card/50 card-hover">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Decision
                </div>
                <div
                  className={`text-2xl font-bold font-mono ${
                    result.decision === "CLAIM" ? "text-amber-400" : "text-primary"
                  }`}
                >
                  {result.decision}
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border/60 bg-card/50 card-hover">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Proof Size
                </div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {result.proofSize}
                  <span className="text-sm text-muted-foreground ml-1">bytes</span>
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border/60 bg-card/50 card-hover">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Verify Time
                </div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {result.verifyTime}
                  <span className="text-sm text-muted-foreground ml-1">ms</span>
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border/60 bg-card/50 card-hover">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Proof Hash
                </div>
                <div className="text-sm font-mono text-muted-foreground break-all leading-relaxed mt-1">
                  {result.proofHash}
                </div>
              </div>
            </div>

            {/* Public Instances */}
            {result.publicInstances && result.publicInstances.length > 0 && (
              <div className="p-5 rounded-xl border border-border/60 bg-card/50">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Public Instances
                </div>
                <div className="font-mono text-xs text-muted-foreground break-all leading-relaxed bg-background/60 rounded-lg p-3 border border-border/30">
                  [{result.publicInstances.map((v, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <span className="text-primary/80">{v}</span>
                    </span>
                  ))}]
                </div>
              </div>
            )}

            {/* Verify Another */}
            <button
              onClick={handleReset}
              className="
                w-full py-3.5 rounded-xl font-semibold text-sm
                border border-border/60 text-foreground cursor-pointer
                hover:bg-secondary/40 hover:border-primary/30
                transition-all duration-200
                flex items-center justify-center gap-2
              "
            >
              <RotateCcw className="w-4 h-4" />
              Verify Another
            </button>
          </div>
        )}
      </main>
    </>
  );
}
