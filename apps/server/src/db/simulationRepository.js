const db = require('./connection');

// Base para iniciar um cenário: produtos (saldo/custo médio/kit), lojas, faixas e preços por loja.
async function buildBase() {
  const { rows: products } = await db.query(
    `SELECT p.id, p.codigo, p.descricao, p.default_kit_qty,
            COALESCE(SUM(v.balance),0)::int AS saldo,
            CASE WHEN SUM(CASE WHEN v.balance>0 THEN v.balance ELSE 0 END) > 0
                 THEN SUM(CASE WHEN v.balance>0 THEN v.balance*v.avg_cost ELSE 0 END)
                      / SUM(CASE WHEN v.balance>0 THEN v.balance ELSE 0 END)
                 ELSE 0 END AS avg_cost
       FROM stock_products p
       LEFT JOIN stock_variants v ON v.product_id=p.id AND v.active=true
      WHERE p.active=true
      GROUP BY p.id
      HAVING COALESCE(SUM(v.balance),0) > 0
      ORDER BY p.codigo`
  );
  const { rows: stores } = await db.query(
    'SELECT id, name, marketplace AS platform, nf_pct FROM pricing_lojas WHERE active=true ORDER BY name'
  );
  const { rows: feeBands } = await db.query('SELECT * FROM mp_fee_bands ORDER BY marketplace, price_min');
  const { rows: prices } = await db.query(
    'SELECT loja_id AS store_id, product_id, unit_price, kit_qty, frete_type, frete_value FROM loja_product_prices'
  );
  return { products, stores, feeBands, prices };
}

async function list() {
  const { rows } = await db.query(
    'SELECT id, name, mode, total_vendas, total_fat, total_lucro, created_at FROM pricing_simulations ORDER BY created_at DESC'
  );
  return rows;
}

async function get(id) {
  const { rows } = await db.query('SELECT * FROM pricing_simulations WHERE id=$1', [id]);
  return rows[0] || null;
}

async function create({ name, mode = 'mix', totals = {}, data = {}, user_id = null }) {
  if (!name || !name.trim()) throw new Error('Informe o nome do cenário');
  const { rows } = await db.query(
    `INSERT INTO pricing_simulations (name, mode, user_id, total_vendas, total_fat, total_lucro, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, mode, total_vendas, total_fat, total_lucro, created_at`,
    [name.trim(), mode, user_id, totals.vendas || 0, totals.fat || 0, totals.lucro || 0, JSON.stringify(data)]
  );
  return rows[0];
}

async function remove(id) {
  await db.query('DELETE FROM pricing_simulations WHERE id=$1', [id]);
}

async function duplicate(id, user_id = null) {
  const s = await get(id);
  if (!s) throw new Error('Cenário não encontrado');
  const { rows } = await db.query(
    `INSERT INTO pricing_simulations (name, mode, user_id, total_vendas, total_fat, total_lucro, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, mode, total_vendas, total_fat, total_lucro, created_at`,
    [`${s.name} (cópia)`, s.mode, user_id, s.total_vendas, s.total_fat, s.total_lucro, JSON.stringify(s.data)]
  );
  return rows[0];
}

module.exports = { buildBase, list, get, create, remove, duplicate };
