# 🚀 Guia de Deploy - Servidor Contabo

Este guia cobre o deploy completo do projeto-indicadores em um servidor VPS Contabo.

## 📋 Pré-requisitos

- Servidor VPS na Contabo (Ubuntu 22.04 LTS recomendado)
- Domínio configurado apontando para o IP do servidor (opcional, mas recomendado)
- Acesso SSH ao servidor
- Git instalado localmente

---

## 🔧 Parte 1: Configuração Inicial do Servidor

### 1.1 Conectar ao Servidor

```bash
ssh root@SEU_IP_CONTABO
```

### 1.2 Atualizar Sistema

```bash
apt update && apt upgrade -y
```

### 1.3 Criar Usuário para a Aplicação

```bash
# Criar usuário
adduser deploy

# Adicionar ao grupo sudo
usermod -aG sudo deploy

# Permitir sudo sem senha (opcional)
echo "deploy ALL=(ALL) NOPASSWD:ALL" | tee /etc/sudoers.d/deploy
```

### 1.4 Configurar SSH para o Usuário Deploy

```bash
# Copiar chaves SSH do root para deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Testar conexão (em outro terminal)
ssh deploy@SEU_IP_CONTABO
```

---

## 📦 Parte 2: Instalar Dependências

### 2.1 Instalar Node.js (v20 LTS)

```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recarregar profile
source ~/.bashrc

# Instalar Node.js
nvm install 20
nvm use 20
nvm alias default 20

# Verificar
node -v
npm -v
```

### 2.2 Instalar PostgreSQL

```bash
# Instalar PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Iniciar serviço
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verificar status
sudo systemctl status postgresql
```

### 2.3 Instalar Nginx

```bash
sudo apt install -y nginx

# Iniciar e habilitar
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2.4 Instalar PM2

```bash
npm install -g pm2

# Configurar PM2 para iniciar no boot
pm2 startup
# Copie e execute o comando que aparecer
```

### 2.5 Instalar Git

```bash
sudo apt install -y git
```

---

## 🗄️ Parte 3: Configurar Banco de Dados

### 3.1 Criar Usuário e Database

```bash
# Entrar no PostgreSQL
sudo -u postgres psql

# Executar comandos SQL:
CREATE USER indicadores_user WITH PASSWORD 'SUA_SENHA_SUPER_SEGURA';
CREATE DATABASE indicadores OWNER indicadores_user;
GRANT ALL PRIVILEGES ON DATABASE indicadores TO indicadores_user;
\q
```

### 3.2 Configurar Acesso Remoto (opcional)

```bash
# Editar pg_hba.conf
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Adicionar linha (substitua SEU_IP_LOCAL pelo seu IP):
# host    all             all             SEU_IP_LOCAL/32         md5

# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

---

## 📁 Parte 4: Deploy da Aplicação

### 4.1 Clonar Repositório

```bash
cd ~
git clone https://github.com/jackson973/projeto-indicadores.git
cd projeto-indicadores
```

### 4.2 Configurar Variáveis de Ambiente

```bash
# Criar arquivo .env no servidor
nano apps/server/.env
```

Conteúdo do `.env`:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=indicadores
DB_USER=indicadores_user
DB_PASSWORD=SUA_SENHA_SUPER_SEGURA

# JWT
JWT_SECRET=SUA_CHAVE_JWT_SUPER_SECRETA_AQUI_PELO_MENOS_32_CARACTERES

# Server
PORT=4000
NODE_ENV=production

# App
APP_URL=https://seudominio.com

# Email (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seuemail@gmail.com
SMTP_PASS=sua_senha_de_app_gmail
SMTP_FROM=Sistema Indicadores <seuemail@gmail.com>
```

**IMPORTANTE**: Gere uma senha de app do Gmail em: https://myaccount.google.com/apppasswords

### 4.3 Configurar Variáveis do Cliente

```bash
# Criar arquivo .env no cliente
nano apps/client/.env.production
```

Conteúdo:
```env
VITE_API_URL=https://api.seudominio.com
# ou se usar o mesmo domínio:
# VITE_API_URL=https://seudominio.com/api
```

### 4.4 Instalar Dependências e Build

```bash
# Instalar dependências
npm install

# Build do cliente
npm run build -w apps/client

# Instalar dependências de produção do servidor
cd apps/server
npm install --production
cd ../..
```

### 4.5 Executar Migrations

```bash
# Conectar ao banco e executar migrations manualmente
PGPASSWORD=SUA_SENHA_SUPER_SEGURA psql -h localhost -U indicadores_user -d indicadores -f apps/server/src/db/migrations/001_initial_schema.sql
```

---

## 🔄 Parte 5: Configurar PM2

### 5.1 Iniciar Aplicação com PM2

```bash
# Usar o arquivo ecosystem.config.js fornecido
pm2 start ecosystem.config.js

# Salvar configuração
pm2 save

# Ver logs
pm2 logs

# Ver status
pm2 status
```

---

## 🌐 Parte 6: Configurar Nginx

### 6.1 Criar Configuração do Nginx

```bash
sudo nano /etc/nginx/sites-available/indicadores
```

Use o conteúdo do arquivo `nginx.conf` fornecido (substitua `seudominio.com` pelo seu domínio).

### 6.2 Ativar Site

```bash
# Criar symlink
sudo ln -s /etc/nginx/sites-available/indicadores /etc/nginx/sites-enabled/

# Remover site padrão
sudo rm /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

---

## 🔒 Parte 7: Configurar SSL/HTTPS (Let's Encrypt)

### 7.1 Instalar Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 7.2 Obter Certificado

```bash
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

Siga as instruções interativas.

### 7.3 Renovação Automática

```bash
# Testar renovação
sudo certbot renew --dry-run

# Já está configurado automaticamente via cron
```

---

## 🔥 Parte 8: Configurar Firewall

```bash
# Habilitar UFW
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Verificar status
sudo ufw status
```

---

## ✅ Parte 9: Verificação Final

### 9.1 Verificar Serviços

```bash
# PostgreSQL
sudo systemctl status postgresql

# Nginx
sudo systemctl status nginx

# PM2
pm2 status

# Logs da aplicação
pm2 logs api
```

### 9.2 Testar Aplicação

```bash
# API Health check
curl http://localhost:4000/health

# Frontend
curl -I http://localhost
```

Acesse no navegador: `https://seudominio.com`

---

## 🔄 Parte 10: Atualizações Futuras

### Script de Deploy Automático

Use o script `deploy.sh` fornecido:

```bash
# No servidor
cd ~/projeto-indicadores
./deploy.sh
```

Ou manualmente:

```bash
cd ~/projeto-indicadores

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build client
npm run build -w apps/client

# Install server production deps
cd apps/server
npm install --production
cd ../..

# Restart PM2
pm2 restart api
```

---

## 📊 Comandos Úteis

### PM2
```bash
pm2 status                 # Ver status
pm2 logs api              # Ver logs do servidor
pm2 restart api           # Reiniciar servidor
pm2 stop api              # Parar servidor
pm2 delete api            # Remover do PM2
pm2 monit                 # Monitoramento em tempo real
```

### PostgreSQL
```bash
# Backup
pg_dump -U indicadores_user indicadores > backup.sql

# Restore
psql -U indicadores_user indicadores < backup.sql

# Conectar ao banco
psql -U indicadores_user -d indicadores
```

### Nginx
```bash
sudo nginx -t                    # Testar configuração
sudo systemctl restart nginx     # Reiniciar
sudo systemctl status nginx      # Ver status
sudo tail -f /var/log/nginx/error.log  # Ver erros
```

### Logs
```bash
# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Logs do PM2
pm2 logs

# Logs do Sistema
journalctl -u nginx -f
```

---

## 🐛 Troubleshooting

### API não inicia
```bash
# Verificar logs
pm2 logs api

# Verificar variáveis de ambiente
cat apps/server/.env

# Testar conexão com banco
psql -U indicadores_user -d indicadores -c "SELECT 1;"
```

### Frontend com erro 502
```bash
# Verificar se PM2 está rodando
pm2 status

# Verificar porta 4000
sudo netstat -tulpn | grep 4000

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/error.log
```

### Emails não funcionam
```bash
# Testar SMTP manualmente
telnet smtp.gmail.com 587

# Verificar credenciais no .env
cat apps/server/.env | grep SMTP

# Ver logs do servidor
pm2 logs api | grep -i email
```

---

## 🎯 Checklist de Deploy

- [ ] Servidor atualizado
- [ ] Usuário deploy criado
- [ ] Node.js instalado
- [ ] PostgreSQL instalado e configurado
- [ ] Nginx instalado
- [ ] PM2 instalado
- [ ] Repositório clonado
- [ ] Variáveis de ambiente configuradas
- [ ] Dependencies instaladas
- [ ] Build do frontend gerado
- [ ] Migrations executadas
- [ ] PM2 configurado e rodando
- [ ] Nginx configurado
- [ ] SSL/HTTPS configurado
- [ ] Firewall configurado
- [ ] Testes realizados
- [ ] Domínio apontando corretamente

---

## 📞 Suporte

Em caso de dúvidas:
1. Verificar logs: `pm2 logs api`
2. Verificar status dos serviços
3. Consultar documentação oficial do Nginx/PM2/PostgreSQL

---

**Última atualização**: 2026-02-15
