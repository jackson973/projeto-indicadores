#!/bin/bash

# ========================================
# Script de Backup do Banco de Dados
# Execute no servidor
# ========================================

set -e

# Configurações
BACKUP_DIR="$HOME/backups"
DB_NAME="indicadores"
DB_USER="indicadores_user"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/indicadores_backup_$DATE.sql"
RETENTION_DAYS=7  # Manter backups dos últimos 7 dias

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}📦 Iniciando backup do banco de dados...${NC}"
echo ""

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

# Solicitar senha (ou use PGPASSWORD no ambiente)
if [ -z "$PGPASSWORD" ]; then
    echo -e "${YELLOW}Digite a senha do PostgreSQL:${NC}"
    read -s PGPASSWORD
    export PGPASSWORD
fi

# Fazer backup
echo "Criando backup..."
pg_dump -h localhost -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

# Comprimir backup
echo "Comprimindo backup..."
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Verificar tamanho
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✅ Backup criado com sucesso!${NC}"
echo "   Arquivo: $BACKUP_FILE"
echo "   Tamanho: $SIZE"
echo ""

# Limpar backups antigos
echo "Limpando backups antigos (mais de $RETENTION_DAYS dias)..."
find "$BACKUP_DIR" -name "indicadores_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo ""

# Listar backups disponíveis
echo "Backups disponíveis:"
ls -lh "$BACKUP_DIR"/indicadores_backup_*.sql.gz 2>/dev/null || echo "Nenhum backup encontrado"
echo ""

echo -e "${GREEN}✅ Processo concluído!${NC}"
echo ""
echo "Para restaurar um backup:"
echo "  gunzip -c $BACKUP_FILE | psql -U $DB_USER -d $DB_NAME"
