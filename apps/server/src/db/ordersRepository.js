const db = require('./connection');
// Wrap to match pool API used throughout this file
const pool = {
  query: db.query,
  connect: db.getClient,
};

// ─── Catalog Products ───────────────────────────────────────────────────────

async function getCatalogProducts() {
  const { rows } = await pool.query(`
    SELECT p.*,
      COALESCE(
        json_agg(s ORDER BY s.sort_order, s.size_name) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS sizes
    FROM order_catalog_products p
    LEFT JOIN order_catalog_sizes s ON s.product_id = p.id
    WHERE p.active = true
    GROUP BY p.id
    ORDER BY p.name
  `);
  return rows;
}

async function getCatalogProductById(id) {
  const { rows } = await pool.query(`
    SELECT p.*,
      COALESCE(
        json_agg(s ORDER BY s.sort_order, s.size_name) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS sizes
    FROM order_catalog_products p
    LEFT JOIN order_catalog_sizes s ON s.product_id = p.id
    WHERE p.id = $1
    GROUP BY p.id
  `, [id]);
  return rows[0] || null;
}

async function createCatalogProduct({ name, price_pc, price_mn, reference_codigo, sizes = [] }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO order_catalog_products (name, price_pc, price_mn, reference_codigo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, price_pc, price_mn, reference_codigo]
    );
    const product = rows[0];
    if (sizes.length > 0) await _insertSizes(client, product.id, sizes);
    await client.query('COMMIT');
    return getCatalogProductById(product.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateCatalogProduct(id, { name, price_pc, price_mn, reference_codigo, sizes }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE order_catalog_products
       SET name=$1, price_pc=$2, price_mn=$3, reference_codigo=$4, updated_at=NOW()
       WHERE id=$5`,
      [name, price_pc, price_mn, reference_codigo, id]
    );
    if (sizes !== undefined) {
      await client.query('DELETE FROM order_catalog_sizes WHERE product_id=$1', [id]);
      if (sizes.length > 0) await _insertSizes(client, id, sizes);
    }
    await client.query('COMMIT');
    return getCatalogProductById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateCatalogProductPhoto(id, photoUrl) {
  await pool.query(
    'UPDATE order_catalog_products SET photo_url=$1, updated_at=NOW() WHERE id=$2',
    [photoUrl, id]
  );
}

async function deleteCatalogProduct(id) {
  await pool.query('UPDATE order_catalog_products SET active=false WHERE id=$1', [id]);
}

async function _insertSizes(client, productId, sizes) {
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    await client.query(
      `INSERT INTO order_catalog_sizes (product_id, size_name, sisplan_sku, sort_order)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (product_id, size_name) DO UPDATE SET sisplan_sku=$3, sort_order=$4`,
      [productId, s.size_name ?? s.name, s.sisplan_sku, i]
    );
  }
}

// ─── Payment Conditions ──────────────────────────────────────────────────────

async function getPaymentConditions() {
  const { rows } = await pool.query(
    'SELECT * FROM payment_conditions WHERE active=true ORDER BY sort_order, id'
  );
  return rows;
}

async function createPaymentCondition({ name, erp_code, sort_order = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO payment_conditions (name, erp_code, sort_order) VALUES ($1,$2,$3) RETURNING *`,
    [name, erp_code, sort_order]
  );
  return rows[0];
}

async function updatePaymentCondition(id, { name, erp_code, sort_order }) {
  const { rows } = await pool.query(
    `UPDATE payment_conditions SET name=$1, erp_code=$2, sort_order=$3 WHERE id=$4 RETURNING *`,
    [name, erp_code, sort_order, id]
  );
  return rows[0];
}

async function deletePaymentCondition(id) {
  await pool.query('UPDATE payment_conditions SET active=false WHERE id=$1', [id]);
}

// ─── Customers ───────────────────────────────────────────────────────────────

async function getCustomers(search) {
  let query = 'SELECT * FROM order_customers WHERE active=true';
  const params = [];
  if (search && search.trim()) {
    params.push(`%${search.toLowerCase()}%`);
    query += ` AND (
      LOWER(fantasy_name)          LIKE $1 OR
      LOWER(company_name)          LIKE $1 OR
      LOWER(sisplan_id)            LIKE $1 OR
      LOWER(cnpj)                  LIKE $1 OR
      LOWER(COALESCE(cidade, ''))  LIKE $1
    )`;
  }
  query += ' ORDER BY COALESCE(NULLIF(fantasy_name,\'\'), company_name) LIMIT 100';
  const { rows } = await pool.query(query, params);
  return rows;
}

async function upsertCustomers(customers) {
  if (!customers.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;
    for (const c of customers) {
      await client.query(
        `INSERT INTO order_customers (sisplan_id, fantasy_name, company_name, cnpj, cidade, uf, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (sisplan_id) DO UPDATE
           SET fantasy_name=$2, company_name=$3, cnpj=$4, cidade=$5, uf=$6, synced_at=NOW(), active=true`,
        [c.sisplan_id, c.fantasy_name, c.company_name, c.cnpj, c.cidade || null, c.uf || null]
      );
      count++;
    }
    await client.query('COMMIT');
    return count;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function getOrders({ status, type, search, limit = 50 } = {}) {
  const conditions = [];
  const params = [];

  if (status) { params.push(status); conditions.push(`o.status=$${params.length}`); }
  if (type)   { params.push(type);   conditions.push(`o.type=$${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const n = params.length;
    conditions.push(`(
      LOWER(o.customer_snapshot->>'fantasy_name') LIKE $${n} OR
      LOWER(o.customer_snapshot->>'company_name') LIKE $${n} OR
      LOWER(o.customer_snapshot->>'sisplan_id')   LIKE $${n} OR
      LOWER(COALESCE(o.sisplan_order_id,''))       LIKE $${n}
    )`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(limit);

  const { rows } = await pool.query(`
    SELECT o.*,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) AS item_count,
      u.name AS created_by_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by
    ${where}
    ORDER BY o.created_at DESC
    LIMIT $${params.length}
  `, params);
  return rows;
}

async function getOrderById(id) {
  const { rows } = await pool.query(`
    SELECT o.*, u.name AS created_by_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id',                 i.id,
            'catalog_product_id', i.catalog_product_id,
            'product_name',       i.product_name,
            'size_name',          i.size_name,
            'sisplan_sku',        i.sisplan_sku,
            'qty',                i.qty,
            'unit_price',         i.unit_price,
            'subtotal',           i.subtotal,
            'photo_url',          p.photo_url
          ) ORDER BY i.id
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    LEFT JOIN order_items i ON i.order_id=o.id
    LEFT JOIN order_catalog_products p ON p.id=i.catalog_product_id
    LEFT JOIN users u ON u.id = o.created_by
    WHERE o.id=$1
    GROUP BY o.id, u.name
  `, [id]);
  return rows[0] || null;
}

async function createOrder({ type, status, customer_id, customer_snapshot, price_table, payment_condition, payment_condition_erp, notes, items, created_by }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
    const orderStatus = status || (type === 'pedido' ? 'enviado' : 'rascunho');
    const { rows } = await client.query(
      `INSERT INTO orders (type, status, customer_id, customer_snapshot, price_table, payment_condition, payment_condition_erp, notes, total, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [type, orderStatus, customer_id, JSON.stringify(customer_snapshot), price_table, payment_condition || null, payment_condition_erp || null, notes, total, created_by]
    );
    const order = rows[0];
    await _insertOrderItems(client, order.id, items);
    await client.query('COMMIT');
    return getOrderById(order.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateOrderFull(id, { customer_id, customer_snapshot, price_table, payment_condition, payment_condition_erp, notes, items }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
    await client.query(
      `UPDATE orders SET customer_id=$1, customer_snapshot=$2, price_table=$3, payment_condition=$4, payment_condition_erp=$5, notes=$6, total=$7, updated_at=NOW() WHERE id=$8`,
      [customer_id, JSON.stringify(customer_snapshot), price_table, payment_condition || null, payment_condition_erp || null, notes, total, id]
    );
    await client.query('DELETE FROM order_items WHERE order_id=$1', [id]);
    await _insertOrderItems(client, id, items);
    await client.query('COMMIT');
    return getOrderById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateOrder(id, { status, notes, sisplan_order_id }) {
  const fields = [];
  const params = [];

  if (status !== undefined)           { params.push(status);           fields.push(`status=$${params.length}`); }
  if (notes !== undefined)            { params.push(notes);            fields.push(`notes=$${params.length}`); }
  if (sisplan_order_id !== undefined) { params.push(sisplan_order_id); fields.push(`sisplan_order_id=$${params.length}`); }
  if (!fields.length) return getOrderById(id);

  params.push(id);
  await pool.query(
    `UPDATE orders SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${params.length}`,
    params
  );
  return getOrderById(id);
}

async function _insertOrderItems(client, orderId, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO order_items (order_id, catalog_product_id, product_name, size_name, sisplan_sku, qty, unit_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orderId, item.catalog_product_id || null, item.product_name, item.size_name, item.sisplan_sku || null, item.qty, item.unit_price]
    );
  }
}

module.exports = {
  getPaymentConditions,
  createPaymentCondition,
  updatePaymentCondition,
  deletePaymentCondition,
  getCatalogProducts,
  getCatalogProductById,
  createCatalogProduct,
  updateCatalogProduct,
  updateCatalogProductPhoto,
  deleteCatalogProduct,
  getCustomers,
  upsertCustomers,
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  updateOrderFull,
};
