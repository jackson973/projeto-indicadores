#!/bin/bash

# ========================================
# Backup do banco de dados PostgreSQL
# Gera um dump completo em formato custom
# ========================================

set -e

# Configurações (usa variáveis de ambiente ou defaults do docker-compose)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-indicadores}"
DB_USER="${DB_USER:-indicadores_user}"
CONTAINER_NAME="projeto-indicadores-db"

# Diretório de backups (relativo à raiz do projeto)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

# Nome do arquivo com timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/indicadores_${TIMESTAMP}.dump"
BACKUP_LATEST="$BACKUP_DIR/indicadores_latest.dump"

echo "📦 Iniciando backup do banco de dados..."
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"
echo ""

# Verificar se o container está rodando
if docker ps --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  # Backup via docker exec (mais confiável)
  docker exec "$CONTAINER_NAME" pg_dump \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -Fc \
    --no-owner \
    --no-privileges \
    > "$BACKUP_FILE"
else
  # Fallback: pg_dump direto (se PostgreSQL local)
  PGPASSWORD="${DB_PASSWORD:-indicadores_pass}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -Fc \
    --no-owner \
    --no-privileges \
    > "$BACKUP_FILE"
fi

# Criar symlink para o último backup
cp "$BACKUP_FILE" "$BACKUP_LATEST"

# Tamanho do backup
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✅ Backup concluído!"
echo "   Arquivo: $BACKUP_FILE"
echo "   Tamanho: $BACKUP_SIZE"
echo "   Latest:  $BACKUP_LATEST"
echo ""

# Limpar backups antigos (manter últimos 10)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/indicadores_2*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 10 ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - 10))
  echo "🧹 Removendo $REMOVE_COUNT backup(s) antigo(s)..."
  ls -1t "$BACKUP_DIR"/indicadores_2*.dump | tail -n "$REMOVE_COUNT" | xargs rm -f
fi
