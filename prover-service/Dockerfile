FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for EZKL
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user
RUN useradd -m -s /bin/bash appuser

# Copy service code
COPY --chown=appuser:appuser main.py celery_app.py worker.py ./

# Copy ZKML artifacts (mounted as volume in production)
# COPY ../zkml /app/zkml

ENV ZKML_DIR=/app/zkml
ENV MAX_CONCURRENT_TASKS=4

EXPOSE 8080

USER appuser

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
