# AdManager — Contexto Completo do Projeto

## Quem é o usuário
Seller com lojas em Mercado Livre, Shopee, TikTok Shop e Shein.
Marca: Tuck Kids (roupas e kits bebê), baseado em Gaspar, Santa Catarina.
Volume: 46 anúncios ativos no ML, 50-500 SKUs no total.
Perfil técnico: tem noções de programação, quer construir o sistema com ajuda da IA.

---

## A visão do projeto

Não é um dashboard comum. É um "Gerente de Anúncios com IA" — um co-piloto inteligente que:
- Monitora a performance de todos os anúncios em todas as plataformas
- Diagnostica POR QUE está ganhando ou perdendo mercado
- Sugere melhorias com impacto estimado em R$
- Executa ações automaticamente (com aprovação do seller)

A diferença central:
- Dashboard comum: "Seu CTR caiu 30%"
- AdManager: "Seu CTR caiu 30% porque 3 concorrentes baixaram preço essa semana.
  Sugiro ajustar o preço do SKU X e melhorar a foto principal do SKU Y.
  Quer que eu faça isso agora?"

---

## As 4 necessidades principais

### 1. Monitoramento de Performance
- Visão unificada de ML + Shopee + TikTok + Shein numa tela só
- KPIs: impressões, cliques, CTR, conversão, vendas, receita, ROAS, gasto em ads
- Alertas automáticos: queda de CTR, ROAS abaixo do threshold, produto sem estoque
- Tendência por produto (subindo, caindo, estável)

### 2. Diagnóstico de Mercado — "Por que estamos perdendo?"
Os 5 motivos de visita sem compra que o sistema diagnostica automaticamente:
1. Preço — concorrente mais barato visível na mesma página
2. Confiança — poucas avaliações, nota baixa, fotos amadoras
3. Proposta de valor — anúncio não deixa claro o diferencial
4. Fricção logística — frete caro, prazo longo
5. Momento errado — pessoa pesquisando, não pronta pra comprar

O sistema cruza dados para diagnosticar sem ver o carrinho:
- CTR alto + conversão baixa = problema NA PÁGINA (preço, confiança, frete)
- CTR baixo = problema NO ANÚNCIO (foto, título, keyword errada)
- Preço alinhado + conversão baixa + nota abaixo da média = problema de confiança

### 3. Score de Conversão por Anúncio (0-100)
Cada anúncio recebe uma pontuação composta:
- Preço (25pts): posição vs concorrentes
- Confiança (25pts): nota, avaliações, perguntas respondidas
- Criativo (25pts): número de fotos, qualidade, vídeo
- Conteúdo (25pts): atributos preenchidos, título com keywords, descrição completa

O sistema ordena produtos pelo menor score e diz exatamente o que melhorar.

### 4. Criação de Anúncios com IA
Fluxo completo:
1. Seller informa: nome, categoria, custo, margem mínima, specs, estratégia, público
2. IA pesquisa concorrentes e keywords
3. IA gera título otimizado por plataforma, descrição completa, keywords ranqueadas,
   preço sugerido com margem calculada, score estimado do anúncio
4. Seller revisa e edita qualquer campo inline
5. Sistema publica via API nas plataformas selecionadas

Estratégias de posicionamento disponíveis:
- Mais Barato: competir por preço baixo
- Qualidade Premium: justificar preço maior
- Nicho Específico: público segmentado
- Entrega Rápida: priorizar velocidade

---

## Limitações importantes descobertas

### Dados de funil (carrinho, checkout)
Os marketplaces NÃO fornecem dados de comportamento interno (quem adicionou ao
carrinho, quem abandonou o checkout). Cada plataforma libera:
- ML: visitas por anúncio, conversão, origem do tráfego (orgânico vs pago)
- Shopee: visitantes únicos, taxa de conversão por produto (painel interno)
- TikTok: funil view→clique→compra visível no Ads Manager
- Shein: praticamente zero visibilidade

Solução: usar métricas proxy (CTR, conversão, ROAS) cruzadas com dados de
concorrentes para inferir o problema sem o dado bruto do carrinho.

### Todo tráfego é orgânico das plataformas
Não há tráfego próprio (Instagram, WhatsApp) por enquanto.
Isso significa que não há como rastrear origem por UTM ainda.

---

## Arquitetura técnica planejada

```
[Coletores por plataforma]  →  [Banco de dados central]
       ↓                              ↓
[Motor de análise + IA]    →  [Fila de sugestões]
       ↓                              ↓
[Dashboard React]          →  [Executor de ações via API]
         ↑_________________feedback loop__________________↑
```

Stack:
- Backend: Python
- Frontend: React
- IA: Claude API (claude-sonnet-4-20250514)
- Banco: SQLite para começar → PostgreSQL depois
- Automação: a definir (n8n ou Celery)

---

## O que já foi construído

### Autenticação ML (100% funcional)
- App criada no DevCenter do ML
- OAuth 2.0 com redirect para httpbin.org/get
- Token obtido e testado com sucesso
- Escopos: read + offline_access (write desabilitado por segurança)
- 46 anúncios confirmados via API

Credenciais (mover para .env e NUNCA commitar):
```
ML_CLIENT_ID=2276040532211964
ML_CLIENT_SECRET=JP1F9pMSaAkKQz5cAltsspH22e2exYET
ML_ACCESS_TOKEN=APP_USR-2276040532211964-030720-97c2e7acf6c27fe50b7f5bf032cb8890-2420666742
ML_REFRESH_TOKEN=TG-69acc3fc98b6100001542486-2420666742
ML_USER_ID=2420666742
```
⚠️ Access token expira a cada 6h. Refresh token válido 6 meses.
Implementar job automático de renovação a cada 5h.

Endpoints ML já testados e funcionando:
- GET /users/{user_id}/items/search?limit=50&offset=0 → lista IDs paginada
- GET /items/{id} → detalhes completos do anúncio
- GET /items?ids={ids} → batch de até 20 itens
- GET /visits/items?ids={ids} → visitas por anúncio

---

### ml_relatorio.py (pronto, ainda não rodado)
Script Python sem dependências externas que:
- Busca todos os 46 anúncios paginando automaticamente
- Detalhes em lotes de 20 (limite da API)
- Visitas em lotes de 20
- Calcula: conversão %, receita estimada, score de saúde 0-100
- Terminal: top 10 por receita, alertas, anúncios sem venda, baixa conversão
- Salva ml_dados.json completo para alimentar o dashboard

PRÓXIMO PASSO IMEDIATO: rodar esse script.

---

### admanager-mvp.jsx (dashboard React com mock data)
3 abas funcionais:

Aba 1 — Visão Geral:
- KPIs consolidados: receita total, investimento, ROAS global, vendas, ganho potencial
- Barra de performance por plataforma com % da receita
- Alertas ativos com botão de ação rápida

Aba 2 — Produtos:
- Lista de produtos clicável
- Ao expandir: métricas por plataforma (receita, ROAS, CTR, vendas, gasto, tendência)
- Alertas específicos do produto com causa e ação sugerida

Aba 3 — Sugestões IA:
- Sugestões priorizadas (alta/média/baixa)
- Cada sugestão: diagnóstico detalhado + esforço estimado + impacto em R$/mês
- Botões: "Aplicar" (1 clique) ou "Ignorar"
- Potencial total de ganho mensal se todas aplicadas

PRÓXIMO PASSO: substituir mock data pelo ml_dados.json real.

---

### ad-creator.jsx (criação de anúncios com Claude API — funcional)
Usa a Claude API de verdade (claude-sonnet-4-20250514).
Fluxo em 3 passos com UI completa:

Passo 1 - Produto: nome, categoria, custo, margem mínima, specs, público-alvo
Passo 2 - Estratégia: tipo de posicionamento + seleção de plataformas
Passo 3 - Revisão: tudo gerado pela IA, editável inline antes de publicar

O que a IA gera:
- Título otimizado para cada plataforma (algoritmos diferentes)
- Descrição completa com benefícios, specs e CTA
- 8 keywords por plataforma
- Preço sugerido com margem calculada
- Score do anúncio (preço/confiança/criativo/conteúdo)
- 3 dicas de melhoria de performance

Botão "Publicar" ainda não conectado às APIs — passo futuro.

---

## APIs das plataformas

### Mercado Livre
- Portal: https://developers.mercadolivre.com.br/devcenter
- Base URL: https://api.mercadolibre.com
- Auth: OAuth 2.0, token 6h, refresh 6 meses
- Rate limit: 600 calls/min
- Fotos: precisam de URL pública (não upload direto)
- Ponto de atenção: Int64 para novos user IDs

### Shopee
- Portal: https://open.shopee.com
- Auth: HMAC-SHA256 assinando cada request
- Aprovação manual: 3-15 dias úteis
- Endpoint útil: ads.getRecommendKeyword (sugestão de keywords)
- Ponto de atenção: alguns endpoints só funcionam em produção
- Status: ainda não iniciado o cadastro

### TikTok Shop
- API disponível, lógica diferente: performance depende do vídeo
- Módulo específico necessário para conteúdo em vídeo

### Shein
- API limitada, marketplace fechado
- Pouco controle, foco em compliance

---

## Dados reais descobertos no ML

- 46 anúncios no total
- Exemplo analisado: "Kit Com 9 Peças Body Bebê Menino Verão"
  - ID: MLB5670593798
  - Preço: R$ 149,90
  - Estoque: 2.050 unidades
  - Vendas: 11 unidades
  - Variações: RN(0 vendas), P(1), M(3), G(2), GG(5)
  - 9 fotos cadastradas
  - Frete grátis
  - Status: CLOSED (encerrado — precisa investigar por quê)
  - Listing type: gold_pro

---

## Módulos futuros planejados

### Precificação automática
Regras configuráveis:
- Seguir o menor preço (sempre X% abaixo do mais barato)
- Proteger margem mínima (nunca vender abaixo do custo + margem)
- Buy Box ML (ajustar para ganhar destaque sem sacrificar margem)
- Sazonalidade (subir preço quando estoque baixo)
Requer: custo de cada produto cadastrado no sistema

### Criativos com IA
- Remoção de fundo: Remove.bg API ou Photoroom
- Geração de cenário lifestyle: Stability AI ou Photoroom Pro
- Banners automáticos: Bannerbear ou Placeit
- Processamento em escala para centenas de SKUs

### Gestão de campanhas/keywords
- Coleta semanal de search terms sem conversão → negativar
- Ajuste automático de lances por ROAS alvo
- Pausar keywords com gasto alto e zero venda em 14 dias
- A/B test de títulos

---

## Decisões de segurança tomadas
- Escopos: apenas read + offline_access (sem write por enquanto)
- Princípio do menor privilégio: só adicionar write quando for implementar ações
- Credenciais: apenas em .env, nunca em código ou repositório
- Tokens: access token vida curta (6h), refresh token vida longa (6 meses)
- .gitignore deve incluir: .env, ml_dados.json, __pycache__/

---

## Roadmap

Fase 1 (agora):
1. Rodar ml_relatorio.py → ver dados reais dos 46 anúncios
2. Conectar ml_dados.json ao dashboard React
3. Implementar auto-refresh do token ML

Fase 2:
4. Cadastro e aprovação Shopee Open Platform
5. Coletor de dados Shopee
6. Dashboard unificado ML + Shopee

Fase 3:
7. Conectar botão Publicar do ad-creator às APIs
8. Motor de sugestões com IA dinâmica (não mais mock)
9. Banco de dados para histórico de performance

Fase 4:
10. Precificação automática
11. Gestão de campanhas e keywords
12. Criativos com IA

---

## Como retomar o projeto

Cole este arquivo no Claude e diga:
"Vamos continuar o AdManager. [descreva onde parou]"

Arquivos do projeto:
- ml_relatorio.py — coletor de dados ML
- admanager-mvp.jsx — dashboard React
- ad-creator.jsx — criação de anúncios com IA
- .env — credenciais (não commitar)
