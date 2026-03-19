const db = require('./connection');
const { isSizePattern } = require('../lib/metrics');

/**
 * Chave composta: cod_store|||ad_name
 * Agrupa por loja (id) + nome do anúncio — ignora variação/tamanho.
 */
const KEY_SEP = '|||';
// Usa cod_store quando disponível, senão usa store name
const keyExpr = `COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name)`;

// Expressão SQL que extrai o prefixo de variação com swap inteligente
// Se a primeira parte é tamanho (GG, M, 10 anos, etc.), usa a segunda parte como variação
const variationPrefixExpr = `
  CASE
    WHEN s.variation LIKE '%,%' AND (
      TRIM(SPLIT_PART(s.variation, ',', 1)) ~* '^(PP|P|M|G|GG|XG|XGG|EG|EGG|RN|UN|U)(\\s*\\(.*\\))?$'
      OR TRIM(SPLIT_PART(s.variation, ',', 1)) ~* '^\\d+\\s*a\\s*\\d+\\s*mes(es)?$'
      OR TRIM(SPLIT_PART(s.variation, ',', 1)) ~* '^\\d+\\s*anos?$'
      OR TRIM(SPLIT_PART(s.variation, ',', 1)) ~ '^\\d{1,3}$'
    )
    THEN TRIM(SUBSTRING(s.variation FROM POSITION(',' IN s.variation) + 1))
    ELSE TRIM(SPLIT_PART(s.variation, ',', 1))
  END`;

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
    conditions.push(`COALESCE(s.cod_store::text, s.store) IN (${placeholders.join(', ')})`);
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
       COALESCE(MAX(st.name), s.store) AS loja,
       COALESCE(p.kit_qty, 1) AS kit_qty,
       p.id AS product_id
     FROM sales s
     LEFT JOIN stores st ON st.id = s.cod_store
     LEFT JOIN products p ON p.store_variation_key = (${keyExpr})
     ${where}
     GROUP BY ${keyExpr}, s.cod_store, s.store, TRIM(s.ad_name), p.kit_qty, p.id
     ORDER BY TRIM(s.ad_name) ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  // Detectar variações não configuradas para cada produto
  const rows = result.rows;
  if (rows.length > 0) {
    try {
      const svks = rows.map((r) => r.store_variation_key);
      const unconfigured = await getUnconfiguredVariations(svks);
      for (const row of rows) {
        row.unconfigured_variations = unconfigured.get(row.store_variation_key) || 0;
      }
    } catch (err) {
      console.error('[Products] unconfigured variations check error:', err);
      for (const row of rows) {
        row.unconfigured_variations = 0;
      }
    }
  }

  return { rows, total, page, limit };
}

/**
 * Para cada svk, conta quantas variações distintas existem em sales
 * que NÃO têm um kit_qty configurado individualmente na tabela products.
 * Retorna um Map<svk, count>.
 */
async function getUnconfiguredVariations(svks) {
  const result = new Map();
  if (!svks || svks.length === 0) return result;

  // Buscar variações brutas de todos os produtos de uma vez
  const variationsResult = await db.query(
    `SELECT
       COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name) AS svk,
       s.variation
     FROM sales s
     WHERE (COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name)) = ANY($1::text[])
       AND s.variation IS NOT NULL
       AND TRIM(s.variation) != ''
     GROUP BY COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name), s.variation`,
    [svks]
  );

  // Agrupar prefixos por svk
  const svkPrefixes = new Map();
  for (const row of variationsResult.rows) {
    const prefix = extractVariationPrefix(row.variation);
    if (!svkPrefixes.has(row.svk)) svkPrefixes.set(row.svk, new Set());
    svkPrefixes.get(row.svk).add(prefix);
  }

  // Filtrar: só considerar produtos com mais de 1 prefixo (tem sub-variações)
  const toCheck = [];
  for (const [svk, prefixes] of svkPrefixes) {
    if (prefixes.size > 1) {
      for (const prefix of prefixes) {
        toCheck.push(`${svk}${KEY_SEP}${prefix}`);
      }
    }
  }

  if (toCheck.length === 0) return result;

  // Buscar quais variações já têm kit_qty configurado
  const configuredResult = await db.query(
    `SELECT store_variation_key FROM products WHERE store_variation_key = ANY($1::text[])`,
    [toCheck]
  );
  const configuredSet = new Set(configuredResult.rows.map((r) => r.store_variation_key));

  // Contar variações não configuradas por svk
  for (const [svk, prefixes] of svkPrefixes) {
    if (prefixes.size <= 1) continue;
    let count = 0;
    for (const prefix of prefixes) {
      if (!configuredSet.has(`${svk}${KEY_SEP}${prefix}`)) count++;
    }
    if (count > 0) result.set(svk, count);
  }

  return result;
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
    const codStoreRaw = sepIdx > -1 ? storeVariationKey.substring(0, sepIdx) : null;
    const adName = sepIdx > -1 ? storeVariationKey.substring(sepIdx + KEY_SEP.length) : storeVariationKey;
    // cod_store é BIGINT — só salvar se for numérico
    const codStore = codStoreRaw && /^\d+$/.test(codStoreRaw) ? codStoreRaw : null;

    const result = await db.query(
      `INSERT INTO products (nome, cod_store, store_variation_key, kit_qty)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [meta.nome || adName, codStore, storeVariationKey, kitQty]
    );
    return result.rows[0];
  }
}

/**
 * Extrai o prefixo de variação (parte que NÃO é tamanho) de uma string de variação.
 * Lida com ordens invertidas: "GG (9 a 12 meses),kit 15 peças" → "kit 15 peças"
 */
function extractVariationPrefix(variation) {
  const raw = (variation || '').trim();
  if (!raw.includes(',')) return raw || 'Não informado';
  const parts = raw.split(',');
  const part1 = (parts[0] || '').trim();
  const part2 = parts.slice(1).join(',').trim();
  // Se part1 é tamanho e part2 não, swap
  if (isSizePattern(part1) && !isSizePattern(part2)) return part2 || 'Não informado';
  return part1 || 'Não informado';
}

/**
 * Retorna os prefixos de variação distintos de um produto.
 * Usa lógica inteligente para detectar quando tamanho vem antes da variação.
 * Ex: "Kit com 5 Shorts,10 anos" → "Kit com 5 Shorts"
 * Ex: "GG (9 a 12 meses),kit 15 peças" → "kit 15 peças"
 * Retorna [] se todas as variações forem iguais (sem sub-variações).
 */
async function getVariationPrefixes(storeKey, adName) {
  const result = await db.query(
    `SELECT s.variation, COUNT(*)::int AS qty
     FROM sales s
     WHERE COALESCE(s.cod_store::text, s.store) = $1
       AND TRIM(s.ad_name) = $2
       AND s.variation IS NOT NULL
       AND TRIM(s.variation) != ''
     GROUP BY s.variation`,
    [storeKey, adName]
  );

  // Agrupar por prefixo normalizado (com swap inteligente)
  const prefixMap = new Map();
  for (const row of result.rows) {
    const prefix = extractVariationPrefix(row.variation);
    const existing = prefixMap.get(prefix) || 0;
    prefixMap.set(prefix, existing + row.qty);
  }

  // Se só tem 1 prefixo, não há sub-variações relevantes
  if (prefixMap.size <= 1) return [];

  const prefixes = [...prefixMap.keys()].sort();
  const key = `${storeKey}${KEY_SEP}${adName}`;

  const pricesResult = await db.query(
    `SELECT store_variation_key, kit_qty FROM products
     WHERE store_variation_key = ANY($1::text[])`,
    [prefixes.map((p) => `${key}${KEY_SEP}${p}`)]
  );

  const kitMap = new Map();
  pricesResult.rows.forEach((r) => {
    const parts = r.store_variation_key.split(KEY_SEP);
    const pfx = parts.slice(2).join(KEY_SEP);
    kitMap.set(pfx, r.kit_qty);
  });

  return prefixes.map((prefix) => ({
    prefix,
    count: prefixMap.get(prefix),
    kit_qty: kitMap.get(prefix) || 1,
    configured: kitMap.has(prefix),
  }));
}

/**
 * Retorna lojas distintas que possuem vendas.
 */
async function getDistinctStores() {
  const result = await db.query(
    `SELECT
       COALESCE(s.cod_store::text, s.store) AS id,
       COALESCE(st.name, s.store) AS name
     FROM sales s
     LEFT JOIN stores st ON st.id = s.cod_store
     WHERE s.store IS NOT NULL AND TRIM(s.store) != '' AND s.store != 'Todas'
     GROUP BY COALESCE(s.cod_store::text, s.store), COALESCE(st.name, s.store)
     ORDER BY name`
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
  const saKeyExpr = `COALESCE(sa.cod_store::text, sa.store) || '|||' || TRIM(sa.ad_name)`;
  const result = await db.query(`
    SELECT
      s.store_variation_key,
      s.ad_name,
      s.loja,
      s.thumbnail,
      s.platform,
      s.sku,
      gi.group_id,
      g.name AS group_name
    FROM (
      SELECT
        ${saKeyExpr} AS store_variation_key,
        TRIM(sa.ad_name) AS ad_name,
        COALESCE(MAX(st.name), sa.store) AS loja,
        MAX(CASE WHEN sa.image IS NOT NULL AND TRIM(sa.image) != '' THEN sa.image END) AS thumbnail,
        MAX(sa.platform) AS platform,
        MAX(CASE WHEN sa.sku IS NOT NULL AND TRIM(sa.sku) != '' THEN sa.sku END) AS sku
      FROM sales sa
      LEFT JOIN stores st ON st.id = sa.cod_store
      WHERE sa.ad_name IS NOT NULL AND TRIM(sa.ad_name) != '' AND sa.ad_name != 'Geral'
      GROUP BY ${saKeyExpr}, TRIM(sa.ad_name), sa.store
    ) s
    LEFT JOIN product_group_items gi ON gi.ad_name = s.store_variation_key
    LEFT JOIN product_groups g ON g.id = gi.group_id
    ORDER BY s.ad_name
  `);
  return result.rows;
}

/**
 * Dashboard de Produtos — dados agrupados por produto com kit_qty.
 */
async function getProductDashboard({ start, end, groupIds, lojas } = {}) {
  const params = [start, end];
  let groupFilter = '';
  if (groupIds && groupIds.length > 0) {
    const placeholders = groupIds.map((_, i) => `$${params.length + i + 1}`);
    params.push(...groupIds);
    groupFilter = `INNER JOIN product_group_items gf ON gf.ad_name = sk.svk AND gf.group_id IN (${placeholders.join(',')})`;
  }
  let storeFilter = '';
  if (lojas && lojas.length > 0) {
    const placeholders = lojas.map((_, i) => `$${params.length + i + 1}`);
    params.push(...lojas);
    storeFilter = `AND COALESCE(s.cod_store::text, s.store) IN (${placeholders.join(',')})`;
  }

  const notCanceled = `
    AND (s.status IS NULL OR s.status = ''
      OR LOWER(TRANSLATE(s.status, 'áàãâéêíóôõúüç', 'aaaaeeiooouuc'))
        NOT SIMILAR TO '%(cancelado|cancel)%')`;

  const cte = `
    WITH sale_kit AS (
      SELECT
        s.id,
        s.order_id,
        s.date,
        s.quantity,
        s.total,
        TRIM(s.ad_name) AS ad_name,
        COALESCE(s.cod_store::text, s.store) AS store_key,
        COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name) AS svk,
        s.variation,
        s.image,
        s.store,
        s.cod_store,
        CASE
          WHEN s.variation IS NOT NULL AND TRIM(s.variation) != ''
          THEN COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name) || '|||' || ${variationPrefixExpr}
          ELSE NULL
        END AS var_key
      FROM sales s
      WHERE s.date::date >= $1::date AND s.date::date <= $2::date
        AND s.ad_name IS NOT NULL AND TRIM(s.ad_name) != '' AND s.ad_name != 'Geral'
        ${storeFilter}
        ${notCanceled}
    ),
    resolved AS (
      SELECT
        sk.*,
        COALESCE(pv.kit_qty, pp.kit_qty, 1) AS kit_qty
      FROM sale_kit sk
      ${groupFilter}
      LEFT JOIN products pv ON pv.store_variation_key = sk.var_key
      LEFT JOIN products pp ON pp.store_variation_key = sk.svk
    )`;

  // Summary
  const summaryQ = db.query(
    `${cte}
     SELECT
       COALESCE(SUM(r.quantity * r.kit_qty), 0) AS total_units,
       COALESCE(SUM(r.total), 0) AS total_revenue,
       COUNT(DISTINCT r.order_id) AS total_orders
     FROM resolved r`,
    params
  );

  // By date
  const byDateQ = db.query(
    `${cte}
     SELECT
       r.date::date AS date,
       SUM(r.quantity * r.kit_qty) AS units,
       SUM(r.total) AS revenue,
       COUNT(DISTINCT r.order_id) AS orders
     FROM resolved r
     GROUP BY r.date::date
     ORDER BY date`,
    params
  );

  // By group
  const byGroupQ = db.query(
    `${cte}
     SELECT
       g.id AS group_id,
       g.name AS group_name,
       COALESCE(SUM(r.quantity * r.kit_qty), 0) AS units,
       COALESCE(SUM(r.total), 0) AS revenue
     FROM resolved r
     INNER JOIN product_group_items gi ON gi.ad_name = r.svk
     INNER JOIN product_groups g ON g.id = gi.group_id
     GROUP BY g.id, g.name
     ORDER BY units DESC`,
    params
  );

  // By product
  const byProductQ = db.query(
    `${cte}
     SELECT
       r.svk AS store_variation_key,
       r.ad_name,
       COALESCE(MAX(st.name), MAX(r.store)) AS loja,
       MAX(CASE WHEN r.image IS NOT NULL AND TRIM(r.image) != '' THEN r.image END) AS thumbnail,
       MIN(r.kit_qty) AS min_kit_qty,
       MAX(r.kit_qty) AS max_kit_qty,
       SUM(r.quantity)::numeric AS raw_quantity,
       SUM(r.quantity * r.kit_qty)::numeric AS adjusted_quantity,
       SUM(r.total)::numeric AS revenue,
       COUNT(DISTINCT r.order_id) AS orders,
       MAX(g.name) AS group_name
     FROM resolved r
     LEFT JOIN stores st ON st.id = r.cod_store
     LEFT JOIN product_group_items gi ON gi.ad_name = r.svk
     LEFT JOIN product_groups g ON g.id = gi.group_id
     GROUP BY r.svk, r.ad_name
     ORDER BY adjusted_quantity DESC`,
    params
  );

  const [summaryRes, byDateRes, byGroupRes, byProductRes] = await Promise.all([summaryQ, byDateQ, byGroupQ, byProductQ]);

  const s = summaryRes.rows[0];
  const totalRevenue = parseFloat(s.total_revenue) || 0;
  const totalOrders = parseInt(s.total_orders) || 0;

  return {
    summary: {
      totalUnits: parseFloat(s.total_units) || 0,
      totalRevenue,
      totalOrders,
      avgTicket: totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
    },
    byDate: byDateRes.rows.map((r) => ({
      date: r.date,
      units: parseFloat(r.units) || 0,
      revenue: parseFloat(r.revenue) || 0,
      orders: parseInt(r.orders) || 0,
    })),
    byGroup: byGroupRes.rows.map((r) => ({
      group_id: r.group_id,
      group_name: r.group_name,
      units: parseFloat(r.units) || 0,
      revenue: parseFloat(r.revenue) || 0,
    })),
    byProduct: byProductRes.rows.map((r) => ({
      store_variation_key: r.store_variation_key,
      ad_name: r.ad_name,
      loja: r.loja,
      thumbnail: r.thumbnail,
      min_kit_qty: parseInt(r.min_kit_qty) || 1,
      max_kit_qty: parseInt(r.max_kit_qty) || 1,
      raw_quantity: parseFloat(r.raw_quantity) || 0,
      adjusted_quantity: parseFloat(r.adjusted_quantity) || 0,
      revenue: parseFloat(r.revenue) || 0,
      orders: parseInt(r.orders) || 0,
      group_name: r.group_name,
    })),
  };
}

/**
 * Retorna pedidos de um produto (svk) em um período, excluindo cancelados.
 */
async function getProductOrders(svk, start, end) {
  const result = await db.query(
    `SELECT
       s.order_id AS "orderId",
       s.date,
       s.store,
       COALESCE(st.name, s.store) AS loja,
       s.product,
       s.variation,
       s.sku,
       s.quantity,
       s.total,
       s.unit_price AS "unitPrice",
       s.state,
       s.platform,
       s.status,
       s.client_name AS "clientName",
       s.sale_channel AS "saleChannel"
     FROM sales s
     LEFT JOIN stores st ON st.id = s.cod_store
     WHERE (COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name)) = $1
       AND s.date::date >= $2::date AND s.date::date <= $3::date
       AND (s.status IS NULL OR s.status = ''
         OR LOWER(TRANSLATE(s.status, 'áàãâéêíóôõúüç', 'aaaaeeiooouuc'))
           NOT SIMILAR TO '%(cancelado|cancel)%')
     ORDER BY s.date DESC`,
    [svk, start, end]
  );
  return result.rows.map((r) => ({
    ...r,
    quantity: parseFloat(r.quantity) || 0,
    total: parseFloat(r.total) || 0,
    unitPrice: parseFloat(r.unitPrice) || 0,
  }));
}

module.exports = {
  listProducts,
  updateKitQty,
  getVariationPrefixes,
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
  getProductDashboard,
  getProductOrders,
};
