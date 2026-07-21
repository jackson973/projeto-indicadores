const db = require('../db/connection');
const { dayWindowUtc } = require('./mlOrderFeesService');

/**
 * Monta os dados do Relatório de Lucro por Venda (Mercado Livre).
 *
 * Fórmula validada (handover, seção 5):
 *   Líquido ML = Faturamento + Comissão + Frete + Estorno  (comissão/frete negativos)
 *   NF         = 8% × Faturamento (premissa do cliente)
 *   Custo      = kit_qty × custo_estoque × quantidade
 *   Lucro      = Líquido ML − NF − Custo
 *   Margem     = Lucro ÷ Faturamento
 */

const NF_PCT = Number(process.env.ML_PROFIT_NF_PCT || 0.08);

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Uma linha por pedido ML do dia, com custo resolvido pelo vínculo
 * anúncio → produto de estoque (Gerenciar Anúncios) e valores reais ml_*.
 */
async function getReportRows({ store, date }) {
  const { start, end } = dayWindowUtc(date);
  const { rows } = await db.query(
    `WITH pm AS (
       SELECT DISTINCT ON (nome) nome, kit_qty, stock_product_id
       FROM products
       WHERE stock_product_id IS NOT NULL
       ORDER BY nome, updated_at DESC
     ),
     linhas AS (
       SELECT s.platform_order_id,
              s.ad_name,
              s.product_url,
              s.quantity::float            AS quantity,
              s.total::float               AS total,
              s.ml_fee_amount::float       AS ml_fee,
              s.ml_shipping_cost::float    AS ml_ship,
              s.ml_bonus_amount::float     AS ml_bonus,
              s.ml_fee_pct::float          AS ml_fee_pct,
              s.ml_fees_source,
              s.ml_fees_synced_at,
              pm.kit_qty,
              COALESCE(cc.cost, sp.initial_cost)::float AS custo_unitario
       FROM sales s
       LEFT JOIN pm ON pm.nome = s.ad_name
       LEFT JOIN stock_products sp ON sp.id = pm.stock_product_id
       LEFT JOIN LATERAL (
         SELECT c.cost FROM stock_product_costs c
         WHERE c.product_id = sp.id AND c.valid_until IS NULL
         ORDER BY c.valid_from DESC LIMIT 1
       ) cc ON true
       WHERE s.platform = 'Mercado Livre'
         AND s.store = $1
         AND s.date >= $2::timestamp AND s.date < $3::timestamp
         AND s.platform_order_id IS NOT NULL
         AND s.status IS DISTINCT FROM 'Cancelado'
     )
     SELECT platform_order_id,
            MIN(ad_name)      AS ad_name,
            MIN(product_url)  AS product_url,
            SUM(quantity)     AS qty,
            SUM(total)        AS fat,
            MAX(ml_fee)       AS comissao,
            MAX(ml_ship)      AS frete,
            MAX(ml_bonus)     AS estorno,
            MAX(ml_fee_pct)   AS fee_pct,
            MIN(ml_fees_source) AS fees_source,
            BOOL_OR(ml_fees_synced_at IS NOT NULL) AS fees_ok,
            SUM(CASE WHEN kit_qty IS NOT NULL AND custo_unitario IS NOT NULL
                     THEN kit_qty * custo_unitario * quantity END) AS custo,
            COUNT(*) FILTER (WHERE kit_qty IS NULL OR custo_unitario IS NULL) AS linhas_sem_custo
     FROM linhas
     GROUP BY platform_order_id
     ORDER BY MIN(ad_name), SUM(total) DESC`,
    [store, start, end]
  );

  return rows.map((r) => {
    const fat = Number(r.fat) || 0;
    const feesOk = r.fees_ok === true;
    const comissao = feesOk ? Number(r.comissao) || 0 : null;
    const frete = feesOk ? Number(r.frete) || 0 : null;
    const estorno = feesOk ? Number(r.estorno) || 0 : null;
    const temCusto = Number(r.linhas_sem_custo) === 0 && r.custo !== null;
    const custo = temCusto ? round2(Number(r.custo)) : null;
    const liquido = feesOk ? round2(fat + comissao + frete + estorno) : null;
    const nf = round2(NF_PCT * fat);
    const lucro = feesOk && temCusto ? round2(liquido - nf - custo) : null;
    const margem = lucro !== null && fat > 0 ? round2((100 * lucro) / fat) : null;

    return {
      oid: r.platform_order_id,
      ad: r.ad_name,
      adUrl: r.product_url || null,
      qty: Number(r.qty) || 0,
      fat: round2(fat),
      comissao,
      frete,
      estorno,
      liquido,
      nf,
      custo,
      lucro,
      margem,
      feePct: r.fee_pct !== null && r.fee_pct !== undefined ? Number(r.fee_pct) : null,
      feesSource: r.fees_source || null,
      feesOk,
      temCusto,
    };
  });
}

function aggregate(rows) {
  const sum = (k, src = rows) => round2(src.reduce((acc, r) => acc + (r[k] || 0), 0));
  const comFees = rows.filter((r) => r.feesOk);
  const completos = rows.filter((r) => r.feesOk && r.temCusto);

  const totals = {
    pedidos: rows.length,
    comFees: comFees.length,
    comCusto: rows.filter((r) => r.temCusto).length,
    completos: completos.length,
    qty: rows.reduce((a, r) => a + r.qty, 0),
    fat: sum('fat'),
    comissao: sum('comissao'),
    frete: sum('frete'),
    estorno: sum('estorno'),
    liquido: sum('liquido'),
    nf: sum('nf'),
    custo: sum('custo'),
    lucro: sum('lucro'),
  };
  totals.margem = totals.fat > 0 ? round2((100 * totals.lucro) / totals.fat) : 0;

  // Sem nenhum dado real/custo, mostrar "-" em vez de um zero enganoso
  if (totals.comFees === 0) {
    for (const k of ['comissao', 'frete', 'estorno', 'liquido', 'lucro', 'margem']) totals[k] = null;
  }
  if (totals.comCusto === 0) {
    totals.custo = null;
    totals.lucro = null;
    totals.margem = null;
  }

  // Resumo por anúncio, ordenado por lucro desc
  const byAd = new Map();
  for (const r of rows) {
    const a = byAd.get(r.ad) || {
      ad: r.ad, adUrl: r.adUrl, qty: 0, fat: 0, comissao: 0, frete: 0,
      estorno: 0, liquido: 0, nf: 0, custo: 0, lucro: 0,
      hasFees: false, hasCusto: false,
    };
    a.adUrl = a.adUrl || r.adUrl;
    a.qty += r.qty;
    a.hasFees = a.hasFees || r.feesOk;
    a.hasCusto = a.hasCusto || r.temCusto;
    for (const k of ['fat', 'comissao', 'frete', 'estorno', 'liquido', 'nf', 'custo', 'lucro']) {
      a[k] = round2(a[k] + (r[k] || 0));
    }
    byAd.set(r.ad, a);
  }
  const resumo = [...byAd.values()]
    .map((a) => {
      const out = { ...a, margem: a.fat > 0 ? round2((100 * a.lucro) / a.fat) : 0 };
      if (!a.hasFees) {
        for (const k of ['comissao', 'frete', 'estorno', 'liquido', 'lucro', 'margem']) out[k] = null;
      }
      if (!a.hasCusto) {
        out.custo = null;
        out.lucro = null;
        out.margem = null;
      }
      return out;
    })
    .sort((x, y) => (y.lucro || 0) - (x.lucro || 0));

  return { totals, resumo };
}

/**
 * Pedidos cancelados do dia — exibidos à parte, FORA dos totais
 * (o ML estorna o valor; ficam no relatório só para conferência com a
 * lista de vendas do ML, que os mostra como "Cancelado").
 */
async function getCancelledOrders({ store, date }) {
  const { start, end } = dayWindowUtc(date);
  const { rows } = await db.query(
    `SELECT platform_order_id AS oid,
            MIN(ad_name)      AS ad,
            SUM(quantity)::float AS qty,
            SUM(total)::float    AS fat
     FROM sales
     WHERE platform = 'Mercado Livre'
       AND store = $1
       AND date >= $2::timestamp AND date < $3::timestamp
       AND platform_order_id IS NOT NULL
       AND status = 'Cancelado'
     GROUP BY platform_order_id
     ORDER BY SUM(total) DESC`,
    [store, start, end]
  );
  return rows.map((r) => ({ ...r, qty: Number(r.qty) || 0, fat: round2(Number(r.fat) || 0) }));
}

async function getReportData({ store, date }) {
  const [rows, cancelados] = await Promise.all([
    getReportRows({ store, date }),
    getCancelledOrders({ store, date }),
  ]);
  const { totals, resumo } = aggregate(rows);
  const canceladosResumo = {
    count: cancelados.length,
    fat: round2(cancelados.reduce((a, r) => a + r.fat, 0)),
  };
  return { store, date, nfPct: NF_PCT, rows, resumo, totals, cancelados, canceladosResumo };
}

/** Rótulos de loja ML existentes em sales (para o seletor da tela). */
async function listMlStoreLabels() {
  const { rows } = await db.query(
    `SELECT store, COUNT(*) AS vendas, MAX(date) AS ultima_venda
     FROM sales
     WHERE platform = 'Mercado Livre'
     GROUP BY store
     ORDER BY COUNT(*) DESC`
  );
  return rows.map((r) => ({
    store: r.store,
    vendas: Number(r.vendas),
    ultima_venda: r.ultima_venda,
  }));
}

module.exports = { getReportData, getReportRows, listMlStoreLabels, aggregate, NF_PCT };
