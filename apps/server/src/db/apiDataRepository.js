/**
 * Consultas SQL da API externa (/api/v1).
 *
 * Diferente das telas (que carregam tudo e agregam em memória), aqui cada
 * endpoint faz UMA consulta já filtrada/paginada/agrupada no Postgres.
 */
const db = require('./connection');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(v) { return typeof v === 'string' && DATE_RE.test(v); }

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Monta WHERE + params para filtros de vendas. `end` é inclusivo (dia inteiro). */
function salesWhere({ start, end, store, platform, sale_channel, status, exclude_canceled }, params = []) {
  const conds = [];
  const add = (sql, val) => { params.push(val); conds.push(sql.replace('?', `$${params.length}`)); };
  if (isDate(start)) add('s.date >= ?::date', start);
  if (isDate(end)) add('s.date < (?::date + 1)', end);
  if (store) add('s.store = ?', store);
  if (platform) add('s.platform = ?', platform);
  if (sale_channel) add('s.sale_channel = ?', sale_channel);
  if (status) add('s.status = ?', status);
  if (exclude_canceled) conds.push(`COALESCE(s.status, '') <> 'Cancelado'`);
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

const SALE_COLUMNS = `
  s.id,
  s.order_id            AS "orderId",
  s.platform_order_id   AS "platformOrderId",
  s.date,
  s.store,
  s.cod_store           AS "storeId",
  s.platform,
  s.sale_channel        AS "saleChannel",
  s.status,
  s.product,
  s.ad_name             AS "adName",
  s.variation,
  s.sku,
  s.quantity::float     AS quantity,
  s.unit_price::float   AS "unitPrice",
  s.discount::float     AS discount,
  s.total::float        AS total,
  s.state,
  s.client_name         AS "clientName",
  s.codcli,
  s.nome_fantasia       AS "nomeFantasia",
  s.cnpj_cpf            AS "cnpjCpf",
  s.cancel_by           AS "cancelBy",
  s.cancel_reason       AS "cancelReason",
  s.product_url         AS "productUrl",
  s.ml_fee_amount::float    AS "mlFeeAmount",
  s.ml_shipping_cost::float AS "mlShippingCost",
  s.ml_bonus_amount::float  AS "mlBonusAmount",
  s.ml_net_received::float  AS "mlNetReceived",
  s.ml_fees_synced_at       AS "mlFeesSyncedAt"
`;

// ── Vendas (linhas) ──────────────────────────────────────────────────────────

async function listSales(filters, { limit = 500, offset = 0 } = {}) {
  const { where, params } = salesWhere(filters);
  const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM sales s ${where}`, params);
  const total = countRes.rows[0]?.total || 0;

  const pageParams = [...params, limit, offset];
  const { rows } = await db.query(
    `SELECT ${SALE_COLUMNS}
       FROM sales s
       ${where}
      ORDER BY s.date DESC, s.id DESC
      LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );
  return { rows, total };
}

const GROUP_EXPR = {
  day:      { expr: `to_char(s.date, 'YYYY-MM-DD')`, label: 'day' },
  week:     { expr: `to_char(date_trunc('week', s.date), 'YYYY-MM-DD')`, label: 'week' },
  month:    { expr: `to_char(s.date, 'YYYY-MM')`, label: 'month' },
  store:    { expr: `s.store`, label: 'store' },
  platform: { expr: `COALESCE(s.platform, 'Não informado')`, label: 'platform' },
  channel:  { expr: `COALESCE(s.sale_channel, 'online')`, label: 'channel' },
};

/** Totais agrupados (exclui cancelados, como o dashboard). */
async function salesSummary(filters, groupBy = 'day') {
  const g = GROUP_EXPR[groupBy] || GROUP_EXPR.day;
  const { where, params } = salesWhere({ ...filters, exclude_canceled: true });
  const { rows } = await db.query(
    `SELECT ${g.expr} AS key,
            COUNT(DISTINCT s.order_id)::int AS orders,
            SUM(s.quantity)::float          AS quantity,
            SUM(s.total)::float             AS revenue
       FROM sales s
       ${where}
      GROUP BY 1
      ORDER BY 1`,
    params
  );
  return rows.map((r) => ({
    [g.label]: r.key,
    orders: r.orders,
    quantity: num(r.quantity),
    revenue: Math.round(num(r.revenue) * 100) / 100,
    ticketAverage: r.orders ? Math.round((num(r.revenue) / r.orders) * 100) / 100 : 0,
  }));
}

// ── Pedidos (agrupados por nº do pedido) ─────────────────────────────────────

const ORDER_SELECT = `
  SELECT s.order_id                       AS "orderId",
         MIN(s.platform_order_id)         AS "platformOrderId",
         MIN(s.date)                      AS date,
         MIN(s.store)                     AS store,
         MIN(s.cod_store)                 AS "storeId",
         MIN(s.platform)                  AS platform,
         MIN(s.sale_channel)              AS "saleChannel",
         MIN(s.status)                    AS status,
         MIN(s.state)                     AS state,
         MIN(s.client_name)               AS "clientName",
         MIN(s.codcli)                    AS codcli,
         MIN(s.nome_fantasia)             AS "nomeFantasia",
         MIN(s.cnpj_cpf)                  AS "cnpjCpf",
         SUM(s.quantity)::float           AS quantity,
         SUM(s.total)::float              AS total,
         SUM(s.discount)::float           AS discount,
         MAX(s.ml_fee_amount)::float      AS "mlFeeAmount",
         MAX(s.ml_shipping_cost)::float   AS "mlShippingCost",
         MAX(s.ml_bonus_amount)::float    AS "mlBonusAmount",
         MAX(s.ml_net_received)::float    AS "mlNetReceived",
         json_agg(json_build_object(
           'id', s.id,
           'product', s.product,
           'adName', s.ad_name,
           'variation', s.variation,
           'sku', s.sku,
           'quantity', s.quantity::float,
           'unitPrice', s.unit_price::float,
           'discount', s.discount::float,
           'total', s.total::float,
           'status', s.status,
           'cancelReason', s.cancel_reason,
           'productUrl', s.product_url
         ) ORDER BY s.id)                 AS items
    FROM sales s
`;

async function listOrders(filters, { limit = 200, offset = 0 } = {}) {
  const { where, params } = salesWhere(filters);
  const countRes = await db.query(`SELECT COUNT(DISTINCT s.order_id)::int AS total FROM sales s ${where}`, params);
  const total = countRes.rows[0]?.total || 0;

  const pageParams = [...params, limit, offset];
  const { rows } = await db.query(
    `${ORDER_SELECT}
     ${where}
     GROUP BY s.order_id
     ORDER BY MIN(s.date) DESC
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );
  return { rows, total };
}

async function getOrder(orderId) {
  const { rows } = await db.query(
    `${ORDER_SELECT}
     WHERE s.order_id = $1 OR s.platform_order_id = $1
     GROUP BY s.order_id
     ORDER BY MIN(s.date) DESC
     LIMIT 1`,
    [String(orderId)]
  );
  return rows[0] || null;
}

// ── Lojas ────────────────────────────────────────────────────────────────────

async function storesFromSales() {
  const { rows } = await db.query(
    `SELECT s.store,
            MIN(s.cod_store)                        AS "storeId",
            MIN(s.platform)                         AS platform,
            COALESCE(MIN(s.sale_channel), 'online') AS "saleChannel",
            MIN(s.date)::date                       AS "firstSale",
            MAX(s.date)::date                       AS "lastSale",
            COUNT(DISTINCT s.order_id)::int         AS orders
       FROM sales s
      GROUP BY s.store
      ORDER BY s.store`
  );
  return rows;
}

// ── Estoque (lista plana) ────────────────────────────────────────────────────

async function stockVariants({ search } = {}) {
  const params = [];
  let where = 'WHERE p.active = true AND v.active = true';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (p.codigo ILIKE $1 OR p.descricao ILIKE $1)`;
  }
  const { rows } = await db.query(
    `SELECT v.id            AS "variantId",
            v.codigo        AS "variantCodigo",
            v.tamanho,
            v.balance,
            v.min_stock     AS "minStock",
            v.avg_cost::float AS "avgCost",
            (v.min_stock > 0 AND v.balance <= v.min_stock) AS low,
            p.id            AS "productId",
            p.codigo        AS "productCodigo",
            p.descricao,
            p.familia,
            p.default_kit_qty AS "defaultKitQty",
            p.image_url     AS "imageUrl"
       FROM stock_variants v
       JOIN stock_products p ON p.id = v.product_id
       ${where}
      ORDER BY p.codigo, v.sort_order, v.tamanho`,
    params
  );
  return rows;
}

module.exports = {
  isDate,
  listSales,
  salesSummary,
  listOrders,
  getOrder,
  storesFromSales,
  stockVariants,
  GROUP_KEYS: Object.keys(GROUP_EXPR),
};
