const db = require('../db/connection');
const storesRepo = require('../db/storesRepository');
const { getValidMlToken, refreshMlToken } = require('./mlTokenService');

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

/**
 * Fornece o access token da loja com renovação REATIVA: se uma chamada levar
 * 401 (token de 6h expirado — comum quando token_expires_at não foi gravado),
 * renova via refresh_token e repete. O refresh é deduplicado para não usar o
 * mesmo refresh_token duas vezes em paralelo (o ML rotaciona a cada uso).
 */
function createTokenProvider(storeId) {
  let token = null;
  let refreshing = null;
  return {
    async get() {
      if (!token) {
        const creds = await storesRepo.getStoreCredentials(storeId);
        if (!creds) throw new Error(`Loja ${storeId} não encontrada.`);
        token = await getValidMlToken(creds);
      }
      return token;
    },
    async refresh() {
      if (!refreshing) {
        refreshing = (async () => {
          // Recarrega as credenciais para usar o refresh_token mais atual
          const creds = await storesRepo.getStoreCredentials(storeId);
          token = await refreshMlToken(creds);
          return token;
        })().finally(() => { refreshing = null; });
      }
      return refreshing;
    },
  };
}

async function mlGet(path, tokens) {
  const call = async () =>
    fetch(`${ML_API}${path}`, {
      headers: { Authorization: `Bearer ${await tokens.get()}`, Accept: 'application/json' },
    });

  let res = await call();
  if (res.status === 401) {
    await tokens.refresh();
    res = await call();
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `HTTP ${res.status} em ${path}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Percentual da tarifa de venda por categoria+tipo de anúncio+PREÇO.
// ⚠️ O preço FAZ PARTE da chave: o ML muda o percentual por faixa de preço
// (ex.: 19% abaixo de R$150, 15% a partir de R$150) — cachear sem o preço
// causou tarifa errada em pedidos >= R$150. Fonte: API oficial listing_prices.
const feePctCache = new Map();

async function getSaleFeePct(categoryId, listingTypeId, price, tokens) {
  if (!categoryId || !listingTypeId || !(price > 0)) return null;
  const key = `${categoryId}|${listingTypeId}|${price.toFixed(2)}`;
  if (feePctCache.has(key)) return feePctCache.get(key);

  let pct = null;
  try {
    const body = await mlGet(
      `/sites/MLB/listing_prices?price=${encodeURIComponent(price)}` +
      `&listing_type_id=${encodeURIComponent(listingTypeId)}` +
      `&category_id=${encodeURIComponent(categoryId)}`,
      tokens
    );
    const entry = Array.isArray(body)
      ? body.find((b) => b.listing_type_id === listingTypeId) || body[0]
      : body;
    const det = entry?.sale_fee_details;
    if (det?.percentage_fee != null) {
      pct = Number(det.percentage_fee);
    } else if (det?.gross_amount != null) {
      // gross_amount = parcela percentual da tarifa para o preço consultado
      pct = round2((Number(det.gross_amount) / price) * 100);
    }
    if (!(pct > 0 && pct < 100)) pct = null;
  } catch {
    pct = null;
  }
  feePctCache.set(key, pct);
  return pct;
}

/**
 * Busca no ML os valores financeiros de um pedido (ou pack/carrinho).
 * Retorna { fee, shipping, bonus, paidAmount, raw } — fee/shipping negativos.
 *
 * ⚠️ Semântica calibrada contra a tela "detalhe da venda" do ML em 20/07/2026
 * (6 pedidos conferidos lado a lado com o relatório de referência de 16/07):
 *   order_items[].sale_fee vem JÁ LÍQUIDO da bonificação (valor por unidade).
 *   Comissão (tarifa cheia) = % da categoria (listing_prices) × preço × qtd
 *   Estorno  (bonificação)  = tarifa cheia − tarifa líquida real
 *   Frete    = custo líquido do vendedor = Σ senders[].cost de /shipments/costs
 * O líquido (fat + comissão + frete + estorno) fecha com o repassado pelo ML;
 * se o percentual da categoria não puder ser obtido, cai para comissão líquida
 * com estorno 0 (mesmo líquido). Use /api/ml-profit/debug-order para conferir.
 */
async function fetchOrderFees(orderId, tokens) {
  // Pedido normal, ou pack (carrinho com vários pedidos) quando /orders dá 404
  let orders;
  let pack = null;
  try {
    orders = [await mlGet(`/orders/${orderId}`, tokens)];
  } catch (err) {
    if (err.status !== 404) throw err;
    pack = await mlGet(`/packs/${orderId}`, tokens);
    orders = [];
    for (const o of pack.orders || []) {
      orders.push(await mlGet(`/orders/${o.id}`, tokens));
    }
    if (!orders.length) throw err;
  }

  let saleFee = 0;
  let mkFee = 0;
  let paid = 0;
  let fullFee = 0;
  let itemsTotal = 0;
  let fullOk = true;
  const feeQuotes = [];
  const shipmentIds = new Set();

  for (const order of orders) {
    for (const it of order.order_items || []) {
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unit_price) || 0;
      saleFee += (Number(it.sale_fee) || 0) * qty;
      itemsTotal += price * qty;

      const pct = await getSaleFeePct(it.item?.category_id, it.listing_type_id, price, tokens);
      feeQuotes.push({ item: it.item?.id, category: it.item?.category_id, price, pct });
      if (pct == null) fullOk = false;
      else fullFee += round2((pct / 100) * price) * qty;
    }
    const approved = (order.payments || []).filter(
      (p) => p.status === 'approved' || p.status === 'accredited'
    );
    mkFee += approved.reduce((sum, p) => sum + (Number(p.marketplace_fee) || 0), 0);
    paid += Number(order.paid_amount) || 0;
    if (order.shipping?.id) shipmentIds.add(order.shipping.id);
  }

  // Tarifa líquida realmente cobrada (sale_fee já vem líquido da bonificação)
  const netFee = saleFee > 0 ? round2(saleFee) : round2(mkFee);
  let fee = netFee;
  let bonus = 0;
  let source = saleFee > 0 ? 'sale_fee_net' : 'marketplace_fee_net';
  if (fullOk && fullFee > netFee + 0.009) {
    fee = round2(fullFee);
    bonus = round2(fullFee - netFee);
    source = 'listing_prices';
  }
  // % efetivo da tarifa exibida (auditoria: deve bater com o % da tela do ML)
  const feePct = itemsTotal > 0 ? round2((100 * fee) / itemsTotal) : null;

  let shipping = 0;
  const shipCosts = [];
  for (const shipmentId of shipmentIds) {
    try {
      const costs = await mlGet(`/shipments/${shipmentId}/costs`, tokens);
      shipCosts.push(costs);
      shipping += (costs.senders || []).reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
    } catch (err) {
      // Envio sem custos consultáveis (ex.: retirada) — segue com frete 0
      if (err.status !== 404) throw err;
    }
  }

  return {
    fee: round2(-Math.abs(fee)),
    shipping: round2(-Math.abs(shipping)),
    bonus: round2(Math.abs(bonus)),
    paidAmount: paid || null,
    feePct,
    source,
    raw: { orders, pack, shipCosts, feeQuotes },
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

async function persistOrderFees(orderId, { fee, shipping, bonus, total, feePct, source }) {
  const net = round2(total + fee + shipping + bonus);
  await db.query(
    `UPDATE sales
     SET ml_fee_amount = $2,
         ml_shipping_cost = $3,
         ml_bonus_amount = $4,
         ml_net_received = $5,
         ml_fee_pct = $6,
         ml_fees_source = $7,
         ml_fees_synced_at = NOW()
     WHERE platform_order_id = $1 AND platform = 'Mercado Livre'`,
    [orderId, fee, shipping, bonus, net, feePct, source]
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

  const tokens = createTokenProvider(storeCreds.id);
  await tokens.get(); // valida o acesso antes de começar
  const pending = await listPendingOrders(salesStoreLabel, date, force);

  const result = { store: salesStoreLabel, date, total: pending.length, ok: 0, errors: [] };
  const CONCURRENCY = 5;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (row) => {
        try {
          const fees = await fetchOrderFees(row.platform_order_id, tokens);
          await persistOrderFees(row.platform_order_id, {
            fee: fees.fee,
            shipping: fees.shipping,
            bonus: fees.bonus,
            total: Number(row.total) || 0,
            feePct: fees.feePct,
            source: fees.source,
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
  for (const e of result.errors.slice(0, 5)) {
    console.warn(`[ML Fees]   pedido ${e.order_id}: ${e.message}`);
  }
  return result;
}

module.exports = {
  dayWindowUtc,
  resolveStoreForSalesLabel,
  createTokenProvider,
  fetchOrderFees,
  syncDayFees,
};
