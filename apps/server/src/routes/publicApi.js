/**
 * API externa — /api/v1
 *
 * Autenticação por chave (X-API-Key) com escopo por rota; ver src/api/routeRegistry.js.
 * Respostas: { data, meta? } em sucesso e { error: { code, message } } em erro.
 */
const express = require('express');
const { apiKeyAuth, requireScope, apiRequestLogger, apiError } = require('../middleware/apiKeyAuth');
const { SCOPES, API_BASE } = require('../api/routeRegistry');
const data = require('../db/apiDataRepository');
const salesRepository = require('../db/salesRepository');
const storesRepo = require('../db/storesRepository');
const stockRepo = require('../db/stockRepository');
const productsRepo = require('../db/productsRepository');
const ordersRepo = require('../db/ordersRepository');
const metrics = require('../lib/metrics');
const { getSaoPauloDate } = require('../lib/timezone');
const { getReportData, aggregate, listMlStoreLabels, NF_PCT } = require('../services/mlProfitReportService');

const router = express.Router();
router.use(apiRequestLogger);
router.use(apiKeyAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

function clampInt(v, { def, min = 0, max }) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/** Valida start/end; aplica padrão (últimos `defaultDays` dias) quando ausentes. */
function dateRange(query, { defaultDays = 30, maxDays = null } = {}) {
  let { start, end } = query;
  if (start && !data.isDate(start)) throw badRequest('Parâmetro start deve estar no formato YYYY-MM-DD.');
  if (end && !data.isDate(end)) throw badRequest('Parâmetro end deve estar no formato YYYY-MM-DD.');
  if (!end) end = getSaoPauloDate();
  if (!start) start = getSaoPauloDate(-defaultDays);
  if (start > end) throw badRequest('Parâmetro start não pode ser maior que end.');
  if (maxDays) {
    const days = daysBetween(start, end) + 1;
    if (days > maxDays) throw badRequest(`Intervalo máximo de ${maxDays} dias.`);
  }
  return { start, end };
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'bad_request';
  return err;
}

/** Envolve handlers async: erros com `status` viram resposta de erro padronizada. */
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return apiError(res, err.status, err.code || 'error', err.message);
    console.error(`[API v1] ${req.method} ${req.originalUrl}:`, err);
    return apiError(res, 500, 'internal_error', 'Erro interno ao processar a requisição.');
  }
};

const filtersFrom = (q) => ({
  store: q.store || undefined,
  platform: q.platform || undefined,
  sale_channel: q.sale_channel || undefined,
  status: q.status || undefined,
});

// ── /health ──────────────────────────────────────────────────────────────────

router.get('/health', requireScope('health'), (req, res) => {
  res.json({
    data: {
      status: 'ok',
      serverTime: new Date().toISOString(),
      client: { id: req.apiClient.id, name: req.apiClient.name, scopes: req.apiClient.scopes },
      base: API_BASE,
      routes: SCOPES.map((s) => s.key),
    },
  });
});

// ── /stores ──────────────────────────────────────────────────────────────────

router.get('/stores', requireScope('stores'), wrap(async (_req, res) => {
  const [fromSales, accounts] = await Promise.all([data.storesFromSales(), storesRepo.listStores()]);
  res.json({
    data: {
      stores: fromSales,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        platform: a.platform,
        sellerName: a.platform_seller_name,
        status: a.status,
        active: a.active,
        totalListings: a.total_listings,
        lastSyncAt: a.last_sync_at,
      })),
    },
  });
}));

// ── /sales ───────────────────────────────────────────────────────────────────

router.get('/sales', requireScope('sales'), wrap(async (req, res) => {
  const { start, end } = dateRange(req.query, { defaultDays: 30 });
  const limit = clampInt(req.query.limit, { def: 500, min: 1, max: 5000 });
  const offset = clampInt(req.query.offset, { def: 0, min: 0, max: 1e9 });
  const filters = { start, end, ...filtersFrom(req.query) };
  const { rows, total } = await data.listSales(filters, { limit, offset });
  res.json({ data: rows, meta: { start, end, total, limit, offset, returned: rows.length } });
}));

router.get('/sales/summary', requireScope('sales'), wrap(async (req, res) => {
  const { start, end } = dateRange(req.query, { defaultDays: 30 });
  const groupBy = req.query.group_by || 'day';
  if (!data.GROUP_KEYS.includes(groupBy)) {
    throw badRequest(`group_by inválido. Use: ${data.GROUP_KEYS.join(', ')}.`);
  }
  const rows = await data.salesSummary({ start, end, ...filtersFrom(req.query) }, groupBy);
  const totals = rows.reduce((acc, r) => ({
    orders: acc.orders + r.orders,
    quantity: acc.quantity + r.quantity,
    revenue: Math.round((acc.revenue + r.revenue) * 100) / 100,
  }), { orders: 0, quantity: 0, revenue: 0 });
  res.json({ data: rows, meta: { start, end, groupBy, excludesCanceled: true, totals } });
}));

// ── /orders ──────────────────────────────────────────────────────────────────

router.get('/orders', requireScope('orders'), wrap(async (req, res) => {
  const { start, end } = dateRange(req.query, { defaultDays: 30 });
  const limit = clampInt(req.query.limit, { def: 200, min: 1, max: 2000 });
  const offset = clampInt(req.query.offset, { def: 0, min: 0, max: 1e9 });
  const { rows, total } = await data.listOrders({ start, end, ...filtersFrom(req.query) }, { limit, offset });
  res.json({ data: rows, meta: { start, end, total, limit, offset, returned: rows.length } });
}));

router.get('/orders/internal', requireScope('orders'), wrap(async (req, res) => {
  const limit = clampInt(req.query.limit, { def: 200, min: 1, max: 1000 });
  const rows = await ordersRepo.getOrders({
    status: req.query.status || undefined,
    type: req.query.type || undefined,
    search: req.query.search || undefined,
    limit,
  });
  res.json({ data: rows, meta: { limit, returned: rows.length, source: 'modulo-pedidos' } });
}));

router.get('/orders/:orderId', requireScope('orders'), wrap(async (req, res) => {
  const order = await data.getOrder(req.params.orderId);
  if (!order) return apiError(res, 404, 'not_found', 'Pedido não encontrado.');
  res.json({ data: order });
}));

// ── /products ────────────────────────────────────────────────────────────────

router.get('/products', requireScope('products'), wrap(async (req, res) => {
  const { codigo, nome, lojas } = req.query;
  const page = clampInt(req.query.page, { def: 1, min: 1, max: 1e6 });
  const limit = clampInt(req.query.limit, { def: 50, min: 1, max: 500 });
  const lojasArr = lojas ? String(lojas).split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const { rows, total } = await productsRepo.listProducts({ codigo: codigo || undefined, nome: nome || undefined, lojas: lojasArr, page, limit });
  res.json({ data: rows, meta: { total, page, limit, returned: rows.length } });
}));

// ── /stock ───────────────────────────────────────────────────────────────────

router.get('/stock', requireScope('stock'), wrap(async (req, res) => {
  const rows = await stockRepo.getProducts({
    search: req.query.search || undefined,
    includeInactive: String(req.query.include_inactive) === 'true',
  });
  res.json({ data: rows, meta: { returned: rows.length } });
}));

router.get('/stock/variants', requireScope('stock'), wrap(async (req, res) => {
  const rows = await data.stockVariants({ search: req.query.search || undefined });
  res.json({ data: rows, meta: { returned: rows.length } });
}));

router.get('/stock/low', requireScope('stock'), wrap(async (_req, res) => {
  const rows = await stockRepo.getLowStock({ fullGrid: false });
  res.json({ data: rows, meta: { returned: rows.length } });
}));

// ── /indicators (mesmos cálculos do Dashboard Vendas, com UMA consulta) ──────

router.get('/indicators', requireScope('indicators'), wrap(async (req, res) => {
  const today = getSaoPauloDate();
  const query = {
    start: req.query.start || `${today.slice(0, 7)}-01`,
    end: req.query.end || today,
  };
  if (!data.isDate(query.start) || !data.isDate(query.end)) throw badRequest('start e end devem estar no formato YYYY-MM-DD.');
  if (req.query.store) query.store = req.query.store;
  if (req.query.sale_channel) query.sale_channel = req.query.sale_channel;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'month';

  const sales = await salesRepository.getSales(query);
  const summary = metrics.getSummary(sales, query);
  res.json({
    data: {
      summary,
      byPeriod: metrics.getSalesByPeriod(sales, { ...query, period }),
      byStore: metrics.getSalesByStore(sales, query),
      byPlatform: metrics.getSalesByPlatform(sales, query),
      abc: metrics.getAbc(sales, query),
    },
    meta: { start: query.start, end: query.end, store: query.store || null, saleChannel: query.sale_channel || null, period },
  });
}));

// ── /marketplaces ────────────────────────────────────────────────────────────

router.get('/marketplaces', requireScope('marketplaces'), wrap(async (_req, res) => {
  const accounts = await storesRepo.listStores();
  const platforms = {};
  for (const a of accounts) {
    platforms[a.platform] = platforms[a.platform] || { platform: a.platform, accounts: [] };
    platforms[a.platform].accounts.push({
      id: a.id, name: a.name, sellerName: a.platform_seller_name, status: a.status,
      active: a.active, totalListings: a.total_listings, lastSyncAt: a.last_sync_at,
    });
  }
  res.json({
    data: Object.values(platforms),
    meta: {
      endpoints: {
        mercadolivre: ['/marketplaces/ml/anuncios?store_id=', '/marketplaces/ml/profit/stores', '/marketplaces/ml/profit?store=&date='],
      },
    },
  });
}));

router.get('/marketplaces/ml/anuncios', requireScope('marketplaces'), wrap(async (req, res) => {
  const { buildAnunciosReport } = require('./anuncios');
  const report = await buildAnunciosReport(req.query.store_id);
  res.json({ data: report.items, meta: { storeId: report.store_id, storeName: report.store_name, total: report.total } });
}));

router.get('/marketplaces/ml/profit/stores', requireScope('marketplaces'), wrap(async (_req, res) => {
  const stores = await listMlStoreLabels();
  res.json({ data: stores, meta: { defaultDate: getSaoPauloDate(-1) } });
}));

router.get('/marketplaces/ml/profit', requireScope('marketplaces'), wrap(async (req, res) => {
  const { store, date } = req.query;
  if (!store) throw badRequest('Parâmetro store é obrigatório (ver /marketplaces/ml/profit/stores).');

  // Um dia: mesma resposta da tela Lucro ML
  if (date || (!req.query.start && !req.query.end)) {
    const day = date || getSaoPauloDate(-1);
    if (!data.isDate(day)) throw badRequest('Parâmetro date deve estar no formato YYYY-MM-DD.');
    const report = await getReportData({ store, date: day });
    return res.json({
      data: {
        orders: report.rows,
        byAd: report.resumo,
        totals: report.totals,
        canceled: report.cancelados,
        canceledSummary: report.canceladosResumo,
      },
      meta: { store, date: day, nfPct: report.nfPct },
    });
  }

  // Intervalo: consolida dia a dia (máx. 62 dias)
  const { start, end } = dateRange(req.query, { defaultDays: 7, maxDays: 62 });
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const orders = [];
  const canceled = [];
  const byDay = [];
  for (const day of days) {
    const r = await getReportData({ store, date: day });
    orders.push(...r.rows.map((row) => ({ date: day, ...row })));
    canceled.push(...r.cancelados.map((row) => ({ date: day, ...row })));
    byDay.push({ date: day, ...r.totals, canceled: r.canceladosResumo });
  }
  const { totals, resumo } = aggregate(orders);
  res.json({
    data: {
      orders,
      byAd: resumo,
      byDay,
      totals,
      canceled,
      canceledSummary: { count: canceled.length, fat: Math.round(canceled.reduce((a, r) => a + (r.fat || 0), 0) * 100) / 100 },
    },
    meta: { store, start, end, days: days.length, nfPct: NF_PCT },
  });
}));

// ── 404 padronizado dentro de /api/v1 ────────────────────────────────────────

router.use((req, res) => apiError(res, 404, 'not_found', `Rota ${req.method} ${req.originalUrl} não existe na API v1.`));

module.exports = router;
