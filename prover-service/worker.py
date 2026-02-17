"""
ZK-Claw Celery Worker -- prove_inference task

Usage:
  celery -A worker worker --loglevel=info --concurrency=2
"""
import hashlib
import json
import os
import shutil
import uuid
from pathlib import Path

from celery_app import celery_app

ZKML_DIR = os.environ.get("ZKML_DIR", str(Path(__file__).parent.parent / "zkml"))
ARTIFACTS_DIR = os.path.join(ZKML_DIR, "artifacts")

BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617
HALF_P = BN254_P // 2


def _get_norm_params():
    with open(os.path.join(ZKML_DIR, "norm_params.json")) as f:
        return json.load(f)


def _normalize(raw: list[float]) -> list[float]:
    params = _get_norm_params()
    return [
        (v - params["min"][i]) / (params["max"][i] - params["min"][i] + 1e-8)
        for i, v in enumerate(raw)
    ]


def _le_hex_to_int(le_hex: str) -> int:
    clean = le_hex.removeprefix("0x").removeprefix("0X")
    return int.from_bytes(bytes.fromhex(clean), "little")


def _extract_decision(instances: list[str]) -> str:
    if len(instances) < 6:
        return "NORMAL"
    out0 = _le_hex_to_int(instances[4])
    out1 = _le_hex_to_int(instances[5])
    out0_signed = out0 - BN254_P if out0 > HALF_P else out0
    out1_signed = out1 - BN254_P if out1 > HALF_P else out1
    return "CLAIM" if out1_signed > out0_signed else "NORMAL"


# ── Input Range Validation ──
VALID_RANGES = {
    "temperature": (-50, 100),
    "humidity": (0, 100),
    "windSpeed": (0, 500),
    "rainfall": (0, 1000),
}


def _validate_input(temperature: float, humidity: float, wind_speed: float, rainfall: float):
    values = {"temperature": temperature, "humidity": humidity, "windSpeed": wind_speed, "rainfall": rainfall}
    for field, (min_val, max_val) in VALID_RANGES.items():
        val = values[field]
        if not isinstance(val, (int, float)) or val != val:  # NaN check
            raise ValueError(f"Invalid {field}: must be a number")
        if val < min_val or val > max_val:
            raise ValueError(f"{field} out of range [{min_val}, {max_val}]")


@celery_app.task(bind=True, name="prove_inference")
def prove_inference(self, temperature: float, humidity: float, wind_speed: float, rainfall: float):
    """Run EZKL prove pipeline in isolated session directory."""
    _validate_input(temperature, humidity, wind_speed, rainfall)

    session_id = str(uuid.uuid4())
    session_dir = os.path.join(ARTIFACTS_DIR, f"session-{session_id}")
    os.makedirs(session_dir, exist_ok=True)

    try:
        # Step 1: Normalize
        self.update_state(state="PROVING", meta={"step": "normalizing", "progress": 10})
        normalized = _normalize([temperature, humidity, wind_speed, rainfall])

        # Step 2: Write input
        input_path = os.path.join(session_dir, "input.json")
        with open(input_path, "w") as f:
            json.dump({"input_data": [normalized]}, f)

        # Step 3: gen_witness
        self.update_state(state="PROVING", meta={"step": "gen_witness", "progress": 30})
        import ezkl

        witness_path = os.path.join(session_dir, "witness.json")
        proof_path = os.path.join(session_dir, "proof.json")
        compiled_path = os.path.join(ARTIFACTS_DIR, "model.compiled")

        import asyncio

        res = ezkl.gen_witness(input_path, compiled_path, witness_path)
        if hasattr(res, "__await__") or asyncio.isfuture(res):
            asyncio.run(res)

        # Step 4: prove
        self.update_state(state="PROVING", meta={"step": "proving", "progress": 50})
        pk_path = os.path.join(ARTIFACTS_DIR, "pk.key")
        srs_path = os.path.join(ARTIFACTS_DIR, "kzg.srs")

        res = ezkl.prove(
            witness_path, compiled_path, pk_path,
            proof_path=proof_path, srs_path=srs_path,
        )
        if hasattr(res, "__await__") or asyncio.isfuture(res):
            res = asyncio.run(res)
        if not res:
            raise RuntimeError("EZKL prove returned False")

        # Step 5: verify
        self.update_state(state="PROVING", meta={"step": "verifying", "progress": 80})
        settings_path = os.path.join(ARTIFACTS_DIR, "settings.json")
        vk_path = os.path.join(ARTIFACTS_DIR, "vk.key")

        res = ezkl.verify(
            proof_path, settings_path, vk_path,
            srs_path=srs_path, reduced_srs=False,
        )
        if hasattr(res, "__await__") or asyncio.isfuture(res):
            res = asyncio.run(res)
        if not res:
            raise RuntimeError("EZKL verify returned False")

        # Step 6: Parse results
        self.update_state(state="PROVING", meta={"step": "finalizing", "progress": 95})
        with open(proof_path) as f:
            proof_data = json.load(f)

        instances = proof_data.get("instances", [[]])[0]
        hex_proof = proof_data.get("hex_proof", "")
        decision = _extract_decision(instances)

        proof_hash = "0x" + hashlib.sha256(hex_proof.encode()).hexdigest()[:64]

        return {
            "decision": decision,
            "hexProof": hex_proof,
            "publicInstances": instances,
            "proofSize": len(hex_proof),
            "proofHash": proof_hash,
            "input": {
                "temperature": temperature,
                "humidity": humidity,
                "windSpeed": wind_speed,
                "rainfall": rainfall,
            },
            "normalized": normalized,
        }

    finally:
        shutil.rmtree(session_dir, ignore_errors=True)
