#!/bin/bash

# ========================================
# Restore do banco de dados PostgreSQL
# Restaura de um dump custom (.dump)
# ========================================

set -e

# Configurações
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-indicadores}"
DB_USER="${DB_USER:-indicadores_user}"
CONTAINER_NAME="projeto-indicadores-db"

# Diretório de backups
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"

# Arquivo de backup (argumento ou latest)
BACKUP_FILE="${1:-$BACKUP_DIR/indicadores_latest.dump}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Arquivo de backup não encontrado: $BACKUP_FILE"
  echo ""
  echo "Uso: $0 [caminho_do_arquivo.dump]"
  echo "  Sem argumento: usa o último backup (indicadores_latest.dump)"
  echo ""
  # Listar backups disponíveis
  if ls "$BACKUP_DIR"/indicadores_2*.dump 1>/dev/null 2>&1; then
    echo "Backups disponíveis:"
    ls -lht "$BACKUP_DIR"/indicadores_2*.dump | head -10 | while read -r line; do
      echo "  $line"
    done
  else
    echo "Nenhum backup encontrado em $BACKUP_DIR/"
  fi
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "🔄 Restaurando banco de dados..."
echo "   Arquivo: $BACKUP_FILE"
echo "   Tamanho: $BACKUP_SIZE"
echo "   Database: $DB_NAME"
echo ""

read -p "⚠️  Isso substituirá todos os dados atuais. Continuar? (s/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  echo "Cancelado."
  exit 0
fi

if docker ps --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  # Drop e recria o banco via docker exec
  echo "Recriando banco de dados..."
  docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
  " >/dev/null 2>&1 || true
  docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null
  docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null

  # Restore via docker exec
  echo "Restaurando dados..."
  docker exec -i "$CONTAINER_NAME" pg_restore \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-privileges \
    --single-transaction \
    < "$BACKUP_FILE"
else
  # Fallback: pg_restore direto
  echo "Recriando banco de dados..."
  PGPASSWORD="${DB_PASSWORD:-indicadores_pass}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  PGPASSWORD="${DB_PASSWORD:-indicadores_pass}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null
  PGPASSWORD="${DB_PASSWORD:-indicadores_pass}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null

  echo "Restaurando dados..."
  PGPASSWORD="${DB_PASSWORD:-indicadores_pass}" pg_restore \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner \
    --no-privileges \
    --single-transaction \
    "$BACKUP_FILE"
fi

echo ""
echo "✅ Restore concluído!"
echo "   Reinicie o servidor (pm2 restart api) para reconectar ao banco."
