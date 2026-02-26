#!/bin/bash

# ========================================
# Restore automático (sem confirmação)
# Usado pelo dev.sh para restaurar backup
# quando banco está vazio
# ========================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"

DB_NAME="${DB_NAME:-indicadores}"
DB_USER="${DB_USER:-indicadores_user}"
CONTAINER_NAME="projeto-indicadores-db"

BACKUP_FILE="${1:-$BACKUP_DIR/indicadores_latest.dump}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "⚠️  Nenhum backup encontrado para restaurar."
  exit 0
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "🔄 Restaurando banco automaticamente..."
echo "   Arquivo: $BACKUP_FILE"
echo "   Tamanho: $BACKUP_SIZE"

# Drop e recria o banco
echo "   Recriando banco de dados..."
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || true

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null 2>&1
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null 2>&1

# Restore
echo "   Restaurando dados..."
docker exec -i "$CONTAINER_NAME" pg_restore \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --single-transaction \
  < "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Restore automático concluído!"
else
  echo "⚠️  Restore concluído com avisos (alguns objetos podem já existir)."
fi
