"""
ZK-Claw EZKL Optimization Script

Benchmarks different logrows settings to find the optimal trade-off between:
- Proof generation speed
- Proof size
- On-chain verification gas cost

Current baseline: logrows=15, scale=13, num_rows=1936

Usage:
    python optimize.py [--target-logrows 12,13,14] [--dry-run]
"""

import argparse
import asyncio
import json
import os
import shutil
import sys
import time
from pathlib import Path

# Paths
ZKML_DIR = Path(__file__).parent
ARTIFACTS_DIR = ZKML_DIR / "artifacts"
MODEL_PATH = ZKML_DIR / "model.onnx"
CALIBRATION_INPUT = ZKML_DIR / "input.json"
NORM_PARAMS = ZKML_DIR / "norm_params.json"
SETTINGS_PATH = ARTIFACTS_DIR / "settings.json"
BACKUP_DIR = ZKML_DIR / "artifacts_backup"


def load_current_settings():
    """Load and display current EZKL settings."""
    with open(SETTINGS_PATH) as f:
        settings = json.load(f)

    run_args = settings.get("run_args", {})
    print("=== Current EZKL Settings ===")
    print(f"  logrows:        {run_args.get('logrows', 'N/A')}")
    print(f"  input_scale:    {run_args.get('input_scale', 'N/A')}")
    print(f"  param_scale:    {run_args.get('param_scale', 'N/A')}")
    print(f"  num_inner_cols: {run_args.get('num_inner_cols', 'N/A')}")
    print(f"  num_rows:       {settings.get('num_rows', 'N/A')}")
    print(f"  total_assign:   {settings.get('total_assignments', 'N/A')}")
    print(f"  version:        {settings.get('version', 'N/A')}")
    print()

    # Calculate theoretical minimum logrows
    num_rows = settings.get("num_rows", 0)
    min_logrows = 1
    while (1 << min_logrows) < num_rows:
        min_logrows += 1
    # Need some headroom for blinding factors
    min_logrows = max(min_logrows, 10)
    print(f"  Rows used:      {num_rows} / {1 << run_args.get('logrows', 15)} ({num_rows * 100 / (1 << run_args.get('logrows', 15)):.1f}% utilization)")
    print(f"  Theoretical min logrows: {min_logrows} (2^{min_logrows} = {1 << min_logrows})")
    print(f"  Potential speedup: ~{(1 << run_args.get('logrows', 15)) / (1 << min_logrows):.1f}x")
    print()

    return settings, min_logrows


async def benchmark_logrows(target_logrows: int, dry_run: bool = False):
    """Re-calibrate and benchmark with specified logrows."""
    print(f"\n--- Benchmarking logrows={target_logrows} ---")

    if dry_run:
        print("  [DRY RUN] Would re-calibrate with these settings")
        return None

    try:
        import ezkl
    except ImportError:
        print("  ERROR: ezkl not installed. Run: pip install ezkl")
        return None

    bench_dir = ZKML_DIR / f"bench_logrows_{target_logrows}"
    bench_dir.mkdir(exist_ok=True)

    try:
        model_compiled = str(bench_dir / "model.compiled")
        settings_path = str(bench_dir / "settings.json")
        pk_path = str(bench_dir / "pk.key")
        vk_path = str(bench_dir / "vk.key")
        srs_path = str(ARTIFACTS_DIR / "kzg.srs")
        witness_path = str(bench_dir / "witness.json")
        proof_path = str(bench_dir / "proof.json")

        # 1. gen_settings
        print(f"  [1/5] Generating settings...")
        t0 = time.time()
        res = ezkl.gen_settings(
            str(MODEL_PATH),
            settings_path,
        )
        if hasattr(res, "__await__"):
            res = await res

        # Override logrows
        with open(settings_path) as f:
            s = json.load(f)
        s["run_args"]["logrows"] = target_logrows
        with open(settings_path, "w") as f:
            json.dump(s, f)
        print(f"       Done ({time.time() - t0:.1f}s)")

        # 2. compile_circuit
        print(f"  [2/5] Compiling circuit...")
        t0 = time.time()
        res = ezkl.compile_circuit(
            str(MODEL_PATH),
            model_compiled,
            settings_path,
        )
        if hasattr(res, "__await__"):
            res = await res
        print(f"       Done ({time.time() - t0:.1f}s)")

        # 3. setup (gen pk/vk)
        print(f"  [3/5] Generating keys...")
        t0 = time.time()
        res = ezkl.setup(
            model_compiled,
            vk_path,
            pk_path,
            srs_path,
        )
        if hasattr(res, "__await__"):
            res = await res
        print(f"       Done ({time.time() - t0:.1f}s)")

        # 4. gen_witness + prove
        print(f"  [4/5] Generating witness & proof...")
        t0 = time.time()
        res = ezkl.gen_witness(
            str(CALIBRATION_INPUT),
            model_compiled,
            witness_path,
        )
        if hasattr(res, "__await__"):
            res = await res

        prove_start = time.time()
        res = ezkl.prove(
            witness_path, model_compiled, pk_path,
            proof_path=proof_path, srs_path=srs_path,
        )
        prove_time = time.time() - prove_start
        if not res:
            print(f"       PROVE FAILED!")
            return None
        total_time = time.time() - t0
        print(f"       Done ({total_time:.1f}s, prove={prove_time:.1f}s)")

        # 5. verify
        print(f"  [5/5] Verifying...")
        t0 = time.time()
        res = ezkl.verify(
            proof_path, settings_path, vk_path,
            srs_path=srs_path, reduced_srs=False,
        )
        verify_time = time.time() - t0
        if not res:
            print(f"       VERIFY FAILED!")
            return None
        print(f"       Done ({verify_time:.1f}s)")

        # Read proof size
        proof_size = os.path.getsize(proof_path)

        result = {
            "logrows": target_logrows,
            "prove_time_s": round(prove_time, 2),
            "verify_time_s": round(verify_time, 2),
            "proof_size_bytes": proof_size,
            "success": True,
        }

        print(f"\n  Result: prove={prove_time:.1f}s, verify={verify_time:.1f}s, proof={proof_size} bytes")
        return result

    except Exception as e:
        print(f"  ERROR: {e}")
        return {"logrows": target_logrows, "success": False, "error": str(e)}

    finally:
        shutil.rmtree(bench_dir, ignore_errors=True)


async def main():
    parser = argparse.ArgumentParser(description="EZKL optimization benchmark")
    parser.add_argument(
        "--target-logrows",
        type=str,
        default="12,13,14",
        help="Comma-separated logrows values to benchmark (default: 12,13,14)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only show current settings and theoretical analysis",
    )
    args = parser.parse_args()

    # Show current settings
    settings, min_logrows = load_current_settings()

    target_values = [int(x.strip()) for x in args.target_logrows.split(",")]

    if args.dry_run:
        print("=== Optimization Analysis (Dry Run) ===")
        current_logrows = settings.get("run_args", {}).get("logrows", 15)
        for lr in target_values:
            speedup = (1 << current_logrows) / (1 << lr)
            feasible = lr >= min_logrows
            status = "FEASIBLE" if feasible else "TOO SMALL (will fail)"
            print(f"  logrows={lr}: ~{speedup:.1f}x speedup -- {status}")
        print()
        print("Run without --dry-run to actually benchmark.")
        return

    # Run benchmarks
    print("=== Running Benchmarks ===")
    results = []
    for lr in target_values:
        if lr < min_logrows:
            print(f"\n  Skipping logrows={lr} (below minimum {min_logrows})")
            continue
        result = await benchmark_logrows(lr, dry_run=args.dry_run)
        if result:
            results.append(result)

    # Summary
    if results:
        print("\n=== Benchmark Summary ===")
        print(f"{'logrows':>8} | {'prove (s)':>10} | {'verify (s)':>11} | {'proof (B)':>10} | {'status':>8}")
        print("-" * 60)
        for r in results:
            if r["success"]:
                print(f"{r['logrows']:>8} | {r['prove_time_s']:>10.2f} | {r['verify_time_s']:>11.2f} | {r['proof_size_bytes']:>10} | {'OK':>8}")
            else:
                print(f"{r['logrows']:>8} | {'--':>10} | {'--':>11} | {'--':>10} | {'FAIL':>8}")

        # Recommend best
        successes = [r for r in results if r["success"]]
        if successes:
            best = min(successes, key=lambda x: x["prove_time_s"])
            print(f"\nRecommendation: logrows={best['logrows']} (prove={best['prove_time_s']}s)")
            print(f"To apply: update artifacts/settings.json and re-run the full EZKL pipeline.")


if __name__ == "__main__":
    asyncio.run(main())
