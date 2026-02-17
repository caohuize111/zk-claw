"""
ZK-Claw Prover Service -- Standalone FastAPI + async EZKL proving

Architecture:
  POST /prove       -> Create prove task, returns task_id
  GET  /prove/{id}  -> Poll task status (pending/running/completed/failed)
  GET  /health      -> Health check

Deployment: Docker container with EZKL + Python, separate from Next.js frontend.
For production, replace in-memory task store with Redis.
"""

import asyncio
import hashlib
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── API Key Authentication ──
PROVER_API_KEY = os.environ.get("PROVER_API_KEY", "dev-key-change-me")


async def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != PROVER_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    asyncio.create_task(cleanup_tasks())
    yield
    # Shutdown (nothing needed)

app = FastAPI(
    title="ZK-Claw Prover Service",
    description="Standalone EZKL proof generation service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ──
ZKML_DIR = os.environ.get("ZKML_DIR", str(Path(__file__).parent.parent / "zkml"))
ARTIFACTS_DIR = os.path.join(ZKML_DIR, "artifacts")
MAX_CONCURRENT_TASKS = int(os.environ.get("MAX_CONCURRENT_TASKS", "4"))
USE_CELERY = os.environ.get("USE_CELERY", "false").lower() == "true"
TASK_TTL_SECONDS = 600  # 10 minutes
MAX_TASKS = 1000

# ── BN254 Constants ──
BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617
HALF_P = BN254_P // 2

# ── In-memory task store (use Redis in production) ──
tasks: dict[str, dict] = {}
semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)


# ── Models ──
class ProveRequest(BaseModel):
    temperature: float
    humidity: float
    windSpeed: float
    rainfall: float


class TaskResponse(BaseModel):
    task_id: str
    status: str  # pending, running, completed, failed
    result: Optional[dict] = None
    error: Optional[str] = None


# ── Input Range Validation ──
VALID_RANGES = {
    "temperature": (-50, 100),
    "humidity": (0, 100),
    "windSpeed": (0, 500),
    "rainfall": (0, 1000),
}


def validate_input(req: ProveRequest):
    for field, (min_val, max_val) in VALID_RANGES.items():
        val = getattr(req, field)
        if not isinstance(val, (int, float)) or val != val:  # NaN check
            raise HTTPException(status_code=400, detail=f"Invalid {field}: must be a number")
        if val < min_val or val > max_val:
            raise HTTPException(status_code=400, detail=f"{field} out of range [{min_val}, {max_val}]")


# ── Task TTL Eviction ──
async def cleanup_tasks():
    while True:
        await asyncio.sleep(60)  # Check every minute
        now = time.time()
        expired = [tid for tid, t in tasks.items()
                   if t.get("created_at", 0) < now - TASK_TTL_SECONDS
                   and t["status"] in ("completed", "failed")]
        for tid in expired:
            del tasks[tid]


# ── Normalization ──
_norm_params = None


def get_norm_params():
    global _norm_params
    if _norm_params is None:
        with open(os.path.join(ZKML_DIR, "norm_params.json")) as f:
            _norm_params = json.load(f)
    return _norm_params


def normalize(raw: list[float]) -> list[float]:
    params = get_norm_params()
    return [
        (v - params["min"][i]) / (params["max"][i] - params["min"][i] + 1e-8)
        for i, v in enumerate(raw)
    ]


def le_hex_to_int(le_hex: str) -> int:
    """Convert EZKL little-endian hex instance to big-endian integer."""
    clean = le_hex.removeprefix("0x").removeprefix("0X")
    return int.from_bytes(bytes.fromhex(clean), "little")


def extract_decision(instances: list[str]) -> str:
    """Extract decision using BN254 signed comparison."""
    if len(instances) < 6:
        return "NORMAL"
    out0 = le_hex_to_int(instances[4])
    out1 = le_hex_to_int(instances[5])
    out0_signed = out0 - BN254_P if out0 > HALF_P else out0
    out1_signed = out1 - BN254_P if out1 > HALF_P else out1
    return "CLAIM" if out1_signed > out0_signed else "NORMAL"


# ── Endpoints ──
@app.get("/health")
async def health():
    ezkl_available = False
    try:
        import ezkl  # noqa: F401
        ezkl_available = True
    except ImportError:
        pass

    return {
        "status": "ok",
        "ezkl_available": ezkl_available,
        "zkml_dir": ZKML_DIR,
        "artifacts_exist": os.path.isdir(ARTIFACTS_DIR),
        "active_tasks": sum(1 for t in tasks.values() if t["status"] == "running"),
        "max_concurrent": MAX_CONCURRENT_TASKS,
    }


@app.post("/prove", response_model=TaskResponse, dependencies=[Depends(verify_api_key)])
async def create_prove_task(req: ProveRequest):
    validate_input(req)

    if len(tasks) >= MAX_TASKS:
        raise HTTPException(status_code=429, detail="Too many tasks")

    if USE_CELERY:
        from worker import prove_inference
        result = prove_inference.delay(
            req.temperature, req.humidity, req.windSpeed, req.rainfall
        )
        tasks[result.id] = {"status": "pending", "result": None, "error": None, "celery_id": result.id, "created_at": time.time()}
        return TaskResponse(task_id=result.id, status="pending")
    else:
        task_id = str(uuid.uuid4())
        tasks[task_id] = {"status": "pending", "result": None, "error": None, "created_at": time.time()}
        asyncio.create_task(_run_prove(task_id, req))
        return TaskResponse(task_id=task_id, status="pending")


@app.get("/prove/{task_id}", response_model=TaskResponse)
async def get_prove_status(task_id: str):
    if USE_CELERY:
        from celery.result import AsyncResult
        result = AsyncResult(task_id)
        if result.state == "PENDING":
            return TaskResponse(task_id=task_id, status="pending")
        elif result.state == "PROVING":
            meta = result.info or {}
            return TaskResponse(task_id=task_id, status="running", result=meta)
        elif result.state == "SUCCESS":
            return TaskResponse(task_id=task_id, status="completed", result=result.result)
        elif result.state == "FAILURE":
            return TaskResponse(task_id=task_id, status="failed", error=str(result.result))
        else:
            return TaskResponse(task_id=task_id, status="running")
    else:
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="Task not found")
        t = tasks[task_id]
        return TaskResponse(task_id=task_id, **t)


# ── Background Worker ──
async def _run_prove(task_id: str, req: ProveRequest):
    """Run EZKL prove pipeline in isolated session directory."""
    async with semaphore:
        tasks[task_id]["status"] = "running"

        session_dir = os.path.join(ARTIFACTS_DIR, f"session-{task_id}")
        os.makedirs(session_dir, exist_ok=True)

        try:
            normalized = normalize(
                [req.temperature, req.humidity, req.windSpeed, req.rainfall]
            )

            # Write input
            input_path = os.path.join(session_dir, "input.json")
            with open(input_path, "w") as f:
                json.dump({"input_data": [normalized]}, f)

            witness_path = os.path.join(session_dir, "witness.json")
            proof_path = os.path.join(session_dir, "proof.json")

            import ezkl

            # gen_witness
            compiled_path = os.path.join(ARTIFACTS_DIR, "model.compiled")
            res = ezkl.gen_witness(input_path, compiled_path, witness_path)
            if hasattr(res, "__await__"):
                res = await res
            elif asyncio.isfuture(res):
                res = await res

            # prove
            pk_path = os.path.join(ARTIFACTS_DIR, "pk.key")
            srs_path = os.path.join(ARTIFACTS_DIR, "kzg.srs")
            res = ezkl.prove(
                witness_path, compiled_path, pk_path,
                proof_path=proof_path, srs_path=srs_path,
            )
            if hasattr(res, "__await__"):
                res = await res
            elif asyncio.isfuture(res):
                res = await res
            if not res:
                raise RuntimeError("EZKL prove returned False")

            # verify locally
            settings_path = os.path.join(ARTIFACTS_DIR, "settings.json")
            vk_path = os.path.join(ARTIFACTS_DIR, "vk.key")
            res = ezkl.verify(
                proof_path, settings_path, vk_path,
                srs_path=srs_path, reduced_srs=False,
            )
            if hasattr(res, "__await__"):
                res = await res
            elif asyncio.isfuture(res):
                res = await res
            if not res:
                raise RuntimeError("EZKL verify returned False")

            # Read proof output
            with open(proof_path) as f:
                proof_data = json.load(f)

            instances = proof_data.get("instances", [[]])[0]
            hex_proof = proof_data.get("hex_proof", "")
            decision = extract_decision(instances)

            proof_hash = "0x" + hashlib.sha256(
                hex_proof.encode()
            ).hexdigest()[:64]

            tasks[task_id] = {
                "status": "completed",
                "result": {
                    "decision": decision,
                    "hexProof": hex_proof,
                    "publicInstances": instances,
                    "proofSize": len(hex_proof),
                    "proofHash": proof_hash,
                    "input": {
                        "temperature": req.temperature,
                        "humidity": req.humidity,
                        "windSpeed": req.windSpeed,
                        "rainfall": req.rainfall,
                    },
                    "normalized": normalized,
                },
                "error": None,
                "created_at": time.time(),
            }

        except Exception as e:
            tasks[task_id] = {
                "status": "failed",
                "result": None,
                "error": str(e),
                "created_at": time.time(),
            }

        finally:
            shutil.rmtree(session_dir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
