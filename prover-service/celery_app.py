"""
ZK-Claw Celery Configuration

Broker: Redis
Backend: Redis
"""
import os
from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "zkclaw_prover",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max per proof
    task_soft_time_limit=240,  # soft limit at 4 minutes
    worker_prefetch_multiplier=1,  # one task at a time per worker
    worker_concurrency=2,
)
