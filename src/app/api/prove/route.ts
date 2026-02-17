import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

const ZKML_DIR = path.join(process.cwd(), "zkml");
const ARTIFACTS_DIR = path.join(ZKML_DIR, "artifacts");

// ── BN254 Field Constants ──
const BN254_P = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);
const HALF_P = BN254_P / BigInt(2);

function fieldToSigned(x: bigint): bigint {
  return x > HALF_P ? x - BN254_P : x;
}

// Convert EZKL little-endian hex instance to big-endian BigInt
function leToBigInt(leHex: string): bigint {
  const clean = leHex.replace(/^0x/i, "");
  const bytes = clean.match(/.{2}/g) || [];
  const beHex = bytes.reverse().join("");
  return BigInt("0x" + beHex);
}

// ── Normalization (Fix #6: read from norm_params.json, not hardcoded) ──
let normParamsCache: { min: number[]; max: number[] } | null = null;

function getNormParams(): { min: number[]; max: number[] } {
  if (!normParamsCache) {
    const raw = JSON.parse(
      readFileSync(path.join(ZKML_DIR, "norm_params.json"), "utf-8")
    );
    normParamsCache = { min: raw.min, max: raw.max };
  }
  return normParamsCache;
}

function normalize(raw: number[]): number[] {
  const params = getNormParams();
  return raw.map(
    (val, i) =>
      (val - params.min[i]) / (params.max[i] - params.min[i] + 1e-8)
  );
}

// ── Input Range Validation ──
const VALID_RANGES: Record<string, [number, number]> = {
  temperature: [-50, 100],
  humidity: [0, 100],
  windSpeed: [0, 500],
  rainfall: [0, 1000],
};

function validateInput(input: any): string | null {
  for (const [field, [min, max]] of Object.entries(VALID_RANGES)) {
    const val = input[field];
    if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
      return `Invalid ${field}: must be a finite number`;
    }
    if (val < min || val > max) {
      return `${field} out of range [${min}, ${max}]`;
    }
  }
  return null;
}

// ── Mode Selection (3 modes) ──
// 1. Demo mode (default): reads pre-generated proof, zero latency, Vercel-friendly
// 2. Remote mode: delegates to standalone prover-service (FastAPI), polls for result
// 3. Realtime mode: runs EZKL in-process (legacy, requires VPS with EZKL installed)
const PROVER_SERVICE_URL = process.env.PROVER_SERVICE_URL || ""; // e.g. "http://localhost:8080"
const REALTIME_ENABLED = process.env.ENABLE_REALTIME_PROVE === "true";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Rate Limiting (in-memory, per-IP, 10 requests per minute) ──
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });

    // Cleanup expired entries every 100 checks
    if (rateLimitMap.size > 100) {
      rateLimitMap.forEach((val, key) => {
        if (now > val.resetAt) rateLimitMap.delete(key);
      });
    }

    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 requests per minute." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { temperature, humidity, windSpeed, rainfall } = body;

    if (
      typeof temperature !== "number" ||
      typeof humidity !== "number" ||
      typeof windSpeed !== "number" ||
      typeof rainfall !== "number"
    ) {
      return NextResponse.json(
        { error: "Invalid input parameters" },
        { status: 400 }
      );
    }

    const validationError = validateInput({ temperature, humidity, windSpeed, rainfall });
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const normalized = normalize([temperature, humidity, windSpeed, rainfall]);
    const input = { temperature, humidity, windSpeed, rainfall };

    if (PROVER_SERVICE_URL) {
      return await handleRemoteProve(input, startTime);
    } else if (REALTIME_ENABLED) {
      return await handleRealtimeProve(normalized, input, startTime);
    } else {
      return await handleDemoProve(normalized, input, startTime);
    }
  } catch (error: any) {
    console.error("Prove API error:", error);
    return NextResponse.json(
      { error: error.message || "Proof generation failed" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Demo Mode: Pre-generated proof, zero latency
// ═══════════════════════════════════════════════════════════════

async function handleDemoProve(
  normalized: number[],
  input: { temperature: number; humidity: number; windSpeed: number; rainfall: number },
  startTime: number
) {
  // Read pre-generated proof from EZKL pipeline
  const proofPath = path.join(ARTIFACTS_DIR, "proof.json");
  let proofData;
  try {
    proofData = JSON.parse(await readFile(proofPath, "utf-8"));
  } catch {
    return NextResponse.json(
      { error: "Demo artifacts not found. Set PROVER_SERVICE_URL for production." },
      { status: 503 }
    );
  }

  const instances = proofData.instances?.[0] || [];
  const hexProof: string = proofData.hex_proof || "";

  // Extract decision using BN254 signed comparison (Fix #5)
  let decision = "NORMAL";
  if (instances.length >= 6) {
    const out0 = leToBigInt(instances[4]);
    const out1 = leToBigInt(instances[5]);
    const out0Signed = fieldToSigned(out0);
    const out1Signed = fieldToSigned(out1);
    decision = out1Signed > out0Signed ? "CLAIM" : "NORMAL";
  }

  const elapsed = Date.now() - startTime;

  const proofHash =
    "0x" +
    crypto
      .createHash("sha256")
      .update(hexProof)
      .digest("hex")
      .slice(0, 64);

  return NextResponse.json({
    decision,
    confidence: "ZK-verified (demo mode)",
    proofSize: hexProof.length,
    proofHash,
    hexProof,
    publicInstances: instances,
    verifyTime: elapsed,
    input,
    normalized,
    mode: "demo",
  });
}

// ═══════════════════════════════════════════════════════════════
// Remote Mode: Delegate to standalone prover-service (production)
// ═══════════════════════════════════════════════════════════════

async function handleRemoteProve(
  input: { temperature: number; humidity: number; windSpeed: number; rainfall: number },
  startTime: number
) {
  // Submit task to prover service
  const submitRes = await fetch(`${PROVER_SERVICE_URL}/prove`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.PROVER_API_KEY || "dev-key-change-me",
    },
    body: JSON.stringify(input),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Prover service error: ${err}`);
  }

  const { task_id } = await submitRes.json();

  // Poll for completion (max 5 minutes)
  const POLL_INTERVAL = 2000; // 2 seconds
  const MAX_POLLS = 150; // 5 minutes

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const statusRes = await fetch(`${PROVER_SERVICE_URL}/prove/${task_id}`);
    if (!statusRes.ok) continue;

    const task = await statusRes.json();

    if (task.status === "completed" && task.result) {
      const elapsed = Date.now() - startTime;
      return NextResponse.json({
        decision: task.result.decision,
        confidence: "ZK-verified (remote prover)",
        proofSize: task.result.proofSize,
        proofHash: task.result.proofHash,
        hexProof: task.result.hexProof,
        publicInstances: task.result.publicInstances,
        verifyTime: elapsed,
        input: task.result.input,
        normalized: task.result.normalized,
        mode: "remote",
      });
    }

    if (task.status === "failed") {
      throw new Error(task.error || "Prover service task failed");
    }
  }

  throw new Error("Prover service timeout after 5 minutes");
}

// ═══════════════════════════════════════════════════════════════
// Realtime Mode: Session-isolated EZKL proving (legacy, requires VPS)
// ═══════════════════════════════════════════════════════════════

async function handleRealtimeProve(
  normalized: number[],
  input: { temperature: number; humidity: number; windSpeed: number; rainfall: number },
  startTime: number
) {
  // Create isolated session directory to prevent concurrent file overwrites (Fix #2)
  const sessionId = crypto.randomUUID();
  const sessionDir = path.join(ARTIFACTS_DIR, `session-${sessionId}`);
  await mkdir(sessionDir, { recursive: true });

  try {
    const inputData = { input_data: [normalized] };
    const inputPath = path.join(sessionDir, "input.json");
    await writeFile(inputPath, JSON.stringify(inputData, null, 2));

    const witnessPath = path.join(sessionDir, "witness.json");
    const proofOutputPath = path.join(sessionDir, "proof.json");

    const proveScript = `
import ezkl
import json
import os
import asyncio

ARTIFACTS = "${ARTIFACTS_DIR}"
INPUT = "${inputPath}"
COMPILED = os.path.join(ARTIFACTS, "model.compiled")
PK = os.path.join(ARTIFACTS, "pk.key")
SRS = os.path.join(ARTIFACTS, "kzg.srs")
SETTINGS = os.path.join(ARTIFACTS, "settings.json")
VK = os.path.join(ARTIFACTS, "vk.key")
WITNESS = "${witnessPath}"
PROOF = "${proofOutputPath}"

async def main():
    res = ezkl.gen_witness(INPUT, COMPILED, WITNESS)
    if hasattr(res, '__await__'):
        res = await res
    elif asyncio.isfuture(res):
        res = await res

    res = ezkl.prove(WITNESS, COMPILED, PK, proof_path=PROOF, srs_path=SRS)
    assert res, "prove failed"

    res = ezkl.verify(PROOF, SETTINGS, VK, srs_path=SRS, reduced_srs=False)
    assert res, "verify failed"

    with open(PROOF) as f:
        proof_data = json.load(f)

    print(json.dumps({
        "verified": True,
        "proofSize": os.path.getsize(PROOF),
        "instances": proof_data.get("instances", []),
        "hex_proof": proof_data.get("hex_proof", "")
    }))

asyncio.run(main())
`;

    const scriptPath = path.join(sessionDir, "_prove.py");
    await writeFile(scriptPath, proveScript);

    const { stdout } = await execFileAsync("python3", [scriptPath], {
      timeout: 120000,
      cwd: ZKML_DIR,
    });

    const proofResult = JSON.parse(stdout.trim().split("\n").pop()!);
    const elapsed = Date.now() - startTime;

    const instances = proofResult.instances?.[0] || [];
    const hexProof: string = proofResult.hex_proof || "";

    // Extract decision using BN254 signed comparison (Fix #5)
    let decision = "NORMAL";
    if (instances.length >= 6) {
      const out0 = leToBigInt(instances[4]);
      const out1 = leToBigInt(instances[5]);
      const out0Signed = fieldToSigned(out0);
      const out1Signed = fieldToSigned(out1);
      decision = out1Signed > out0Signed ? "CLAIM" : "NORMAL";
    }

    const proofHash =
      "0x" +
      crypto
        .createHash("sha256")
        .update(hexProof)
        .digest("hex")
        .slice(0, 64);

    return NextResponse.json({
      decision,
      confidence: "ZK-verified (realtime)",
      proofSize: proofResult.proofSize,
      proofHash,
      hexProof,
      publicInstances: instances,
      verifyTime: elapsed,
      input,
      normalized,
      mode: "realtime",
    });
  } finally {
    // Clean up session directory
    try {
      await rm(sessionDir, { recursive: true, force: true });
    } catch {}
  }
}
