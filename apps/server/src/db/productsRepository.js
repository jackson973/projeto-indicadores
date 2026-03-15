const db = require('./connection');

/**
 * Chave composta: cod_store|||ad_name
 * Agrupa por loja (id) + nome do anúncio — ignora variação/tamanho.
 */
const KEY_SEP = '|||';
const keyExpr = `s.cod_store || '|||' || TRIM(s.ad_name)`;

/**
 * Lista produtos distintos da tabela sales, agrupados por cod_store + ad_name.
 * LEFT JOIN com products via store_variation_key para obter kit_qty.
 */
async function listProducts({ codigo, nome, lojas, page = 1, limit = 50 } = {}) {
  const conditions = [];
  const params = [];

  conditions.push("s.ad_name IS NOT NULL");
  conditions.push("TRIM(s.ad_name) != ''");
  conditions.push("s.ad_name != 'Geral'");
  conditions.push("s.cod_store IS NOT NULL");

  if (codigo) {
    params.push(`%${codigo}%`);
    conditions.push(`s.sku ILIKE $${params.length}`);
  }
  if (nome) {
    params.push(`%${nome}%`);
    conditions.push(`s.ad_name ILIKE $${params.length}`);
  }
  if (lojas && lojas.length > 0) {
    const placeholders = lojas.map((_, i) => `$${params.length + i + 1}`);
    params.push(...lojas);
    conditions.push(`s.cod_store::text IN (${placeholders.join(', ')})`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (page - 1) * limit;

  const countResult = await db.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT ${keyExpr} AS svk FROM sales s ${where} GROUP BY ${keyExpr}
     ) sub`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const result = await db.query(
    `SELECT
       ${keyExpr} AS store_variation_key,
       s.cod_store,
       TRIM(s.ad_name) AS nome,
       MAX(CASE WHEN s.sku IS NOT NULL AND TRIM(s.sku) != '' THEN s.sku END) AS codigo,
       MAX(CASE WHEN s.image IS NOT NULL AND TRIM(s.image) != '' THEN s.image END) AS thumbnail,
       MAX(st.name) AS loja,
       COALESCE(p.kit_qty, 1) AS kit_qty,
       p.id AS product_id
     FROM sales s
     LEFT JOIN stores st ON st.id = s.cod_store
     LEFT JOIN products p ON p.store_variation_key = (${keyExpr})
     ${where}
     GROUP BY ${keyExpr}, s.cod_store, TRIM(s.ad_name), p.kit_qty, p.id
     ORDER BY TRIM(s.ad_name) ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: result.rows, total, page, limit };
}

/**
 * Atualiza (ou cria) o kit_qty usando store_variation_key (cod_store|||ad_name).
 */
async function updateKitQty(storeVariationKey, kitQty, meta = {}) {
  const existing = await db.query(
    'SELECT id FROM products WHERE store_variation_key = $1',
    [storeVariationKey]
  );

  if (existing.rows.length > 0) {
    const result = await db.query(
      'UPDATE products SET kit_qty = $1 WHERE id = $2 RETURNING *',
      [kitQty, existing.rows[0].id]
    );
    return result.rows[0];
  } else {
    const sepIdx = storeVariationKey.indexOf(KEY_SEP);
    const codStore = sepIdx > -1 ? storeVariationKey.substring(0, sepIdx) : null;
    const adName = sepIdx > -1 ? storeVariationKey.substring(sepIdx + KEY_SEP.length) : storeVariationKey;

    const result = await db.query(
      `INSERT INTO products (nome, cod_store, store_variation_key, kit_qty)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [meta.nome || adName, codStore, storeVariationKey, kitQty]
    );
    return result.rows[0];
  }
}

/**
 * Retorna lojas distintas que possuem vendas com cod_store preenchido.
 */
async function getDistinctStores() {
  const result = await db.query(
    `SELECT DISTINCT s.cod_store::text AS id, st.name
     FROM sales s
     INNER JOIN stores st ON st.id = s.cod_store
     WHERE s.cod_store IS NOT NULL
     ORDER BY st.name`
  );
  return result.rows;
}

// ── Product Groups ─────────────────────────────────────────────────────────

async function getProductGroups() {
  const result = await db.query(`
    SELECT g.*, COUNT(gi.id)::int AS product_count
    FROM product_groups g
    LEFT JOIN product_group_items gi ON gi.group_id = g.id
    GROUP BY g.id
    ORDER BY g.name
  `);
  return result.rows;
}

async function createProductGroup(name) {
  const result = await db.query(
    'INSERT INTO product_groups (name) VALUES ($1) RETURNING *',
    [name]
  );
  return result.rows[0];
}

async function updateProductGroup(id, name) {
  const result = await db.query(
    'UPDATE product_groups SET name = $1 WHERE id = $2 AND active = true RETURNING *',
    [name, id]
  );
  return result.rows[0] || null;
}

async function deleteProductGroup(id) {
  await db.query('DELETE FROM product_groups WHERE id = $1', [id]);
  return { deleted: true };
}

async function getGroupItems(groupId) {
  const result = await db.query(
    'SELECT * FROM product_group_items WHERE group_id = $1 ORDER BY ad_name',
    [groupId]
  );
  return result.rows;
}

async function addItemToGroup(groupId, adName) {
  await db.query('DELETE FROM product_group_items WHERE ad_name = $1', [adName]);
  const result = await db.query(
    'INSERT INTO product_group_items (group_id, ad_name) VALUES ($1, $2) RETURNING *',
    [groupId, adName]
  );
  return result.rows[0];
}

async function removeItemFromGroup(groupId, adName) {
  const result = await db.query(
    'DELETE FROM product_group_items WHERE group_id = $1 AND ad_name = $2',
    [groupId, adName]
  );
  return result.rowCount > 0;
}

async function addItemsToGroupBatch(groupId, adNames) {
  const results = [];
  for (const adName of adNames) {
    const row = await addItemToGroup(groupId, adName);
    results.push(row);
  }
  return results;
}

async function removeItemsFromGroupBatch(groupId, adNames) {
  const result = await db.query(
    'DELETE FROM product_group_items WHERE group_id = $1 AND ad_name = ANY($2::text[])',
    [groupId, adNames]
  );
  return result.rowCount;
}

/**
 * Lista todos os anúncios distintos da sales com info de grupo.
 * Agrupa por cod_store|||ad_name.
 */
async function getAllAdsWithGroup() {
  const saKeyExpr = `sa.cod_store || '|||' || TRIM(sa.ad_name)`;
  const result = await db.query(`
    SELECT
      s.store_variation_key,
      s.ad_name,
      s.loja,
      gi.group_id,
      g.name AS group_name
    FROM (
      SELECT
        ${saKeyExpr} AS store_variation_key,
        TRIM(sa.ad_name) AS ad_name,
        MAX(st.name) AS loja
      FROM sales sa
      INNER JOIN stores st ON st.id = sa.cod_store
      WHERE sa.ad_name IS NOT NULL AND TRIM(sa.ad_name) != '' AND sa.ad_name != 'Geral'
        AND sa.cod_store IS NOT NULL
      GROUP BY ${saKeyExpr}, TRIM(sa.ad_name)
    ) s
    LEFT JOIN product_group_items gi ON gi.ad_name = s.store_variation_key
    LEFT JOIN product_groups g ON g.id = gi.group_id
    ORDER BY s.ad_name
  `);
  return result.rows;
}

module.exports = {
  listProducts,
  updateKitQty,
  getDistinctStores,
  getProductGroups,
  createProductGroup,
  updateProductGroup,
  deleteProductGroup,
  getGroupItems,
  addItemToGroup,
  removeItemFromGroup,
  addItemsToGroupBatch,
  removeItemsFromGroupBatch,
  getAllAdsWithGroup,
};
