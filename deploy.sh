#!/bin/bash

# ========================================
# Script de Deploy Automático
# projeto-indicadores
# ========================================

set -e  # Exit on error

echo "🚀 Iniciando deploy..."
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para imprimir mensagens
print_step() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    print_error "Execute este script na raiz do projeto!"
    exit 1
fi

# 1. Git Pull
print_step "Atualizando código..."
git pull origin main

# 2. Instalar dependências
print_step "Instalando dependências..."
npm install

# 3. Build do frontend
print_step "Fazendo build do frontend..."
npm run build -w apps/client

# 4. Instalar dependências de produção do backend
print_step "Instalando dependências de produção do servidor..."
cd apps/server
npm install --production
cd ../..

# 5. Instalar dependências do Chrome/Puppeteer (se necessário)
if ! dpkg -s libgbm1 >/dev/null 2>&1; then
    print_step "Instalando dependências do Chrome/Puppeteer..."
    bash scripts/install-chrome-deps.sh
else
    print_step "Dependências do Chrome já instaladas."
fi

# 6. Backup do banco antes de reiniciar
print_step "Fazendo backup do banco de dados..."
bash scripts/backup-db.sh || print_warning "Backup falhou (continuando deploy...)"

# 7. Migrations rodam automaticamente ao iniciar o servidor

# 8. Restart PM2
print_step "Reiniciando servidor API..."
pm2 restart api

# 9. Verificar status
print_step "Verificando status..."
pm2 status

echo ""
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo ""
echo "Comandos úteis:"
echo "  pm2 logs api        - Ver logs"
echo "  pm2 monit           - Monitoramento"
echo "  pm2 restart api     - Reiniciar API"
echo ""
