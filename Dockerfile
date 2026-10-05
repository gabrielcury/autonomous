# =============================================================================
# AegisSRE Autonomous Agent - Production Multi-Stage Dockerfile
# =============================================================================

# --- Stage 1: Build React Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python Backend & Runtime ---
FROM python:3.11-slim

LABEL maintainer="AegisSRE Team"
LABEL description="Autonomous SRE & DevOps Architecture Agent for Easypanel + Docker"

WORKDIR /app

# Install system dependencies (curl for healthchecks, tar/gzip for backups)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tar \
    gzip \
    procps \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and scripts
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create storage directories
RUN mkdir -p /app/data /app/backups /app/iac_output

# Environment variables
ENV PORT=8000 \
    HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1 \
    DOCKER_SOCKET=unix:///var/run/docker.sock \
    DATA_DIR=/app/data \
    BACKUPS_DIR=/app/backups \
    IAC_OUTPUT_DIR=/app/iac_output

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/status || exit 1

# Start Uvicorn ASGI server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
