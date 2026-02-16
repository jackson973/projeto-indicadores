#!/bin/bash

# ========================================
# Script de Setup Inicial do Servidor
# Execute este script NO SERVIDOR após login SSH
# ========================================

set -e

echo "🔧 Configuração Inicial do Servidor VPS"
echo "========================================"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Verificar se é Ubuntu
if [ ! -f /etc/os-release ] || ! grep -q "Ubuntu" /etc/os-release; then
    print_warning "Este script foi testado apenas no Ubuntu 22.04"
    read -p "Continuar mesmo assim? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 1. Atualizar sistema
print_step "Atualizando sistema..."
sudo apt update && sudo apt upgrade -y

# 2. Instalar dependências básicas
print_step "Instalando dependências básicas..."
sudo apt install -y curl wget git build-essential

# 3. Instalar Node.js via NVM
print_step "Instalando Node.js..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    nvm alias default 20
else
    echo "NVM já instalado"
fi

# 4. Instalar PostgreSQL
print_step "Instalando PostgreSQL..."
if ! command -v psql &> /dev/null; then
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
else
    echo "PostgreSQL já instalado"
fi

# 5. Instalar Nginx
print_step "Instalando Nginx..."
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
else
    echo "Nginx já instalado"
fi

# 6. Instalar PM2
print_step "Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 startup | tail -n 1 | bash
else
    echo "PM2 já instalado"
fi

# 7. Configurar Firewall
print_step "Configurando Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# 8. Criar estrutura de diretórios
print_step "Criando estrutura de diretórios..."
mkdir -p ~/projeto-indicadores
mkdir -p ~/backups

echo ""
echo -e "${GREEN}✅ Setup inicial concluído!${NC}"
echo ""
echo "Próximos passos:"
echo "1. Configurar PostgreSQL:"
echo "   sudo -u postgres psql"
echo "   CREATE USER indicadores_user WITH PASSWORD 'sua_senha';"
echo "   CREATE DATABASE indicadores OWNER indicadores_user;"
echo "   GRANT ALL PRIVILEGES ON DATABASE indicadores TO indicadores_user;"
echo "   \\q"
echo ""
echo "2. Clonar repositório:"
echo "   cd ~/projeto-indicadores"
echo "   git clone https://github.com/jackson973/projeto-indicadores.git ."
echo ""
echo "3. Seguir o guia DEPLOY.md"
echo ""
