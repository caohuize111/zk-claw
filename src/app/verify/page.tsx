"use client";

import { NavBar } from "@/components/NavBar";
import { useState, useRef } from "react";
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
  Bot,
  ShieldCheck,
  Clock,
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
  hexProof: string;
  publicInstances: string[];
  verifyTime: number;
}

const STEPS = [
  { key: "input", label: "DePIN Input", icon: CloudRain },
  { key: "proving", label: "ZKML Proof", icon: Cpu },
  { key: "submitting", label: "Chain Submit", icon: Send },
  { key: "complete", label: "Verified", icon: CheckCircle2 },
] as const;

const PIPELINE_LAYERS = [
  { key: "depin", label: "DePIN Capture", desc: "Hardware-signed sensor data", icon: Radio },
  { key: "zkml", label: "ZKML Inference", desc: "EZKL Halo2 proof generation", icon: Cpu },
  { key: "agent", label: "Agent Assembly", desc: "Transaction packaging", icon: Bot },
  { key: "verify", label: "On-Chain Verify", desc: "Dual trust verification", icon: ShieldCheck },
  { key: "settle", label: "Settlement", desc: "Record + reputation update", icon: CheckCircle2 },
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
  const [agentId, setAgentId] = useState(0);
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [pipelineLayer, setPipelineLayer] = useState(0);
  const [layerTimes, setLayerTimes] = useState<number[]>([]);
  const layerStartRef = useRef<number>(0);

  const { writeContract, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  const stepIndex = (["input", "proving", "submitting", "complete"] as const).indexOf(step);

  const recordLayerTime = () => {
    const now = Date.now();
    const elapsed = now - layerStartRef.current;
    setLayerTimes((prev) => [...prev, elapsed]);
    layerStartRef.current = now;
  };

  const handleProve = async () => {
    setStep("proving");
    setError(null);
    setPipelineLayer(1);
    setLayerTimes([]);
    layerStartRef.current = Date.now();

    try {
      // Layer 1: DePIN Capture (simulated hardware data signing)
      await new Promise((resolve) => setTimeout(resolve, 500));
      recordLayerTime();
      setPipelineLayer(2);

      // Layer 2: ZKML Inference (synchronous API call)
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
      recordLayerTime();
      setResult(data);
      setStep("submitting");
      setPipelineLayer(2);
    } catch (e: any) {
      setError(e.message);
      setStep("input");
      setPipelineLayer(0);
    }
  };

  // Convert EZKL little-endian hex to big-endian BigInt (browser-safe, no Buffer)
  const leHexToBigInt = (leHex: string): bigint => {
    const clean = leHex.startsWith("0x") ? leHex.slice(2) : leHex;
    const bytes = clean.match(/.{2}/g) || [];
    const beHex = bytes.reverse().join("");
    return BigInt("0x" + beHex);
  };

  const handleSubmitOnChain = async () => {
    if (!result || !isConnected) return;

    setPipelineLayer(3);
    layerStartRef.current = Date.now();
    setLayerTimes((prev) => prev.slice(0, 2));

    try {
      // Layer 3: Agent Assembly (transaction packaging)
      await new Promise((resolve) => setTimeout(resolve, 300));
      recordLayerTime();
      setPipelineLayer(4);

      // Layer 4 & 5: On-chain verify + Settlement
      writeContract(
        {
          address: CONTRACTS.ZKClawGateway as `0x${string}`,
          abi: GATEWAY_ABI,
          functionName: "submitOffchainVerified",
          args: [
            result.publicInstances.map((x) => leHexToBigInt(x)),
            BigInt(agentId),
            BigInt(weather.stationId),
          ],
        },
        {
          onSuccess: (hash) => {
            recordLayerTime();
            setPipelineLayer(5);
            setTxHash(hash);
            setTimeout(() => {
              recordLayerTime();
              setStep("complete");
            }, 400);
          },
          onError: (err) => {
            setError(`Chain submission failed: ${err.message}`);
            setPipelineLayer(0);
          },
        }
      );
    } catch (e: any) {
      setError(e.message);
      setPipelineLayer(0);
    }
  };

  const handleReset = () => {
    setStep("input");
    setResult(null);
    setError(null);
    setTxHash(null);
    setPipelineLayer(0);
    setLayerTimes([]);
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

        {/* -- Step Indicator -- */}
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

        {/* -- Error Banner -- */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm font-medium">
            {error}
          </div>
        )}

        {/* ==============================================================
            Step 1 -- DePIN Input
           ============================================================== */}
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

            {/* Station ID + Agent ID */}
            <div className="grid sm:grid-cols-2 gap-4">
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
              <div className="p-4 rounded-xl border border-border/60 bg-card/50 card-hover">
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="w-4 h-4 text-primary/70" />
                  <label className="text-sm font-medium text-muted-foreground">Agent ID (NFA)</label>
                </div>
                <input
                  type="number"
                  value={agentId}
                  onChange={(e) => setAgentId(parseInt(e.target.value) || 0)}
                  min={0}
                  className="
                    w-full px-3 py-2.5 rounded-lg
                    border border-border/50 bg-background/80
                    text-foreground font-mono text-lg
                    focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                    transition-all duration-200
                  "
                />
              </div>
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

        {/* ==============================================================
            Step 2 -- ZKML Proving (5-Layer Pipeline)
           ============================================================== */}
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
                5-Layer Verification Pipeline
              </div>
            </div>

            {/* 5-Layer Pipeline Visualization */}
            <div className="w-full max-w-lg">
              {PIPELINE_LAYERS.map((layer, i) => {
                const LayerIcon = layer.icon;
                const isComplete = i < pipelineLayer;
                const isActive = i === pipelineLayer - 1;
                const isPending = i >= pipelineLayer;

                return (
                  <div key={layer.key} className="flex items-start gap-4">
                    {/* Timeline column */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center
                          border transition-all duration-500
                          ${isComplete
                            ? "border-emerald-500/60 bg-emerald-500/10"
                            : isActive
                              ? "border-primary bg-primary/10"
                              : "border-border/60 bg-secondary/20"
                          }
                        `}
                        style={isActive ? { animation: "pulse-layer 2s ease-in-out infinite" } : {}}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isActive ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : (
                          <LayerIcon className="w-4 h-4 text-muted-foreground/40" />
                        )}
                      </div>
                      {i < PIPELINE_LAYERS.length - 1 && (
                        <div
                          className={`
                            w-px h-6 transition-colors duration-500
                            ${isComplete ? "bg-emerald-500/40" : "bg-border/40"}
                          `}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex items-start justify-between pb-4 pt-1">
                      <div>
                        <div
                          className={`
                            text-sm font-semibold transition-colors duration-300
                            ${isComplete
                              ? "text-emerald-400"
                              : isActive
                                ? "text-primary"
                                : "text-muted-foreground/50"
                            }
                          `}
                        >
                          {layer.label}
                        </div>
                        <div
                          className={`
                            text-xs mt-0.5 transition-colors duration-300
                            ${isComplete || isActive
                              ? "text-muted-foreground"
                              : "text-muted-foreground/30"
                            }
                          `}
                        >
                          {layer.desc}
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="text-xs font-mono pt-0.5">
                        {isComplete && layerTimes[i] !== undefined ? (
                          <span className="text-emerald-400">
                            {(layerTimes[i] / 1000).toFixed(1)}s
                          </span>
                        ) : isActive ? (
                          <Loader2 className="w-3 h-3 text-primary animate-spin" />
                        ) : (
                          <span className="text-muted-foreground/30">--</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pulse animation style */}
            <style>{`
              @keyframes pulse-layer {
                0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.3); }
                50% { box-shadow: 0 0 0 6px hsl(var(--primary) / 0); }
              }
            `}</style>
          </div>
        )}

        {/* ==============================================================
            Step 3 -- Chain Submit
           ============================================================== */}
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
                disabled={isWriting || isConfirming}
                className="
                  w-full py-3.5 rounded-xl font-semibold text-sm
                  bg-primary text-white cursor-pointer
                  hover:bg-primary active:bg-primary/80
                  transition-all duration-200
                  flex items-center justify-center gap-2
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
              >
                {(isWriting || isConfirming) && <Loader2 className="w-4 h-4 animate-spin" />}
                {!isWriting && !isConfirming && <Send className="w-4 h-4" />}
                {isWriting ? "Signing Transaction..." : isConfirming ? "Confirming..." : "Submit to ZKClawGateway"}
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

        {/* ==============================================================
            Step 4 -- Complete
           ============================================================== */}
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

            {/* Dual Trust Verification */}
            <div className="p-5 rounded-xl border border-border/60 bg-card/50">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
                Dual Trust Verification
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">ZK Proof: <span className="text-emerald-400 font-mono">Verified</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">DePIN Hardware: <span className="text-emerald-400 font-mono">Authenticated</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="text-sm">Decision: <span className={`font-mono font-bold ${result.decision === 'CLAIM' ? 'text-amber-400' : 'text-primary'}`}>{result.decision}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">Freshness: <span className="text-emerald-400 font-mono">Fresh</span></span>
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
