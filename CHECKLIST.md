# ✅ Checklist de Deploy - Servidor Contabo

Use este checklist para acompanhar o processo de deploy passo a passo.

## 📋 Pré-Deploy (Local)

- [ ] Código testado localmente e funcionando
- [ ] Variáveis de ambiente documentadas
- [ ] Build do frontend testado: `npm run build -w apps/client`
- [ ] Código commitado e enviado para GitHub
- [ ] Revisar configurações em `.env.production.example`

## 🖥️ Servidor - Setup Inicial

### Acesso e Configuração Básica
- [ ] Acessar servidor via SSH: `ssh root@SEU_IP`
- [ ] Atualizar sistema: `apt update && apt upgrade -y`
- [ ] Criar usuário deploy (opcional): `adduser deploy`
- [ ] Adicionar ao sudo: `usermod -aG sudo deploy`
- [ ] Configurar SSH para usuário deploy

### Instalação de Software
- [ ] Node.js instalado (v20 LTS)
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  source ~/.bashrc
  nvm install 20
  ```
- [ ] PostgreSQL instalado
  ```bash
  sudo apt install -y postgresql postgresql-contrib
  ```
- [ ] Nginx instalado
  ```bash
  sudo apt install -y nginx
  ```
- [ ] PM2 instalado
  ```bash
  npm install -g pm2
  pm2 startup
  ```
- [ ] Git instalado
  ```bash
  sudo apt install -y git
  ```

## 🗄️ Banco de Dados

- [ ] PostgreSQL rodando: `sudo systemctl status postgresql`
- [ ] Usuário do banco criado
  ```sql
  CREATE USER indicadores_user WITH PASSWORD 'SUA_SENHA';
  ```
- [ ] Database criada
  ```sql
  CREATE DATABASE indicadores OWNER indicadores_user;
  ```
- [ ] Permissões concedidas
  ```sql
  GRANT ALL PRIVILEGES ON DATABASE indicadores TO indicadores_user;
  ```
- [ ] Testar conexão
  ```bash
  psql -U indicadores_user -d indicadores -h localhost
  ```

## 📦 Aplicação

### Código
- [ ] Repositório clonado
  ```bash
  git clone https://github.com/jackson973/projeto-indicadores.git
  ```
- [ ] Dentro do diretório: `cd projeto-indicadores`

### Configuração Backend
- [ ] Arquivo `.env` criado em `apps/server/`
- [ ] `DB_HOST` configurado (localhost)
- [ ] `DB_PORT` configurado (5432)
- [ ] `DB_NAME` configurado (indicadores)
- [ ] `DB_USER` configurado
- [ ] `DB_PASSWORD` configurado
- [ ] `JWT_SECRET` gerado e configurado
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] `PORT` configurado (4000)
- [ ] `NODE_ENV` = production
- [ ] `APP_URL` configurado (seu domínio ou IP)
- [ ] SMTP configurado (Gmail)
  - [ ] `SMTP_HOST` = smtp.gmail.com
  - [ ] `SMTP_PORT` = 587
  - [ ] `SMTP_USER` configurado
  - [ ] `SMTP_PASS` configurado (senha de app)
  - [ ] `SMTP_FROM` configurado

### Configuração Frontend
- [ ] Arquivo `.env.production` criado em `apps/client/`
- [ ] `VITE_API_URL` configurado (mesmo que APP_URL)

### Build e Instalação
- [ ] Dependencies instaladas: `npm install`
- [ ] Build do frontend: `npm run build -w apps/client`
- [ ] Verificar build: `ls -la apps/client/dist/`
- [ ] Dependencies de produção do servidor
  ```bash
  cd apps/server && npm install --production && cd ../..
  ```

### Migrations
- [ ] Migrations executadas
  ```bash
  cd apps/server/src/db/migrations
  PGPASSWORD=SUA_SENHA psql -h localhost -U indicadores_user -d indicadores -f 001_initial_schema.sql
  ```
- [ ] Verificar tabelas criadas
  ```sql
  \dt
  ```

## 🔄 PM2

- [ ] PM2 iniciado: `pm2 start ecosystem.config.js`
- [ ] Status verificado: `pm2 status`
- [ ] Logs sem erros: `pm2 logs api`
- [ ] Configuração salva: `pm2 save`
- [ ] Startup configurado: `pm2 startup`
- [ ] Health check funcionando
  ```bash
  curl http://localhost:4000/health
  ```

## 🌐 Nginx

### Configuração
- [ ] Arquivo de configuração copiado
  ```bash
  sudo cp nginx.conf /etc/nginx/sites-available/indicadores
  ```
- [ ] Arquivo editado com domínio/IP correto
  ```bash
  sudo nano /etc/nginx/sites-available/indicadores
  ```
- [ ] Path do root atualizado para usuário correto
- [ ] Symlink criado
  ```bash
  sudo ln -s /etc/nginx/sites-available/indicadores /etc/nginx/sites-enabled/
  ```
- [ ] Site padrão removido
  ```bash
  sudo rm /etc/nginx/sites-enabled/default
  ```
- [ ] Configuração testada: `sudo nginx -t`
- [ ] Nginx reiniciado: `sudo systemctl restart nginx`
- [ ] Status OK: `sudo systemctl status nginx`

### SSL (Se usar domínio)
- [ ] Certbot instalado
  ```bash
  sudo apt install -y certbot python3-certbot-nginx
  ```
- [ ] Certificado obtido
  ```bash
  sudo certbot --nginx -d seudominio.com
  ```
- [ ] HTTPS funcionando
- [ ] Renovação automática testada
  ```bash
  sudo certbot renew --dry-run
  ```

## 🔐 Segurança

### Firewall
- [ ] UFW habilitado
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- [ ] Status verificado: `sudo ufw status`

### Permissões
- [ ] Arquivos com permissões corretas
- [ ] `.env` com permissões 600
  ```bash
  chmod 600 apps/server/.env
  ```
- [ ] Scripts executáveis
  ```bash
  chmod +x deploy.sh backup.sh
  ```

## ✅ Verificação Final

### Testes
- [ ] API respondendo: `curl http://localhost:4000/health`
- [ ] Frontend acessível via navegador
- [ ] Login funciona
- [ ] Dashboard carrega
- [ ] Fluxo de caixa funciona
- [ ] Criação de usuário funciona
- [ ] Email de boas-vindas enviado
- [ ] Email de reset de senha funciona
- [ ] Importação de dados funciona

### Logs
- [ ] PM2 logs limpos: `pm2 logs api`
- [ ] Nginx access log OK: `sudo tail -f /var/log/nginx/indicadores_access.log`
- [ ] Nginx error log limpo: `sudo tail -f /var/log/nginx/indicadores_error.log`
- [ ] PostgreSQL sem erros: `sudo journalctl -u postgresql`

### Monitoramento
- [ ] PM2 monit funcionando: `pm2 monit`
- [ ] CPU e memória OK
- [ ] Disk space OK: `df -h`

## 📱 DNS (Se usar domínio)

- [ ] Registro A apontando para IP do servidor
- [ ] Registro AAAA (IPv6) se aplicável
- [ ] Propagação DNS verificada
  ```bash
  dig seudominio.com
  ```
- [ ] WWW redirecionando (se configurado)

## 🔄 Backup

- [ ] Script de backup testado: `./backup.sh`
- [ ] Backup automático configurado (cron)
  ```bash
  crontab -e
  # 0 2 * * * cd ~/projeto-indicadores && ./backup.sh
  ```
- [ ] Processo de restore testado

## 📚 Documentação

- [ ] Credenciais documentadas (local seguro)
- [ ] Informações do servidor documentadas
- [ ] Processo de deploy documentado
- [ ] Equipe informada sobre acesso

## 🎉 Go Live

- [ ] Todos os checks acima passaram
- [ ] Testes finais executados
- [ ] Stakeholders notificados
- [ ] URL compartilhada com usuários
- [ ] Monitoramento ativo primeiras 24h

---

## 🆘 Em Caso de Problemas

### API não inicia
```bash
pm2 logs api
cat apps/server/.env
psql -U indicadores_user -d indicadores -h localhost
```

### Frontend não carrega
```bash
ls -la apps/client/dist/
npm run build -w apps/client
sudo nginx -t
```

### Banco não conecta
```bash
sudo systemctl status postgresql
psql -U indicadores_user -d indicadores -h localhost
cat apps/server/.env | grep DB_
```

### SSL não funciona
```bash
sudo certbot certificates
sudo nginx -t
sudo systemctl restart nginx
```

---

**Data do Deploy**: ___________

**Responsável**: ___________

**Versão**: ___________

**Notas adicionais**:
___________________________________
___________________________________
___________________________________
