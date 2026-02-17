"""
ZK-Claw: EZKL full pipeline (step by step with careful error handling)
"""

import ezkl
import json
import os
import asyncio
import shutil

BASE = "/Users/xiaobai/Desktop/zk-claw/zkml"
ARTIFACTS = os.path.join(BASE, "artifacts")

# Clean start
if os.path.exists(ARTIFACTS):
    shutil.rmtree(ARTIFACTS)
os.makedirs(ARTIFACTS)

MODEL = os.path.join(BASE, "model.onnx")
INPUT = os.path.join(BASE, "input.json")
SETTINGS = os.path.join(ARTIFACTS, "settings.json")
COMPILED = os.path.join(ARTIFACTS, "model.compiled")
SRS = os.path.join(ARTIFACTS, "kzg.srs")
PK = os.path.join(ARTIFACTS, "pk.key")
VK = os.path.join(ARTIFACTS, "vk.key")
WITNESS = os.path.join(ARTIFACTS, "witness.json")
PROOF = os.path.join(ARTIFACTS, "proof.json")
VERIFIER_SOL = "/Users/xiaobai/Desktop/zk-claw/contracts/contracts/verifier/Halo2Verifier.sol"


async def main():
    print("=" * 60)
    print("ZK-Claw EZKL Pipeline")
    print("=" * 60)

    # Step 1: gen_settings
    print("\n[1/8] gen_settings...")
    py_run_args = ezkl.PyRunArgs()
    py_run_args.input_visibility = "public"
    py_run_args.output_visibility = "public"
    py_run_args.param_visibility = "fixed"
    res = ezkl.gen_settings(MODEL, SETTINGS, py_run_args=py_run_args)
    assert res, "gen_settings failed"
    print("  OK")

    # Step 2: calibrate_settings
    print("\n[2/8] calibrate_settings...")
    res = ezkl.calibrate_settings(INPUT, MODEL, SETTINGS, target="resources")
    assert res, "calibrate_settings failed"
    with open(SETTINGS) as f:
        s = json.load(f)
    logrows = s.get("run_args", {}).get("logrows", 15)
    print(f"  OK (logrows={logrows})")

    # Step 3: compile_circuit
    print("\n[3/8] compile_circuit...")
    res = ezkl.compile_circuit(MODEL, COMPILED, SETTINGS)
    assert res, "compile_circuit failed"
    print("  OK")

    # Step 4: gen_srs (local generation - get_srs has field modulus bug in v23)
    print(f"\n[4/8] gen_srs (logrows={logrows})...")
    ezkl.gen_srs(SRS, logrows)
    srs_size = os.path.getsize(SRS) if os.path.exists(SRS) else 0
    print(f"  OK (SRS size: {srs_size/1024/1024:.1f} MB)")
    assert srs_size > 0, "SRS file is empty or missing"

    # Step 5: setup
    print("\n[5/8] setup...")
    res = ezkl.setup(COMPILED, VK, PK, SRS)
    assert res, "setup failed"
    print(f"  OK (pk={os.path.getsize(PK)} bytes, vk={os.path.getsize(VK)} bytes)")

    # Step 6: gen_witness
    print("\n[6/8] gen_witness...")
    res = ezkl.gen_witness(INPUT, COMPILED, WITNESS)
    if hasattr(res, '__await__'):
        res = await res
    elif asyncio.isfuture(res):
        res = await res
    print("  OK")

    # Step 7: prove
    print("\n[7/8] prove...")
    res = ezkl.prove(WITNESS, COMPILED, PK, proof_path=PROOF, srs_path=SRS)
    assert res, "prove failed"
    print(f"  OK (proof size: {os.path.getsize(PROOF)} bytes)")

    # Verify locally
    print("\n  verify...")
    res = ezkl.verify(PROOF, SETTINGS, VK, srs_path=SRS, reduced_srs=False)
    print(f"  Verification: {'PASS' if res else 'FAIL'}")
    assert res, "Verification failed!"

    # Step 8: create_evm_verifier
    print("\n[8/8] create_evm_verifier...")
    os.makedirs(os.path.dirname(VERIFIER_SOL), exist_ok=True)
    ABI_PATH = os.path.join(ARTIFACTS, "verifier_abi.json")
    res = ezkl.create_evm_verifier(VK, SETTINGS, VERIFIER_SOL, abi_path=ABI_PATH, srs_path=SRS, reusable=False)
    if hasattr(res, '__await__'):
        res = await res
    elif asyncio.isfuture(res):
        res = await res
    verifier_size = os.path.getsize(VERIFIER_SOL) if os.path.exists(VERIFIER_SOL) else 0
    print(f"  OK (verifier: {verifier_size/1024:.1f} KB)")

    # Also encode EVM calldata for the proof
    print("\n  encode_evm_calldata...")
    calldata = ezkl.encode_evm_calldata(PROOF)
    calldata_hex = calldata.hex() if isinstance(calldata, bytes) else str(calldata)
    calldata_path = os.path.join(ARTIFACTS, "calldata.json")
    with open(calldata_path, "w") as f:
        json.dump({"calldata": calldata_hex}, f)
    print(f"  OK (calldata saved)")

    # Summary
    with open(PROOF, "r") as f:
        proof_data = json.load(f)
    print(f"\n{'=' * 60}")
    print("PIPELINE COMPLETE!")
    print(f"  Model: {MODEL}")
    print(f"  Proof: {os.path.getsize(PROOF)} bytes")
    if verifier_size > 0:
        over = " (WARNING: >24KB - use split deployment)" if verifier_size > 24576 else " (OK, under 24KB)"
        print(f"  Verifier: {verifier_size/1024:.1f} KB{over}")
    if "instances" in proof_data:
        print(f"  Public instances: {proof_data['instances']}")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    asyncio.run(main())
