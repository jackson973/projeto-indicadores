# ⚡ Quick Start - Deploy Rápido

Guia resumido para deploy rápido no servidor Contabo.

## 🎯 Resumo Ultra Rápido

### No seu computador local:

```bash
# 1. Commit e push das configurações de deploy
git add .
git commit -m "Add deploy configuration"
git push origin main
```

### No servidor Contabo:

```bash
# 1. Conectar
ssh root@SEU_IP_CONTABO

# 2. Criar usuário deploy (opcional mas recomendado)
adduser deploy
usermod -aG sudo deploy
su - deploy

# 3. Baixar e executar script de setup
cd ~
wget https://raw.githubusercontent.com/jackson973/projeto-indicadores/main/server-setup.sh
chmod +x server-setup.sh
./server-setup.sh

# 4. Configurar PostgreSQL
sudo -u postgres psql
```

**No PostgreSQL:**
```sql
CREATE USER indicadores_user WITH PASSWORD 'SUA_SENHA_SEGURA';
CREATE DATABASE indicadores OWNER indicadores_user;
GRANT ALL PRIVILEGES ON DATABASE indicadores TO indicadores_user;
\q
```

**Continuar:**
```bash
# 5. Clonar repositório
cd ~
git clone https://github.com/jackson973/projeto-indicadores.git
cd projeto-indicadores

# 6. Configurar variáveis de ambiente
nano apps/server/.env
# Cole as variáveis do .env.production.example e ajuste

nano apps/client/.env.production
# VITE_API_URL=https://seudominio.com

# 7. Instalar e build
npm install
npm run build -w apps/client

# 8. Executar migrations
cd apps/server/src/db/migrations
PGPASSWORD=SUA_SENHA psql -h localhost -U indicadores_user -d indicadores -f 001_initial_schema.sql
cd ~/projeto-indicadores

# 9. Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save

# 10. Configurar Nginx
sudo cp nginx.conf /etc/nginx/sites-available/indicadores
# Editar e substituir "seudominio.com" pelo seu domínio (ou usar a versão sem domínio)
sudo nano /etc/nginx/sites-available/indicadores

sudo ln -s /etc/nginx/sites-available/indicadores /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 11. (Opcional) Configurar SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com
```

## ✅ Verificar

```bash
# Status dos serviços
sudo systemctl status postgresql
sudo systemctl status nginx
pm2 status

# Testar API
curl http://localhost:4000/health

# Ver logs
pm2 logs api
```

## 🔄 Deploys Futuros

```bash
cd ~/projeto-indicadores
./deploy.sh
```

## 📱 Acessar

- **Com domínio**: https://seudominio.com
- **Sem domínio**: http://SEU_IP_SERVIDOR

## 🆘 Problemas Comuns

### Erro 502 Bad Gateway
```bash
pm2 status  # Verificar se está rodando
pm2 logs api  # Ver erros
```

### API não conecta no banco
```bash
# Verificar .env
cat apps/server/.env

# Testar conexão
psql -U indicadores_user -d indicadores -h localhost
```

### Frontend não carrega
```bash
# Verificar build
ls -la apps/client/dist/

# Rebuild se necessário
npm run build -w apps/client
```

---

**Para guia completo, consulte:** [DEPLOY.md](./DEPLOY.md)
