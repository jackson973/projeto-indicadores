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

# 1. Atualizar código
# fetch + reset --hard em vez de pull: o npm install modifica o
# package-lock.json no servidor e bloqueia o merge do pull. O servidor é
# só destino de deploy — alterações locais em arquivos rastreados devem
# ser descartadas. Não afeta não-rastreados (.env, files/, backups).
print_step "Atualizando código..."
git fetch origin main
git reset --hard origin/main

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

# 6. Montar share de rede Sisplan (Notas Fiscais)
SISPLAN_SHARE="//192.168.7.2/Sisplan"
SISPLAN_MOUNT="/mnt/sisplan"
SMB_CREDENTIALS="/etc/smbcredentials"

if mountpoint -q "$SISPLAN_MOUNT" 2>/dev/null; then
    print_step "Share Sisplan já montado em $SISPLAN_MOUNT"
else
    print_step "Montando share Sisplan ($SISPLAN_SHARE -> $SISPLAN_MOUNT)..."

    # Verificar se cifs-utils está instalado
    if ! dpkg -s cifs-utils >/dev/null 2>&1; then
        print_step "Instalando cifs-utils..."
        sudo apt-get install -y cifs-utils
    fi

    # Verificar se o arquivo de credenciais existe
    if [ ! -f "$SMB_CREDENTIALS" ]; then
        print_error "Arquivo de credenciais não encontrado: $SMB_CREDENTIALS"
        print_warning "Crie o arquivo com:"
        echo "  sudo bash -c 'cat > $SMB_CREDENTIALS << EOF"
        echo "  username=SEU_USUARIO"
        echo "  password=SUA_SENHA"
        echo "  EOF'"
        echo "  sudo chmod 600 $SMB_CREDENTIALS"
        print_warning "Continuando deploy sem montar o share..."
    else
        # Criar ponto de montagem se não existir
        sudo mkdir -p "$SISPLAN_MOUNT"

        # Montar o share CIFS
        if sudo mount -t cifs "$SISPLAN_SHARE" "$SISPLAN_MOUNT" \
            -o credentials="$SMB_CREDENTIALS",iocharset=utf8,file_mode=0644,dir_mode=0755,vers=3.0; then
            print_step "Share montado com sucesso!"
        else
            print_warning "Falha ao montar share (continuando deploy...)"
        fi
    fi
fi

# 7. Backup do banco antes de reiniciar
print_step "Fazendo backup do banco de dados..."
bash scripts/backup-db.sh || print_warning "Backup falhou (continuando deploy...)"

# 8. Garantir que sw.js e index.html não sejam cacheados pelo Nginx
#    Verifica se as regras já existem na config (tuckkids já tem, basicomaiscriativo não)
#    Se não existir, insere antes da regra de cache de assets estáticos
#    NUNCA sobrescreve o arquivo — apenas injeta as linhas faltantes (preserva SSL/Certbot)
NGINX_SITE="/etc/nginx/sites-available/indicadores"
if grep -q 'location = /sw.js' "$NGINX_SITE" 2>/dev/null; then
    print_step "Regras de no-cache para PWA já configuradas no Nginx."
else
    print_step "Adicionando regras de no-cache para PWA no Nginx..."
    # Insere as regras de no-cache ANTES da linha "Static assets with caching"
    sudo sed -i '/# Static assets/i\
    # Service worker e index.html - sem cache (precisa atualizar sempre)\
    location = /sw.js {\
        expires off;\
        add_header Cache-Control "no-cache, no-store, must-revalidate";\
    }\
\
    # index.html - sem cache (precisa atualizar sempre)\
    location = /index.html {\
        expires off;\
        add_header Cache-Control "no-cache, no-store, must-revalidate";\
    }\
' "$NGINX_SITE"
    print_step "Regras de no-cache adicionadas ao Nginx."
fi
sudo nginx -t && sudo systemctl reload nginx || print_warning "Falha ao recarregar Nginx"

# 9. Migrations rodam automaticamente ao iniciar o servidor

# 10. Restart PM2 (startOrRestart religa mesmo se o app estiver errored/removido)
print_step "Reiniciando servidor API..."
pm2 startOrRestart ecosystem.config.js --only api
pm2 save || true

# 11. Verificar saúde da API (até 30s)
print_step "Verificando saúde da API..."
HEALTH_OK=""
for i in $(seq 1 15); do
    sleep 2
    if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
        HEALTH_OK=1
        break
    fi
done
if [ -n "$HEALTH_OK" ]; then
    print_step "API respondendo em /health ✓"
else
    print_error "API não respondeu ao /health em 30s — tentando religar (ver pm2 logs api)"
    pm2 restart api || true
fi
pm2 status

echo ""
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo ""
echo "Comandos úteis:"
echo "  pm2 logs api        - Ver logs"
echo "  pm2 monit           - Monitoramento"
echo "  pm2 restart api     - Reiniciar API"
echo ""
