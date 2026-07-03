const db = require('./connection');

// ─── Faixas de taxa por marketplace ──────────────────────────────────────────
async function getFeeBands() {
  const { rows } = await db.query('SELECT * FROM mp_fee_bands ORDER BY marketplace, price_min');
  return rows;
}

async function createFeeBand({ marketplace, price_min = 0, price_max = null, commission_pct = 0, fixed_per_sale = 0 }) {
  if (!marketplace) throw new Error('Informe o marketplace');
  const { rows } = await db.query(
    `INSERT INTO mp_fee_bands (marketplace, price_min, price_max, commission_pct, fixed_per_sale)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [marketplace, price_min, price_max, commission_pct, fixed_per_sale]
  );
  return rows[0];
}

async function updateFeeBand(id, { price_min, price_max, commission_pct, fixed_per_sale }) {
  const { rows } = await db.query(
    `UPDATE mp_fee_bands SET
       price_min = COALESCE($2, price_min),
       price_max = $3,
       commission_pct = COALESCE($4, commission_pct),
       fixed_per_sale = COALESCE($5, fixed_per_sale),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, price_min ?? null, price_max ?? null, commission_pct ?? null, fixed_per_sale ?? null]
  );
  if (!rows[0]) throw new Error('Faixa não encontrada');
  return rows[0];
}

async function deleteFeeBand(id) {
  await db.query('DELETE FROM mp_fee_bands WHERE id=$1', [id]);
}

// Resolve a faixa (comissão/taxa fixa) de um marketplace para um preço de kit
function resolveFee(bands, marketplace, kitPrice) {
  const cands = bands.filter(b => b.marketplace === marketplace
    && Number(b.price_min) <= kitPrice
    && (b.price_max == null || kitPrice <= Number(b.price_max)));
  const b = cands[0];
  return b ? { commission_pct: Number(b.commission_pct), fixed_per_sale: Number(b.fixed_per_sale) }
           : { commission_pct: 0, fixed_per_sale: 0 };
}

// ─── Lojas de precificação (vindas das lojas das vendas) ─────────────────────
function guessMarketplace(platform, name) {
  const s = `${platform || ''} ${name || ''}`.toLowerCase();
  if (s.includes('mercado') || /\bml\b/.test(s)) return 'mercadolivre';
  if (s.includes('shopee')) return 'shopee';
  if (s.includes('shein')) return 'shein';
  if (s.includes('tiktok') || s.includes('tik tok')) return 'tiktok';
  return null;
}

// Sincroniza pricing_lojas a partir das lojas distintas das vendas (sales.store)
async function syncLojasFromSales() {
  const { rows } = await db.query(
    `SELECT store, platform, COUNT(*)::int AS c
       FROM sales
      WHERE store IS NOT NULL AND store <> '' AND store <> 'Todas'
      GROUP BY store, platform`
  );
  const byStore = {};
  rows.forEach(r => { (byStore[r.store] ||= []).push({ platform: r.platform, c: r.c }); });
  let created = 0;
  for (const [name, arr] of Object.entries(byStore)) {
    arr.sort((a, b) => b.c - a.c);
    const mp = guessMarketplace(arr[0]?.platform, name);
    const res = await db.query(
      `INSERT INTO pricing_lojas (name, marketplace) VALUES ($1,$2)
       ON CONFLICT (name) DO NOTHING RETURNING id`,
      [name, mp]
    );
    if (res.rows[0]) created++;
  }
  const total = (await db.query('SELECT COUNT(*)::int AS n FROM pricing_lojas')).rows[0].n;
  return { created, total };
}

// Lista de lojas (campos compatíveis com a API antiga: platform = marketplace)
async function listStoresForPricing() {
  const { rows } = await db.query(
    'SELECT id, name, marketplace AS platform, nf_pct, active FROM pricing_lojas WHERE active = true ORDER BY name'
  );
  return rows;
}

async function updateStore(id, { marketplace, nf_pct, active }) {
  const { rows } = await db.query(
    `UPDATE pricing_lojas SET
       marketplace = COALESCE($2, marketplace),
       nf_pct = COALESCE($3, nf_pct),
       active = COALESCE($4, active),
       updated_at = now()
     WHERE id=$1 RETURNING id, name, marketplace AS platform, nf_pct, active`,
    [id, marketplace ?? null, nf_pct ?? null, active ?? null]
  );
  if (!rows[0]) throw new Error('Loja não encontrada');
  return rows[0];
}

// ─── Preço de venda por loja ─────────────────────────────────────────────────
async function getProductPrices(product_id) {
  const { rows } = await db.query(
    `SELECT l.id AS store_id, l.name AS store_name, l.marketplace AS platform, l.nf_pct,
            p.id AS price_id, p.unit_price, p.kit_qty, p.frete_type, p.frete_value
       FROM pricing_lojas l
       LEFT JOIN loja_product_prices p ON p.loja_id = l.id AND p.product_id = $1
      WHERE l.active = true
      ORDER BY l.name`,
    [product_id]
  );
  return rows;
}

async function upsertProductPrice(product_id, loja_id, { unit_price = 0, kit_qty = 1, frete_type = 'none', frete_value = 0 }) {
  const { rows } = await db.query(
    `INSERT INTO loja_product_prices (loja_id, product_id, unit_price, kit_qty, frete_type, frete_value)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (loja_id, product_id) DO UPDATE SET
       unit_price=$3, kit_qty=$4, frete_type=$5, frete_value=$6, updated_at=now()
     RETURNING *`,
    [loja_id, product_id, unit_price, Math.max(1, Number(kit_qty) || 1), frete_type, frete_value]
  );
  return rows[0];
}

async function deleteProductPrice(product_id, loja_id) {
  await db.query('DELETE FROM loja_product_prices WHERE product_id=$1 AND loja_id=$2', [product_id, loja_id]);
}

// ─── Valorização (retrato real, read-only) ───────────────────────────────────
function computeLine({ saldo, avgCost, unit_price, kit_qty, frete_type, frete_value, commission_pct, fixed_per_sale, nf_pct }) {
  const kit = Math.max(1, Number(kit_qty) || 1);
  const kitPrice = Number(unit_price) * kit;
  const vendas = Math.floor(saldo / kit);
  const fat = kitPrice * vendas;
  const comV = fat * (Number(commission_pct) || 0) / 100;
  const fixV = (Number(fixed_per_sale) || 0) * vendas;
  const freteV = frete_type === 'pct' ? fat * (Number(frete_value) || 0) / 100
               : frete_type === 'fix' ? (Number(frete_value) || 0) * vendas : 0;
  const nfV = fat * (Number(nf_pct) || 0) / 100;
  const cost = (Number(avgCost) || 0) * vendas * kit;
  const lucro = fat - comV - fixV - freteV - nfV - cost;
  return { kitPrice, vendas, fat, comV, fixV, freteV, nfV, cost, lucro, margem: fat ? lucro / fat * 100 : 0 };
}

async function getValuation() {
  const bands = await getFeeBands();
  const { rows: prods } = await db.query(
    `SELECT p.id, p.codigo, p.descricao, p.sale_price, COALESCE(p.default_kit_qty,1) AS kit_qty,
            COALESCE(SUM(v.balance),0) AS saldo,
            CASE WHEN SUM(CASE WHEN v.balance>0 THEN v.balance ELSE 0 END) > 0
                 THEN SUM(CASE WHEN v.balance>0 THEN v.balance*v.avg_cost ELSE 0 END)
                      / SUM(CASE WHEN v.balance>0 THEN v.balance ELSE 0 END)
                 ELSE 0 END AS avg_cost
       FROM stock_products p
       LEFT JOIN stock_variants v ON v.product_id=p.id AND v.active=true
      WHERE p.active=true
      GROUP BY p.id
      ORDER BY p.codigo`
  );
  const { rows: prices } = await db.query(
    `SELECT lpp.*, l.marketplace AS platform, l.name AS store_name, l.nf_pct, lpp.loja_id AS store_id
       FROM loja_product_prices lpp JOIN pricing_lojas l ON l.id=lpp.loja_id
      WHERE l.active=true`
  );
  const pricesByProduct = {};
  prices.forEach(p => { (pricesByProduct[p.product_id] ||= []).push(p); });

  const stores = await listStoresForPricing();
  const byStore = {};
  stores.forEach(s => { byStore[s.id] = { store_id: s.id, name: s.name, platform: s.platform, nf_pct: Number(s.nf_pct), vendas: 0, fat: 0, lucro: 0 }; });

  let estoqueCusto = 0, estoqueVenda = 0, lucroBrutoTotal = 0;
  const items = prods.map(pr => {
    const saldo = Math.max(0, Number(pr.saldo) || 0); // ignora saldo negativo (furo de estoque)
    const avgCost = Number(pr.avg_cost) || 0;
    const salePrice = pr.sale_price == null ? null : Number(pr.sale_price); // preço por PEÇA (unitário)
    const valorCusto = avgCost * saldo;
    const valorVenda = salePrice != null ? salePrice * saldo : 0;           // valor a preço de venda (peça × saldo)
    const lucroBruto = salePrice != null ? valorVenda - valorCusto : 0;
    estoqueCusto += valorCusto;
    estoqueVenda += valorVenda;
    lucroBrutoTotal += lucroBruto;
    const perStore = {};
    (pricesByProduct[pr.id] || []).forEach(pp => {
      const fee = resolveFee(bands, pp.platform, Number(pp.unit_price) * Math.max(1, pp.kit_qty));
      const line = computeLine({
        saldo, avgCost, unit_price: pp.unit_price, kit_qty: pp.kit_qty,
        frete_type: pp.frete_type, frete_value: pp.frete_value,
        commission_pct: fee.commission_pct, fixed_per_sale: fee.fixed_per_sale, nf_pct: pp.nf_pct,
      });
      perStore[pp.store_id] = {
        kitPrice: line.kitPrice, vendas: line.vendas, fat: line.fat,
        comV: line.comV, fixV: line.fixV, freteV: line.freteV, nfV: line.nfV, cost: line.cost,
        lucro: line.lucro, margem: line.margem, kit_qty: Math.max(1, Number(pp.kit_qty) || 1),
        commission_pct: fee.commission_pct, fixed_per_sale: fee.fixed_per_sale,
        nf_pct: Number(pp.nf_pct) || 0, frete_type: pp.frete_type, frete_value: Number(pp.frete_value) || 0,
      };
      if (byStore[pp.store_id]) { byStore[pp.store_id].vendas += line.vendas; byStore[pp.store_id].fat += line.fat; byStore[pp.store_id].lucro += line.lucro; }
    });
    const kit = Math.max(1, Number(pr.kit_qty) || 1);
    return { product_id: pr.id, codigo: pr.codigo, descricao: pr.descricao, saldo, avg_cost: avgCost,
             sale_price: salePrice, kit_qty: kit, preco_kit: salePrice != null ? salePrice * kit : null,
             valor_custo: avgCost * saldo, valor_venda: valorVenda, lucro_bruto: lucroBruto, perStore };
  });

  return {
    estoque_custo: estoqueCusto,
    estoque_venda: estoqueVenda,
    lucro_bruto: lucroBrutoTotal,
    stores: stores.map(s => ({ store_id: s.id, name: s.name, platform: s.platform, nf_pct: Number(s.nf_pct) })),
    byStore: Object.values(byStore),
    items,
  };
}

module.exports = {
  getFeeBands, createFeeBand, updateFeeBand, deleteFeeBand,
  listStoresForPricing, updateStore, syncLojasFromSales,
  getProductPrices, upsertProductPrice, deleteProductPrice,
  getValuation,
};
