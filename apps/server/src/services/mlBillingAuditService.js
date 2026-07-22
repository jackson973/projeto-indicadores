const db = require('../db/connection');
const {
  dayWindowUtc,
  resolveStoreForSalesLabel,
  createTokenProvider,
  mlGet,
} = require('./mlOrderFeesService');

/**
 * Auditoria via API de billing do ML (fonte oficial do que foi FATURADO).
 *
 * Compara, pedido a pedido, o que o relatório calculou (tarifa líquida +
 * frete líquido) com a soma das cobranças/bonificações que o ML lançou no
 * período de faturamento — e aponta divergências.
 *
 * Observações:
 * - O billing pode ter defasagem: pedidos muito recentes podem ainda não ter
 *   cobrança lançada → contados como "sem billing", não como divergência.
 * - Pedidos de carrinho (pack) são faturados pelos pedidos internos; quando o
 *   id não encontra cobrança, tentamos resolver via /packs/{id}.
 */

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Período mensal do billing: chave = primeiro dia do mês da venda
function billingPeriodKey(date) {
  return `${date.slice(0, 7)}-01`;
}

function lineOrderId(line) {
  const id =
    line.order_id ??
    (Array.isArray(line.sales_info) ? line.sales_info[0]?.order_id : line.sales_info?.order_id) ??
    line.sale_info?.order_id ??
    null;
  return id != null ? String(id) : null;
}

function lineAmount(line) {
  return Number(line.detail_amount ?? line.amount ?? line.total_amount) || 0;
}

function lineType(line) {
  return [line.detail_type, line.detail_sub_type].filter(Boolean).join('/') || 'desconhecido';
}

async function fetchDetailsForOrders(tokens, periodKey, orderIds) {
  const lines = [];
  const CHUNK = 20;
  const LIMIT = 150;
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const ids = orderIds.slice(i, i + CHUNK).join(',');
    let offset = 0;
    for (;;) {
      const body = await mlGet(
        `/billing/integration/periods/key/${periodKey}/group/ML/details` +
        `?order_ids=${ids}&limit=${LIMIT}&offset=${offset}`,
        tokens
      );
      const results = Array.isArray(body) ? body : body.results || body.details || [];
      lines.push(...results);
      if (results.length < LIMIT) break;
      offset += LIMIT;
    }
  }
  return lines;
}

/**
 * Audita um dia de uma loja. Retorna resumo + lista de divergências.
 */
async function auditDay({ store, date }) {
  const creds = await resolveStoreForSalesLabel(store);
  if (!creds) throw new Error(`Nenhuma loja ML conectada corresponde a "${store}".`);
  const tokens = createTokenProvider(creds.id);

  const { start, end } = dayWindowUtc(date);
  const { rows } = await db.query(
    `SELECT platform_order_id AS oid,
            SUM(total)::float             AS fat,
            MAX(ml_fee_amount)::float     AS fee,
            MAX(ml_bonus_amount)::float   AS bonus,
            MAX(ml_shipping_cost)::float  AS ship
     FROM sales
     WHERE platform = 'Mercado Livre'
       AND store = $1
       AND date >= $2::timestamp AND date < $3::timestamp
       AND platform_order_id IS NOT NULL
       AND status IS DISTINCT FROM 'Cancelado'
       AND ml_fees_synced_at IS NOT NULL
     GROUP BY platform_order_id`,
    [store, start, end]
  );

  const periodKey = billingPeriodKey(date);
  if (!rows.length) {
    return { store, date, periodKey, totalPedidos: 0, orders: [], divergentes: [], semBilling: [] };
  }

  // 1ª passada: busca as linhas de billing pelos ids que temos
  const lines = await fetchDetailsForOrders(tokens, periodKey, rows.map((r) => r.oid));
  const byOrder = new Map();
  for (const line of lines) {
    const oid = lineOrderId(line);
    if (!oid) continue;
    if (!byOrder.has(oid)) byOrder.set(oid, []);
    byOrder.get(oid).push(line);
  }

  // 2ª passada: ids sem linha podem ser packs — resolve os pedidos internos
  for (const r of rows) {
    if (byOrder.has(r.oid)) continue;
    try {
      const pack = await mlGet(`/packs/${r.oid}`, tokens);
      const innerIds = (pack.orders || []).map((o) => String(o.id));
      if (!innerIds.length) continue;
      const innerLines = await fetchDetailsForOrders(tokens, periodKey, innerIds);
      if (innerLines.length) byOrder.set(r.oid, innerLines);
    } catch {
      // não é pack / sem acesso — fica como "sem billing"
    }
  }

  const byTypeTotals = {};
  const orders = rows.map((r) => {
    const ls = byOrder.get(r.oid) || [];
    const billed = round2(ls.reduce((a, l) => a + lineAmount(l), 0));
    const byType = {};
    for (const l of ls) {
      const t = lineType(l);
      byType[t] = round2((byType[t] || 0) + lineAmount(l));
      byTypeTotals[t] = round2((byTypeTotals[t] || 0) + lineAmount(l));
    }
    const oursTarifa = round2(Math.abs(r.fee || 0) - (r.bonus || 0)); // tarifa líquida
    const oursFrete = round2(Math.abs(r.ship || 0));
    const ours = round2(oursTarifa + oursFrete);
    const diff = round2(billed - ours);
    return {
      oid: r.oid,
      fat: round2(Number(r.fat) || 0),
      oursTarifa,
      oursFrete,
      ours,
      billed,
      byType,
      diff,
      temBilling: ls.length > 0,
      ok: ls.length > 0 && Math.abs(diff) <= 0.05,
    };
  });

  const comBilling = orders.filter((o) => o.temBilling);
  const divergentes = comBilling.filter((o) => !o.ok);
  const semBilling = orders.filter((o) => !o.temBilling);

  return {
    store,
    date,
    periodKey,
    totalPedidos: orders.length,
    auditados: comBilling.length,
    conferem: comBilling.length - divergentes.length,
    divergentes,
    semBilling: semBilling.map((o) => o.oid),
    totals: {
      ours: round2(comBilling.reduce((a, o) => a + o.ours, 0)),
      billed: round2(comBilling.reduce((a, o) => a + o.billed, 0)),
      diff: round2(comBilling.reduce((a, o) => a + o.diff, 0)),
    },
    byTypeTotals,
  };
}

module.exports = { auditDay, billingPeriodKey };
