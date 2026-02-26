#!/bin/bash

# ========================================
# Dev script com backup/restore automático
# - Inicialização: restaura backup se banco vazio
# - Antes de rodar: faz backup do estado atual
# ========================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_LATEST="$PROJECT_DIR/backups/indicadores_latest.dump"

# Subir banco
docker-compose -f "$PROJECT_DIR/docker-compose.yml" up -d

# Aguardar banco ficar pronto
echo "⏳ Aguardando banco de dados..."
for i in $(seq 1 15); do
  if docker exec projeto-indicadores-db pg_isready -U indicadores_user -d indicadores >/dev/null 2>&1; then
    echo "✅ Banco de dados pronto."
    break
  fi
  sleep 1
done

# Verificar se o banco está vazio (sem tabela sales = banco novo/resetado)
TABLE_EXISTS=$(docker exec projeto-indicadores-db psql -U indicadores_user -d indicadores -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sales');" 2>/dev/null)

if [ "$TABLE_EXISTS" = "t" ]; then
  # Banco tem dados — fazer backup
  ROW_COUNT=$(docker exec projeto-indicadores-db psql -U indicadores_user -d indicadores -tAc "SELECT COUNT(*) FROM users;" 2>/dev/null)
  if [ "$ROW_COUNT" -gt "0" ] 2>/dev/null; then
    echo "📦 Banco com dados — fazendo backup..."
    bash "$SCRIPT_DIR/backup-db.sh" 2>/dev/null || true
  else
    # Tabela existe mas sem usuários = banco migrado mas vazio (pós down -v)
    if [ -f "$BACKUP_LATEST" ]; then
      echo "🔄 Banco vazio detectado — restaurando último backup..."
      bash "$SCRIPT_DIR/restore-db-auto.sh"
    fi
  fi
else
  # Banco totalmente novo — migrations vão rodar pelo servidor
  # Mas se houver backup, restaurar (inclui tudo: schema + dados)
  if [ -f "$BACKUP_LATEST" ]; then
    echo "🔄 Banco novo detectado — restaurando último backup..."
    bash "$SCRIPT_DIR/restore-db-auto.sh"
  fi
fi

# Função de cleanup ao sair (Ctrl+C)
cleanup() {
  echo ""
  echo "🛑 Encerrando servidores..."
  kill $DEV_PID 2>/dev/null
  wait $DEV_PID 2>/dev/null

  echo "📦 Fazendo backup antes de sair..."
  bash "$SCRIPT_DIR/backup-db.sh" 2>/dev/null || true

  echo "👋 Até mais!"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Iniciar dev servers em background
npx concurrently "npm run dev -w apps/server" "npm run dev -w apps/client" &
DEV_PID=$!

# Aguardar processo (trap só funciona durante wait)
wait $DEV_PID
