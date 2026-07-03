const db = require('./connection');

// ─── Fornecedores ────────────────────────────────────────────────────────────
async function listSuppliers({ search = '', includeInactive = false } = {}) {
  const params = [];
  const where = [];
  if (!includeInactive) where.push('active = true');
  if (search) { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR document ILIKE $${params.length})`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(`SELECT * FROM suppliers ${whereSql} ORDER BY name`, params);
  return rows;
}

async function createSupplier({ name, document = null, contact = null, note = null }) {
  if (!name || !name.trim()) throw new Error('Informe o nome do fornecedor');
  const { rows } = await db.query(
    `INSERT INTO suppliers (name, document, contact, note) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name.trim(), document, contact, note]
  );
  return rows[0];
}

async function updateSupplier(id, { name, document, contact, note, active }) {
  const { rows } = await db.query(
    `UPDATE suppliers SET
       name = COALESCE($2, name),
       document = COALESCE($3, document),
       contact = COALESCE($4, contact),
       note = COALESCE($5, note),
       active = COALESCE($6, active),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, name ?? null, document ?? null, contact ?? null, note ?? null, active ?? null]
  );
  if (!rows[0]) throw new Error('Fornecedor não encontrado');
  return rows[0];
}

async function deleteSupplier(id) {
  // Soft delete (pode estar referenciado em custos)
  await db.query('UPDATE suppliers SET active=false, updated_at=now() WHERE id=$1', [id]);
}

// ─── Custos por produto (× fornecedor, com vigência) ──────────────────────────
async function getProductCosts(product_id) {
  const { rows } = await db.query(
    `SELECT c.*, s.name AS supplier_name
       FROM stock_product_costs c
       LEFT JOIN suppliers s ON s.id = c.supplier_id
      WHERE c.product_id = $1
      ORDER BY (c.valid_until IS NULL) DESC, c.valid_from DESC`,
    [product_id]
  );
  return rows;
}

async function createProductCost({ product_id, variant_id = null, supplier_id = null, cost, valid_from, valid_until = null, note = null }) {
  if (!product_id) throw new Error('Informe o produto');
  if (cost == null || isNaN(Number(cost))) throw new Error('Informe o custo');
  if (!valid_from) throw new Error('Informe a data de início da vigência');
  const { rows } = await db.query(
    `INSERT INTO stock_product_costs (product_id, variant_id, supplier_id, cost, valid_from, valid_until, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [product_id, variant_id, supplier_id, Number(cost), valid_from, valid_until, note]
  );
  return rows[0];
}

async function updateProductCost(id, { supplier_id, cost, valid_from, valid_until, note }) {
  const { rows } = await db.query(
    `UPDATE stock_product_costs SET
       supplier_id = COALESCE($2, supplier_id),
       cost = COALESCE($3, cost),
       valid_from = COALESCE($4, valid_from),
       valid_until = $5,
       note = COALESCE($6, note),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, supplier_id ?? null, cost ?? null, valid_from ?? null, valid_until ?? null, note ?? null]
  );
  if (!rows[0]) throw new Error('Custo não encontrado');
  return rows[0];
}

async function deleteProductCost(id) {
  await db.query('DELETE FROM stock_product_costs WHERE id=$1', [id]);
}

// ─── Status de configuração por produto ──────────────────────────────────────
// Para cada produto ativo: tem custo? tem fornecedor? preço em quantas lojas?
// status: 'nao' (nada), 'parcial' (falta fornecedor ou alguma loja), 'ok' (tudo).
async function getConfigStatus() {
  const { rows } = await db.query(
    `WITH lojas AS (SELECT COUNT(*)::int AS total FROM pricing_lojas WHERE active = true)
     SELECT p.id,
            COALESCE(sc.n, 0)::int AS suppliers,
            COALESCE(lp.n, 0)::int AS lojas_price,
            (SELECT total FROM lojas) AS lojas_total,
            CASE WHEN SUM(CASE WHEN v.balance > 0 THEN v.balance ELSE 0 END) > 0
                 THEN SUM(CASE WHEN v.balance > 0 THEN v.balance * v.avg_cost ELSE 0 END)
                      / SUM(CASE WHEN v.balance > 0 THEN v.balance ELSE 0 END)
                 ELSE 0 END AS avg_cost,
            p.initial_cost
       FROM stock_products p
       LEFT JOIN stock_variants v ON v.product_id = p.id AND v.active = true
       LEFT JOIN (SELECT product_id, COUNT(*) n FROM stock_product_costs GROUP BY product_id) sc ON sc.product_id = p.id
       LEFT JOIN (SELECT product_id, COUNT(DISTINCT loja_id) n FROM loja_product_prices GROUP BY product_id) lp ON lp.product_id = p.id
      WHERE p.active = true
      GROUP BY p.id, sc.n, lp.n`
  );
  const out = {};
  rows.forEach(r => {
    const hasCost = Number(r.avg_cost) > 0 || Number(r.initial_cost) > 0;
    const suppliers = Number(r.suppliers) || 0;
    const lojasPrice = Number(r.lojas_price) || 0;
    const lojasTotal = Number(r.lojas_total) || 0;
    let status;
    if (!hasCost && suppliers === 0 && lojasPrice === 0) status = 'nao';
    else if (hasCost && suppliers > 0 && lojasTotal > 0 && lojasPrice >= lojasTotal) status = 'ok';
    else status = 'parcial';
    out[r.id] = { status, hasCost, suppliers, lojasPrice, lojasTotal };
  });
  return out;
}

module.exports = {
  listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getProductCosts, createProductCost, updateProductCost, deleteProductCost,
  getConfigStatus,
};
