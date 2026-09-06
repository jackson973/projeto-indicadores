/**
 * Registro das rotas da API externa (/api/v1).
 *
 * Fonte da verdade para:
 *  - escopos que uma credencial pode receber (key)
 *  - checagem de permissão no middleware (requireScope)
 *  - tela de Configurações → API (lista de rotas + documentação)
 *
 * Cada escopo agrupa um recurso; os endpoints listados dentro dele
 * ficam liberados quando a credencial possui o escopo.
 */

const API_BASE = '/api/v1';

const SCOPES = [
  {
    key: 'health',
    label: 'Health',
    description: 'Confirma que o sistema está acessível. Liberado para qualquer credencial válida.',
    always: true,
    endpoints: [
      {
        method: 'GET', path: '/health',
        summary: 'Status do sistema, hora do servidor e dados da credencial.',
        params: [],
      },
    ],
  },
  {
    key: 'stores',
    label: 'Lojas / contas',
    description: 'Lojas presentes nas vendas e contas de marketplace cadastradas.',
    endpoints: [
      {
        method: 'GET', path: '/stores',
        summary: 'Lojas com vendas (nome, plataforma, canal, período com vendas) e contas conectadas.',
        params: [],
      },
    ],
  },
  {
    key: 'sales',
    label: 'Vendas',
    description: 'Vendas (linhas de pedido) por período, canal e loja, com agregações.',
    endpoints: [
      {
        method: 'GET', path: '/sales',
        summary: 'Linhas de venda no período. Padrão: últimos 30 dias, paginado.',
        params: [
          { name: 'start', type: 'YYYY-MM-DD', description: 'Data inicial (inclusive).' },
          { name: 'end', type: 'YYYY-MM-DD', description: 'Data final (inclusive).' },
          { name: 'store', type: 'string', description: 'Nome da loja (igual ao dashboard).' },
          { name: 'platform', type: 'string', description: 'Plataforma (ex: Mercado Livre, Shopee).' },
          { name: 'sale_channel', type: 'online | atacado', description: 'Canal de venda.' },
          { name: 'status', type: 'string', description: 'Status da venda (ex: Cancelado).' },
          { name: 'limit', type: 'int (≤ 5000)', description: 'Tamanho da página. Padrão 500.' },
          { name: 'offset', type: 'int', description: 'Deslocamento para paginação.' },
        ],
      },
      {
        method: 'GET', path: '/sales/summary',
        summary: 'Totais agregados por dia, semana, mês, loja, plataforma ou canal.',
        params: [
          { name: 'group_by', type: 'day | week | month | store | platform | channel', description: 'Agrupamento. Padrão: day.' },
          { name: 'start', type: 'YYYY-MM-DD', description: 'Data inicial (inclusive).' },
          { name: 'end', type: 'YYYY-MM-DD', description: 'Data final (inclusive).' },
          { name: 'store', type: 'string', description: 'Filtra por loja.' },
          { name: 'platform', type: 'string', description: 'Filtra por plataforma.' },
          { name: 'sale_channel', type: 'online | atacado', description: 'Filtra por canal.' },
        ],
      },
    ],
  },
  {
    key: 'orders',
    label: 'Pedidos',
    description: 'Pedidos detalhados (marketplaces e atacado) com seus itens.',
    endpoints: [
      {
        method: 'GET', path: '/orders',
        summary: 'Pedidos dos marketplaces (agrupados por nº do pedido) com itens. Padrão: últimos 30 dias.',
        params: [
          { name: 'start', type: 'YYYY-MM-DD', description: 'Data inicial (inclusive).' },
          { name: 'end', type: 'YYYY-MM-DD', description: 'Data final (inclusive).' },
          { name: 'store', type: 'string', description: 'Filtra por loja.' },
          { name: 'platform', type: 'string', description: 'Filtra por plataforma.' },
          { name: 'sale_channel', type: 'online | atacado', description: 'Filtra por canal.' },
          { name: 'status', type: 'string', description: 'Filtra por status.' },
          { name: 'limit', type: 'int (≤ 2000)', description: 'Tamanho da página. Padrão 200.' },
          { name: 'offset', type: 'int', description: 'Deslocamento para paginação.' },
        ],
      },
      {
        method: 'GET', path: '/orders/{orderId}',
        summary: 'Um pedido de marketplace pelo nº do pedido (order_id ou nº da plataforma).',
        params: [],
      },
      {
        method: 'GET', path: '/orders/internal',
        summary: 'Pedidos do módulo Pedidos (atacado / representantes), com contagem de itens.',
        params: [
          { name: 'status', type: 'string', description: 'Status do pedido.' },
          { name: 'type', type: 'string', description: 'Tipo do pedido.' },
          { name: 'search', type: 'string', description: 'Busca por cliente ou nº Sisplan.' },
          { name: 'limit', type: 'int (≤ 1000)', description: 'Máximo de registros. Padrão 200.' },
        ],
      },
    ],
  },
  {
    key: 'products',
    label: 'Produtos / SKUs',
    description: 'Produtos e SKUs vendidos (catálogo derivado das vendas).',
    endpoints: [
      {
        method: 'GET', path: '/products',
        summary: 'Lista paginada de produtos/anúncios vendidos, com SKU e lojas.',
        params: [
          { name: 'codigo', type: 'string', description: 'Filtra por SKU (contém).' },
          { name: 'nome', type: 'string', description: 'Filtra por nome do anúncio (contém).' },
          { name: 'lojas', type: 'a,b,c', description: 'Lojas separadas por vírgula.' },
          { name: 'page', type: 'int', description: 'Página. Padrão 1.' },
          { name: 'limit', type: 'int (≤ 500)', description: 'Tamanho da página. Padrão 50.' },
        ],
      },
    ],
  },
  {
    key: 'stock',
    label: 'Estoque',
    description: 'Estoque atual (produto × tamanho), custo médio e alertas de mínimo.',
    endpoints: [
      {
        method: 'GET', path: '/stock',
        summary: 'Produtos de estoque com a grade (variantes) aninhada.',
        params: [
          { name: 'search', type: 'string', description: 'Filtra por código ou descrição.' },
          { name: 'include_inactive', type: 'true | false', description: 'Inclui produtos inativos.' },
        ],
      },
      {
        method: 'GET', path: '/stock/variants',
        summary: 'Lista plana produto × tamanho com saldo, mínimo e custo médio (ideal para BI).',
        params: [
          { name: 'search', type: 'string', description: 'Filtra por código ou descrição.' },
        ],
      },
      {
        method: 'GET', path: '/stock/low',
        summary: 'Variantes com saldo igual ou abaixo do estoque mínimo.',
        params: [],
      },
    ],
  },
  {
    key: 'indicators',
    label: 'Indicadores (KPIs)',
    description: 'KPIs já calculados pelo sistema, iguais ao Dashboard Vendas.',
    endpoints: [
      {
        method: 'GET', path: '/indicators',
        summary: 'Resumo, vendas por período, por loja, por plataforma e curva ABC do período.',
        params: [
          { name: 'start', type: 'YYYY-MM-DD', description: 'Data inicial. Padrão: 1º dia do mês atual.' },
          { name: 'end', type: 'YYYY-MM-DD', description: 'Data final. Padrão: hoje.' },
          { name: 'store', type: 'string', description: 'Filtra por loja.' },
          { name: 'sale_channel', type: 'online | atacado', description: 'Filtra por canal.' },
          { name: 'period', type: 'day | week | month', description: 'Granularidade de "por período". Padrão: month.' },
        ],
      },
    ],
  },
  {
    key: 'marketplaces',
    label: 'Marketplaces',
    description: 'Mercado Livre: anúncios da conta e relatório de lucro por venda (comissão, frete, estorno, NF, custo, margem).',
    endpoints: [
      {
        method: 'GET', path: '/marketplaces',
        summary: 'Plataformas disponíveis e contas conectadas.',
        params: [],
      },
      {
        method: 'GET', path: '/marketplaces/ml/anuncios',
        summary: 'Anúncios da conta ML (mesmos dados da tela Lojas → Anúncios). Consulta a API do ML em tempo real: pode levar alguns segundos.',
        params: [
          { name: 'store_id', type: 'int', description: 'ID da conta (ver /marketplaces). Obrigatório.' },
        ],
      },
      {
        method: 'GET', path: '/marketplaces/ml/profit/stores',
        summary: 'Rótulos de loja ML disponíveis para o relatório de lucro.',
        params: [],
      },
      {
        method: 'GET', path: '/marketplaces/ml/profit',
        summary: 'Lucro por venda (tela Lucro ML): pedidos, resumo por anúncio, totais e cancelados. Um dia (date) ou intervalo (start/end, máx. 62 dias).',
        params: [
          { name: 'store', type: 'string', description: 'Rótulo da loja ML (ver /marketplaces/ml/profit/stores). Obrigatório.' },
          { name: 'date', type: 'YYYY-MM-DD', description: 'Dia das vendas.' },
          { name: 'start', type: 'YYYY-MM-DD', description: 'Início do intervalo (alternativa a date).' },
          { name: 'end', type: 'YYYY-MM-DD', description: 'Fim do intervalo (alternativa a date).' },
        ],
      },
    ],
  },
];

const SCOPE_KEYS = SCOPES.map((s) => s.key);

function isValidScope(key) {
  return key === '*' || SCOPE_KEYS.includes(key);
}

function normalizeScopes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const k = String(raw || '').trim();
    if (!k || !isValidScope(k) || out.includes(k)) continue;
    out.push(k);
  }
  return out;
}

module.exports = { API_BASE, SCOPES, SCOPE_KEYS, isValidScope, normalizeScopes };
