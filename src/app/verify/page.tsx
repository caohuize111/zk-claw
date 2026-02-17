"use client";

import { NavBar } from "@/components/NavBar";
import { useState } from "react";

type Step = "input" | "proving" | "verifying" | "complete";

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

export default function VerifyPage() {
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
      setStep("verifying");

      // Simulate on-chain submission delay
      setTimeout(() => {
        setStep("complete");
      }, 2000);
    } catch (e: any) {
      setError(e.message);
      setStep("input");
    }
  };

  const handleReset = () => {
    setStep("input");
    setResult(null);
    setError(null);
  };

  const presets = [
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

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Verify Inference</h1>
        <p className="text-muted-foreground mb-8">
          Submit DePIN weather data, generate a ZK proof of ML inference, and verify on-chain.
        </p>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {["DePIN Input", "ZKML Proof", "On-Chain Verify", "Complete"].map((label, i) => {
            const stepIndex = ["input", "proving", "verifying", "complete"].indexOf(step);
            const isActive = i <= stepIndex;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-mono font-bold ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <span className={`text-sm hidden sm:block ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < 3 && (
                  <div className={`flex-1 h-px ${isActive ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="space-y-6">
            {/* Presets */}
            <div>
              <div className="text-sm font-medium mb-2">Weather Presets</div>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setWeather(p.values)}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Fields */}
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { key: "temperature", label: "Temperature (C)", min: -20, max: 50 },
                { key: "humidity", label: "Humidity (%)", min: 0, max: 100 },
                { key: "windSpeed", label: "Wind Speed (km/h)", min: 0, max: 200 },
                { key: "rainfall", label: "Rainfall (mm)", min: 0, max: 500 },
              ].map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="text-sm font-medium">{field.label}</label>
                  <input
                    type="number"
                    value={weather[field.key as keyof WeatherInput]}
                    onChange={(e) =>
                      setWeather({ ...weather, [field.key]: parseFloat(e.target.value) || 0 })
                    }
                    min={field.min}
                    max={field.max}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Station ID</label>
              <input
                type="number"
                value={weather.stationId}
                onChange={(e) =>
                  setWeather({ ...weather, stationId: parseInt(e.target.value) || 1001 })
                }
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <button
              onClick={handleProve}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Generate ZK Proof
            </button>
          </div>
        )}

        {/* Step 2: Proving */}
        {step === "proving" && (
          <div className="text-center py-16 space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            <div>
              <div className="text-lg font-semibold">Generating ZK Proof...</div>
              <div className="text-sm text-muted-foreground mt-2 font-mono">
                ONNX Model &rarr; EZKL Circuit &rarr; Halo2 Proof
              </div>
            </div>
            <div className="max-w-md mx-auto space-y-2 text-xs text-muted-foreground font-mono">
              <div>gen_witness: computing inference...</div>
              <div>prove: generating Halo2 SNARK...</div>
              <div>verify: checking proof validity...</div>
            </div>
          </div>
        )}

        {/* Step 3: Verifying */}
        {step === "verifying" && result && (
          <div className="text-center py-16 space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin" />
            <div>
              <div className="text-lg font-semibold">Submitting to Chain...</div>
              <div className="text-sm text-muted-foreground mt-2">
                ZKClawGateway.submitVerifiedInference()
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === "complete" && result && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-primary/30 bg-primary/5 text-center">
              <div className="text-primary text-4xl font-bold mb-2">Verified</div>
              <div className="text-muted-foreground">
                ZK proof generated and verified successfully
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground">Decision</div>
                <div
                  className={`text-xl font-bold mt-1 ${
                    result.decision === "CLAIM" ? "text-amber-400" : "text-primary"
                  }`}
                >
                  {result.decision}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground">Proof Size</div>
                <div className="text-xl font-bold font-mono mt-1">{result.proofSize} bytes</div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground">Verify Time</div>
                <div className="text-xl font-bold font-mono mt-1">{result.verifyTime}ms</div>
              </div>
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground">Proof Hash</div>
                <div className="text-sm font-mono mt-1 text-muted-foreground break-all">
                  {result.proofHash}
                </div>
              </div>
            </div>

            {result.publicInstances && (
              <div className="p-4 rounded-xl border border-border bg-card">
                <div className="text-sm text-muted-foreground mb-2">Public Instances</div>
                <div className="font-mono text-xs text-muted-foreground break-all">
                  {JSON.stringify(result.publicInstances)}
                </div>
              </div>
            )}

            <button
              onClick={handleReset}
              className="w-full py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-secondary/50 transition-colors"
            >
              Verify Another
            </button>
          </div>
        )}
      </main>
    </>
  );
}
