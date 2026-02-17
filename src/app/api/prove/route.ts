import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const execAsync = promisify(exec);

const ZKML_DIR = path.join(process.cwd(), "..", "zkml");
const ARTIFACTS_DIR = path.join(ZKML_DIR, "artifacts");

// Normalization params from training
const NORM_PARAMS = {
  min: [-9.952, 10.227, 0.197, 0.081],
  max: [44.956, 99.957, 149.775, 299.737],
};

function normalize(raw: number[]): number[] {
  return raw.map((val, i) =>
    (val - NORM_PARAMS.min[i]) / (NORM_PARAMS.max[i] - NORM_PARAMS.min[i] + 1e-8)
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { temperature, humidity, windSpeed, rainfall } = body;

    // Validate inputs
    if (
      typeof temperature !== "number" ||
      typeof humidity !== "number" ||
      typeof windSpeed !== "number" ||
      typeof rainfall !== "number"
    ) {
      return NextResponse.json({ error: "Invalid input parameters" }, { status: 400 });
    }

    const startTime = Date.now();

    // Normalize inputs
    const normalized = normalize([temperature, humidity, windSpeed, rainfall]);

    // Write input.json for EZKL
    const inputData = { input_data: [normalized] };
    const inputPath = path.join(ZKML_DIR, "input_api.json");
    await writeFile(inputPath, JSON.stringify(inputData, null, 2));

    // Check if artifacts exist (pre-generated from pipeline)
    const compiledPath = path.join(ARTIFACTS_DIR, "model.compiled");
    const pkPath = path.join(ARTIFACTS_DIR, "pk.key");
    const srsPath = path.join(ARTIFACTS_DIR, "kzg.srs");
    const settingsPath = path.join(ARTIFACTS_DIR, "settings.json");
    const vkPath = path.join(ARTIFACTS_DIR, "vk.key");

    // Run EZKL prove via Python script
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
WITNESS = os.path.join(ARTIFACTS, "witness_api.json")
PROOF = os.path.join(ARTIFACTS, "proof_api.json")

async def main():
    # gen_witness
    res = ezkl.gen_witness(INPUT, COMPILED, WITNESS)
    if hasattr(res, '__await__'):
        res = await res
    elif asyncio.isfuture(res):
        res = await res

    # prove
    res = ezkl.prove(WITNESS, COMPILED, PK, proof_path=PROOF, srs_path=SRS)
    assert res, "prove failed"

    # verify
    res = ezkl.verify(PROOF, SETTINGS, VK, srs_path=SRS, reduced_srs=False)
    assert res, "verify failed"

    # Read proof
    with open(PROOF) as f:
        proof_data = json.load(f)

    print(json.dumps({
        "verified": True,
        "proofSize": os.path.getsize(PROOF),
        "instances": proof_data.get("instances", []),
        "proofHash": proof_data.get("hex_proof", "")[:66] if proof_data.get("hex_proof") else ""
    }))

asyncio.run(main())
`;

    const scriptPath = path.join(ARTIFACTS_DIR, "_api_prove.py");
    await writeFile(scriptPath, proveScript);

    const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, {
      timeout: 60000,
      cwd: ZKML_DIR,
    });

    const proofResult = JSON.parse(stdout.trim().split("\n").pop()!);
    const elapsed = Date.now() - startTime;

    // Determine decision from public instances
    let decision = "NORMAL";
    const instances = proofResult.instances?.[0] || [];
    if (instances.length >= 6) {
      // Compare output logits (last 2 instances)
      const out0 = BigInt("0x" + instances[4]);
      const out1 = BigInt("0x" + instances[5]);
      decision = out1 > out0 ? "CLAIM" : "NORMAL";
    }

    // Generate proof hash
    const proofHash =
      proofResult.proofHash ||
      "0x" + crypto.createHash("sha256").update(stdout).digest("hex").slice(0, 64);

    return NextResponse.json({
      decision,
      confidence: "ZK-verified",
      proofSize: proofResult.proofSize,
      proofHash,
      publicInstances: instances,
      verifyTime: elapsed,
      input: { temperature, humidity, windSpeed, rainfall },
      normalized,
    });
  } catch (error: any) {
    console.error("Prove API error:", error);
    return NextResponse.json(
      { error: error.message || "Proof generation failed" },
      { status: 500 }
    );
  }
}
