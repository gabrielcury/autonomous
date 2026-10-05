#!/usr/bin/env bash
# =============================================================================
# AegisSRE - Automated Disaster Recovery Restoration Script
# =============================================================================
set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Uso: ./restore.sh <caminho_para_snapshot.tar.gz>"
    echo "Exemplo: ./restore.sh ../backups/snapshot_20261004_191459.tar.gz"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Arquivo de backup não encontrado: $BACKUP_FILE"
    exit 1
fi

echo "🚀 [AegisSRE] Iniciando restauração do snapshot: $BACKUP_FILE"

# 1. Create temporary directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "📦 Extraindo manifesto do snapshot..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

SNAPSHOT_DIR=$(ls "$TEMP_DIR" | head -n 1)
MANIFEST="$TEMP_DIR/$SNAPSHOT_DIR/manifest.json"

if [ -f "$MANIFEST" ]; then
    echo "📋 Manifesto validado com sucesso:"
    cat "$MANIFEST" | grep -E "(created_at|containers_count|note)" || true
else
    echo "⚠️ Aviso: manifest.json não encontrado no snapshot."
fi

# 2. Check Docker
if command -v docker &> /dev/null; then
    echo "🐳 Docker detectado no host."
else
    echo "❌ Docker não encontrado neste servidor. Instale o Docker CE antes de prosseguir."
    exit 1
fi

# 3. Restore Stack with Docker Compose or Terraform
if [ -f "docker-compose.yml" ]; then
    echo "🚢 Subindo containeres com Docker Compose..."
    docker compose up -d
elif [ -d "terraform" ]; then
    echo "🏗️ Aplicando plano Terraform..."
    cd terraform
    terraform init
    terraform apply -auto-approve
fi

echo "✅ [AegisSRE] Restauração e provisionamento concluídos com sucesso!"
docker ps
