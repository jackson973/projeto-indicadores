# AdManager — Contexto do Projeto

## O que é
Sistema de gestão de anúncios para Mercado Livre, Shopee, TikTok Shop e Shein.
Seller com 46 anúncios ativos no ML, loja na Shopee, abrindo TikTok e Shein.
Volume: 50-500 SKUs. Objetivo: automatizar toda a gestão de anúncios com IA.

---

## O que já foi construído

### 1. Autenticação ML (funcionando)
- App criada no DevCenter: https://developers.mercadolibre.com.br/devcenter
- Client ID: 2276040532211964
- OAuth 2.0 com redirect para httpbin.org/get
- Token ativo obtido com sucesso
- Escopos: read + offline_access (write desabilitado por segurança por enquanto)

Credenciais (mover para .env):
```
ML_CLIENT_ID=2276040532211964
ML_CLIENT_SECRET=JP1F9pMSaAkKQz5cAltsspH22e2exYET
ML_ACCESS_TOKEN=APP_USR-2276040532211964-030720-97c2e7acf6c27fe50b7f5bf032cb8890-2420666742
ML_REFRESH_TOKEN=TG-69acc3fc98b6100001542486-2420666742
ML_USER_ID=2420666742
```
⚠️ Token expira a cada 6h — implementar auto-refresh com refresh_token.

---

### 2. ml_relatorio.py
Script Python (sem dependências externas) que:
- Busca todos os IDs de anúncios paginando de 50 em 50
- Busca detalhes em lotes de 20 (limite da API ML)
- Busca visitas em lotes de 20
- Calcula: conversão, receita estimada, score de saúde (0-100)
- Gera relatório no terminal com top 10, alertas, anúncios sem venda
- Salva tudo em ml_dados.json

Ainda não foi rodado — próximo passo imediato.

---

### 3. admanager-mvp.jsx
Dashboard React com dados mockados. 3 abas:
- Visão Geral: KPIs consolidados + alertas ativos por plataforma
- Produtos: breakdown por plataforma (ROAS, CTR, vendas, tendência)
- Sugestões IA: sugestões priorizadas com impacto estimado em R$, aprovar/ignorar com 1 clique

Próximo passo: substituir mock data pelo ml_dados.json real.

---

### 4. ad-creator.jsx
Módulo de criação de anúncios com Claude API (funcional, usa claude-sonnet-4-20250514).
Fluxo em 3 passos:
1. Dados do produto (nome, categoria, custo, margem, specs)
2. Estratégia (mais barato / qualidade / nicho / entrega rápida) + plataformas
3. IA gera título otimizado por plataforma, descrição, keywords, preço sugerido, score

Gera JSON estruturado e permite edição inline antes de publicar.
Botão "Publicar" ainda não conectado às APIs — próximo passo futuro.

---

## Arquitetura planejada

```
[Coletores por plataforma]  →  [Banco de dados central]
       ↓                              ↓
[Motor de análise + IA]    →  [Fila de sugestões]
       ↓                              ↓
[Dashboard React]          →  [Executor de ações via API]
```

Stack definida:
- Backend: Python
- Frontend: React
- IA: Claude API (claude-sonnet-4-20250514)
- Banco: a definir (SQLite para começar, PostgreSQL depois)
- Automação: a definir

---

## APIs mapeadas

### Mercado Livre
- Base URL: https://api.mercadolibre.com
- Auth: OAuth 2.0, token expira 6h, refresh token válido 6 meses
- Endpoints já testados:
  - GET /users/{user_id}/items/search — lista IDs dos anúncios ✅
  - GET /items/{id} — detalhes do anúncio ✅
  - GET /visits/items?ids={ids} — visitas por anúncio ✅
  - GET /items?ids={ids} — batch de até 20 itens ✅

### Shopee
- Ainda não configurada
- Requer cadastro em open.shopee.com (aprovação manual, 3-15 dias)
- Auth: HMAC-SHA256 por request
- Partner ID e Partner Key: a obter

### TikTok Shop e Shein
- Planejados para fase futura

---

## Dados reais ML descobertos
- 46 anúncios cadastrados
- Seller em Gaspar, Santa Catarina
- Marca: Tuck Kids (roupas bebê)
- Exemplo: "Kit Com 9 Peças Body Bebê Menino Verão" — R$149,90, 11 vendas, status: closed
- Produtos com variações de tamanho (RN, P, M, G, GG)

---

## Próximos passos (em ordem)

1. Rodar ml_relatorio.py e analisar os dados reais
2. Conectar ml_dados.json ao dashboard (admanager-mvp.jsx)
3. Implementar auto-refresh do token ML
4. Iniciar cadastro na Shopee Open Platform
5. Expandir script de coleta com mais métricas (orders, reviews)
6. Conectar botão "Publicar" do ad-creator às APIs
7. Construir banco de dados para histórico de performance

---

## Como continuar
Cole este arquivo no início da conversa no VS Code e diga:
"Vamos continuar o desenvolvimento do AdManager. Próximo passo: rodar o ml_relatorio.py e conectar os dados reais ao dashboard."
