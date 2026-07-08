#!/bin/bash

# ========================================
# Instala o Auto Deploy como serviço systemd
# Rodar UMA vez no servidor, como o usuário que faz deploy:
#   bash scripts/install-auto-deploy.sh
# ========================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step()    { echo -e "${GREEN}▶ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }

if ! command -v systemctl >/dev/null 2>&1; then
    print_error "systemd não encontrado. Este instalador é para o servidor (Ubuntu), não para a máquina local."
    exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="$(whoami)"
SERVICE_NAME="auto-deploy"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ ! -f "$REPO_DIR/deploy.sh" ]; then
    print_error "deploy.sh não encontrado em $REPO_DIR. Execute a partir do repositório."
    exit 1
fi

# node/npm/pm2 geralmente vêm do NVM, que o systemd não conhece.
# Detecta os binários do usuário atual e fixa o PATH no serviço.
if ! command -v node >/dev/null 2>&1 || ! command -v pm2 >/dev/null 2>&1; then
    print_error "node e/ou pm2 não encontrados no PATH deste usuário. Instale-os antes (ver DEPLOY.md)."
    exit 1
fi
NODE_BIN="$(dirname "$(command -v node)")"
PM2_BIN="$(dirname "$(command -v pm2)")"
SERVICE_PATH="$NODE_BIN:$PM2_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

print_step "Instalando serviço $SERVICE_NAME"
echo "  Repositório: $REPO_DIR"
echo "  Usuário:     $RUN_USER"
echo "  Node:        $NODE_BIN"
echo ""

sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Auto deploy projeto-indicadores (verifica novos commits a cada 20s)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_DIR
Environment=PATH=$SERVICE_PATH
Environment=HOME=$HOME
ExecStart=/bin/bash $REPO_DIR/scripts/auto-deploy.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=auto-deploy

[Install]
WantedBy=multi-user.target
EOF

chmod +x "$REPO_DIR/scripts/auto-deploy.sh" "$REPO_DIR/deploy.sh"

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo ""
print_step "Serviço instalado e iniciado!"

# deploy.sh usa sudo (nginx, mount, apt). O serviço roda sem terminal,
# então o usuário precisa de sudo sem senha.
if ! sudo -n true 2>/dev/null; then
    print_warning "O usuário $RUN_USER pede senha no sudo. O deploy vai travar dentro do serviço."
    print_warning "Configure sudo sem senha:"
    echo "  echo \"$RUN_USER ALL=(ALL) NOPASSWD:ALL\" | sudo tee /etc/sudoers.d/$RUN_USER"
fi

echo ""
echo "Comandos úteis:"
echo "  sudo systemctl status auto-deploy      - Ver status"
echo "  sudo journalctl -u auto-deploy -f      - Acompanhar logs em tempo real"
echo "  sudo systemctl restart auto-deploy     - Reiniciar o watcher"
echo "  sudo systemctl disable --now auto-deploy - Desativar"
