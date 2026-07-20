const db = require('../db/connection');
const storesRepo = require('../db/storesRepository');
const { getValidMlToken } = require('./mlTokenService');

/**
 * Coleta dos valores REAIS de cada venda no Mercado Livre (comissão, frete,
 * estorno/bonificação) via API oficial, persistindo nas colunas ml_* de sales.
 *
 * Convenção de sinais (igual ao detalhe da venda no ML):
 *   ml_fee_amount    <= 0  (tarifa de venda)
 *   ml_shipping_cost <= 0  (envios pagos pelo vendedor)
 *   ml_bonus_amount  >= 0  (estorno / bonificação)
 *   ml_net_received  = total + fee + shipping + bonus
 */

const ML_API = 'https://api.mercadolibre.com';

// Dia local (BRT, UTC-3, sem horário de verão): D 03:00Z → D+1 03:00Z
function dayWindowUtc(dateStr) {
  const start = `${dateStr} 03:00:00`;
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const end = `${d.toISOString().slice(0, 10)} 03:00:00`;
  return { start, end };
}

// "Basico Mais Criativo(Mercado Livre)" -> "basicomaiscriativo"
function normalizeLabel(label) {
  return String(label || '')
    .replace(/\(.*?\)/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve qual loja conectada (tabela stores) é dona do rótulo usado em
 * sales.store. Tenta: vínculo por cod_store, nome exato normalizado e
 * prefixo do platform_seller_name (ex.: "sonhomeu" ⊂ "sonhomeumodainfantil").
 */
async function resolveStoreForSalesLabel(salesStoreLabel) {
  const { rows } = await db.query(
    `SELECT DISTINCT cod_store FROM sales WHERE store = $1 AND cod_store IS NOT NULL LIMIT 1`,
    [salesStoreLabel]
  );
  if (rows[0]?.cod_store) {
    const store = await storesRepo.getStoreCredentials(rows[0].cod_store);
    if (store && store.platform === 'mercadolivre') return store;
  }

  const all = await storesRepo.listStores();
  const mlStores = all.filter((s) => s.platform === 'mercadolivre' && s.active);
  const target = normalizeLabel(salesStoreLabel);

  let match = mlStores.find((s) => normalizeLabel(s.name) === target);
  if (!match) {
    match = mlStores.find((s) => {
      const seller = normalizeLabel(s.platform_seller_name);
      return seller && (seller.startsWith(target) || target.startsWith(seller));
    });
  }
  if (!match) return null;
  return storesRepo.getStoreCredentials(match.id);
}

async function mlGet(path, token) {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `HTTP ${res.status} em ${path}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Busca no ML os valores financeiros de um pedido.
 * Retorna { fee, shipping, bonus, paidAmount, raw } — fee/shipping negativos.
 *
 * ⚠️ Semântica validada contra o relatório de referência de 16/07/2026
 * (README do handover, seção 9.9). Use GET /api/ml-profit/debug-order para
 * conferir os payloads brutos caso algum valor não bata com a tela do ML.
 */
async function fetchOrderFees(orderId, token) {
  const order = await mlGet(`/orders/${orderId}`, token);

  // ── Comissão (tarifa de venda) ─────────────────────────────────────────
  // Preferência: payments[].marketplace_fee (total do pagamento aprovado).
  // Fallback: order_items[].sale_fee (valor por unidade) × quantidade.
  let fee = 0;
  const approved = (order.payments || []).filter(
    (p) => p.status === 'approved' || p.status === 'accredited'
  );
  const mkFee = approved.reduce((sum, p) => sum + (Number(p.marketplace_fee) || 0), 0);
  if (mkFee > 0) {
    fee = mkFee;
  } else {
    fee = (order.order_items || []).reduce(
      (sum, it) => sum + (Number(it.sale_fee) || 0) * (Number(it.quantity) || 1),
      0
    );
  }

  // ── Frete + estorno ────────────────────────────────────────────────────
  // /shipments/{id}/costs: senders[].cost é o líquido pago pelo vendedor;
  // discounts/compensations são as bonificações que o ML devolve.
  // No relatório: Frete = custo bruto (negativo) e Estorno = crédito (positivo),
  // de modo que frete + estorno = custo líquido do envio.
  let shippingGross = 0;
  let bonus = 0;
  let shipCosts = null;
  const shipmentId = order.shipping?.id;
  if (shipmentId) {
    try {
      shipCosts = await mlGet(`/shipments/${shipmentId}/costs`, token);
      for (const sender of shipCosts.senders || []) {
        const netCost = Number(sender.cost) || 0;
        const discounts = (sender.discounts || []).reduce(
          (sum, d) => sum + (Number(d.promoted_amount) || 0),
          0
        );
        const compensation = Number(sender.compensation) || 0;
        shippingGross += netCost + discounts;
        bonus += discounts + compensation;
      }
    } catch (err) {
      // Envio sem custos consultáveis (ex.: retirada) — segue com frete 0
      if (err.status !== 404) throw err;
    }
  }

  return {
    fee: round2(-Math.abs(fee)),
    shipping: round2(-Math.abs(shippingGross)),
    bonus: round2(Math.abs(bonus)),
    paidAmount: Number(order.paid_amount) || null,
    raw: { order, shipCosts },
  };
}

/**
 * Lista os pedidos ML de um dia (rótulo de sales.store) que ainda não têm
 * valores sincronizados (ou todos, com force=true).
 */
async function listPendingOrders(salesStoreLabel, dateStr, force = false) {
  const { start, end } = dayWindowUtc(dateStr);
  const { rows } = await db.query(
    `SELECT platform_order_id,
            SUM(total)::float AS total,
            BOOL_OR(ml_fees_synced_at IS NOT NULL) AS synced
     FROM sales
     WHERE platform = 'Mercado Livre'
       AND store = $1
       AND date >= $2::timestamp AND date < $3::timestamp
       AND platform_order_id IS NOT NULL
       AND status IS DISTINCT FROM 'Cancelado'
     GROUP BY platform_order_id
     ${force ? '' : 'HAVING BOOL_OR(ml_fees_synced_at IS NOT NULL) = false'}`,
    [salesStoreLabel, start, end]
  );
  return rows;
}

async function persistOrderFees(orderId, { fee, shipping, bonus, total }) {
  const net = round2(total + fee + shipping + bonus);
  await db.query(
    `UPDATE sales
     SET ml_fee_amount = $2,
         ml_shipping_cost = $3,
         ml_bonus_amount = $4,
         ml_net_received = $5,
         ml_fees_synced_at = NOW()
     WHERE platform_order_id = $1 AND platform = 'Mercado Livre'`,
    [orderId, fee, shipping, bonus, net]
  );
}

/**
 * Sincroniza os valores reais de todos os pedidos de um dia de uma loja.
 * Idempotente: pedidos já sincronizados são pulados (a menos de force=true).
 */
async function syncDayFees({ store: salesStoreLabel, date, force = false }) {
  const storeCreds = await resolveStoreForSalesLabel(salesStoreLabel);
  if (!storeCreds) {
    throw new Error(
      `Nenhuma loja ML conectada corresponde a "${salesStoreLabel}". ` +
      `Cadastre/conecte a loja em Lojas → Gerenc. de Lojas.`
    );
  }

  const token = await getValidMlToken(storeCreds);
  const pending = await listPendingOrders(salesStoreLabel, date, force);

  const result = { store: salesStoreLabel, date, total: pending.length, ok: 0, errors: [] };
  const CONCURRENCY = 5;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (row) => {
        try {
          const fees = await fetchOrderFees(row.platform_order_id, token);
          await persistOrderFees(row.platform_order_id, {
            fee: fees.fee,
            shipping: fees.shipping,
            bonus: fees.bonus,
            total: Number(row.total) || 0,
          });
          result.ok += 1;
        } catch (err) {
          result.errors.push({ order_id: row.platform_order_id, message: err.message });
        }
      })
    );
  }

  console.log(
    `[ML Fees] ${salesStoreLabel} ${date}: ${result.ok}/${result.total} pedidos sincronizados` +
    (result.errors.length ? ` (${result.errors.length} erros)` : '')
  );
  return result;
}

module.exports = {
  dayWindowUtc,
  resolveStoreForSalesLabel,
  fetchOrderFees,
  syncDayFees,
};
