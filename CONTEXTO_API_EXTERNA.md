# Módulo de API externa (Configurações → API externa)

Permite que sistemas externos (BI, integrações, futuros módulos de preço/margem/concorrência)
consumam dados do sistema por HTTP, com credencial própria e escopo por rota.

## Arquitetura

| Peça | Arquivo | Função |
|---|---|---|
| Migration | `apps/server/src/db/migrations/088_api_module.sql` | Tabelas `api_clients` (credenciais) e `api_request_logs` (log) |
| Registro de rotas | `apps/server/src/api/routeRegistry.js` | Fonte da verdade dos escopos, endpoints, parâmetros e textos da documentação |
| Repositório de credenciais | `apps/server/src/db/apiClientsRepository.js` | Geração/hash de chave, CRUD, rotação, log, uso |
| Repositório de dados | `apps/server/src/db/apiDataRepository.js` | Consultas SQL filtradas/paginadas/agrupadas para a API (não carrega a tabela inteira) |
| Middleware | `apps/server/src/middleware/apiKeyAuth.js` | `apiKeyAuth` (chave, ativo, expiração, rate limit), `requireScope`, `apiRequestLogger` |
| Rotas públicas | `apps/server/src/routes/publicApi.js` | Router montado em `/api/v1` |
| Rotas de administração | `apps/server/src/routes/apiClients.js` | `/api/api-clients` (exige módulo `configuracoes`) |
| Tela | `apps/client/src/components/ApiSettings.jsx` | Credenciais + Documentação (menu Configurações → API externa) |
| PDF da documentação | `apps/server/src/services/apiDocsPdf.js` | `GET /api/api-clients/docs.pdf?base_url=` (pdfkit, gerado do registro de rotas; botão "Baixar PDF" na aba Documentação) |
| Testes | `apps/server/test/apiModule.test.js` | Chaves, escopos, rate limit, middleware |

`routes/anuncios.js` foi refatorado: a lógica do `GET /api/anuncios` virou `buildAnunciosReport(store_id)`
(exportada) e é reutilizada por `/api/v1/marketplaces/ml/anuncios`.

## Autenticação

- Chave no formato `ind_` + 40 hex. Só o **sha256** fica no banco; a chave é mostrada uma vez ao criar/rotacionar.
- Enviar em `X-API-Key: <chave>` ou `Authorization: Bearer <chave>` (aceita `?api_key=` como último recurso).
- Cada credencial tem: escopos (rotas), limite por minuto (0 = sem limite), expiração opcional, ativo/inativo.
- Rate limit é em memória por processo (janela fixa de 1 min). Headers `X-RateLimit-Limit/Remaining/Reset`.
- Toda requisição (inclusive falhas de autenticação) vai para `api_request_logs`; `last_used_at` e `request_count` são atualizados.

## Formato das respostas

- Sucesso: `{ "data": ..., "meta": { ... } }`
- Erro: `{ "error": { "code": "...", "message": "..." } }`
- Códigos: 401 (chave ausente/inválida), 403 (inativa, expirada, sem escopo), 404, 429 (rate limit), 400 (parâmetros).
- Datas `YYYY-MM-DD` no fuso de São Paulo. `end` é inclusivo.

## Rotas (escopo → endpoints)

| Escopo | Endpoints | Origem dos dados |
|---|---|---|
| `health` (sempre liberado) | `GET /health` | — |
| `stores` | `GET /stores` | `sales` (lojas com vendas) + tabela `stores` (contas conectadas) |
| `sales` | `GET /sales`, `GET /sales/summary?group_by=day|week|month|store|platform|channel` | `sales` via SQL (paginado; summary exclui cancelados) |
| `orders` | `GET /orders`, `GET /orders/{orderId}`, `GET /orders/internal` | `sales` agrupado por pedido; `/internal` = módulo Pedidos (`ordersRepository.getOrders`) |
| `products` | `GET /products` | `productsRepository.listProducts` (paginado) |
| `stock` | `GET /stock`, `GET /stock/variants`, `GET /stock/low` | `stockRepository` + SQL plano de variantes |
| `indicators` | `GET /indicators` | Mesmos cálculos do Dashboard Vendas (`lib/metrics`) com **uma** consulta `getSales` |
| `marketplaces` | `GET /marketplaces`, `GET /marketplaces/ml/anuncios?store_id=`, `GET /marketplaces/ml/profit/stores`, `GET /marketplaces/ml/profit?store=&date=` (ou `start`/`end`, máx. 62 dias) | `buildAnunciosReport` (API do ML em tempo real) e `mlProfitReportService.getReportData` (tela Lucro ML) |

`/marketplaces/ml/profit` com intervalo consolida dia a dia e devolve `orders` (com `date`), `byAd`, `byDay`, `totals`, `canceled`.

## Como adicionar uma rota nova

1. Adicionar o endpoint (e, se for recurso novo, o escopo) em `routeRegistry.js` — a tela, a documentação e o PDF atualizam sozinhos.
2. Implementar o handler em `publicApi.js` com `requireScope('<escopo>')` e `wrap(...)`.
3. Se precisar de SQL, colocar em `apiDataRepository.js`.
4. Rotas específicas devem vir antes das rotas com parâmetro (`/orders/internal` antes de `/orders/:orderId`).

## Próximos passos previstos

- Endpoints de BI, preço, margem e concorrência (módulo Custo & Preço / comparativo de mercado dos anúncios).
- Se o servidor rodar em mais de um processo, trocar o rate limit em memória por Redis ou tabela.
