const db = require('./connection');

/**
 * Batch upsert sales data
 * Uses PostgreSQL INSERT ... ON CONFLICT UPDATE for atomic upserts
 * Processes in batches to avoid parameter limit
 * @param {Array} salesData - Array of normalized sale objects
 * @returns {Promise<{inserted: number, updated: number}>}
 */
async function batchUpsertSales(salesData, saleChannel = 'online') {
  if (!salesData || salesData.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // Deduplicate data by (order_id, product, variation) - keep last occurrence
  // This prevents "ON CONFLICT DO UPDATE command cannot affect row a second time" error
  const deduped = new Map();
  salesData.forEach((sale) => {
    const key = `${sale.orderId}|${sale.product}|${sale.variation || ''}`;
    deduped.set(key, sale);
  });

  const uniqueSalesData = Array.from(deduped.values());

  console.log(`Deduplicated: ${salesData.length} rows -> ${uniqueSalesData.length} unique rows`);

  // Process in batches of 500 to avoid PostgreSQL parameter limit (~65535)
  const BATCH_SIZE = 500;
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < uniqueSalesData.length; i += BATCH_SIZE) {
    const batch = uniqueSalesData.slice(i, i + BATCH_SIZE);
    const result = await upsertBatch(batch, saleChannel);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
  }

  return { inserted: totalInserted, updated: totalUpdated };
}

/**
 * Internal function to upsert a single batch
 */
async function upsertBatch(batch, saleChannel = 'online') {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Build VALUES clause for batch insert
    const values = [];
    const params = [];
    let paramIndex = 1;

    batch.forEach((sale) => {
      const rowParams = [
        sale.orderId || '',
        sale.date,
        sale.store || 'Todas',
        sale.product || 'Geral',
        sale.adName || 'Geral',
        sale.variation || '',
        sale.sku || '',
        sale.quantity || 1,
        sale.total || 0,
        sale.unitPrice || 0,
        sale.state || 'Não informado',
        sale.platform || '',
        sale.status || '',
        sale.cancelBy || '',
        sale.cancelReason || '',
        sale.image || '',
        saleChannel,
        sale.clientName || '',
        sale.codcli || '',
        sale.nomeFantasia || '',
        sale.cnpjCpf || ''
      ];

      values.push(
        `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, ` +
        `$${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, ` +
        `$${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, ` +
        `$${paramIndex+12}, $${paramIndex+13}, $${paramIndex+14}, $${paramIndex+15}, ` +
        `$${paramIndex+16}, $${paramIndex+17}, $${paramIndex+18}, $${paramIndex+19}, ` +
        `$${paramIndex+20})`
      );
      params.push(...rowParams);
      paramIndex += 21;
    });

    const query = `
      INSERT INTO sales (
        order_id, date, store, product, ad_name, variation, sku,
        quantity, total, unit_price, state, platform, status,
        cancel_by, cancel_reason, image, sale_channel,
        client_name, codcli, nome_fantasia, cnpj_cpf
      ) VALUES ${values.join(', ')}
      ON CONFLICT (order_id, product, COALESCE(variation, ''))
      DO UPDATE SET
        date = EXCLUDED.date,
        store = EXCLUDED.store,
        ad_name = EXCLUDED.ad_name,
        sku = EXCLUDED.sku,
        quantity = EXCLUDED.quantity,
        total = EXCLUDED.total,
        unit_price = EXCLUDED.unit_price,
        state = EXCLUDED.state,
        platform = EXCLUDED.platform,
        status = EXCLUDED.status,
        cancel_by = EXCLUDED.cancel_by,
        cancel_reason = EXCLUDED.cancel_reason,
        image = EXCLUDED.image,
        sale_channel = EXCLUDED.sale_channel,
        client_name = EXCLUDED.client_name,
        codcli = EXCLUDED.codcli,
        nome_fantasia = EXCLUDED.nome_fantasia,
        cnpj_cpf = EXCLUDED.cnpj_cpf,
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted
    `;

    const result = await client.query(query, params);

    await client.query('COMMIT');

    // Count inserts vs updates
    const inserted = result.rows.filter(r => r.inserted).length;
    const updated = result.rows.length - inserted;

    return { inserted, updated };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in batch upsert:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all sales with optional filters
 */
async function getSales(filters = {}) {
  const { start, end, store, state, platform, status, sale_channel } = filters;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (start) {
    conditions.push(`date >= $${paramIndex++}`);
    params.push(new Date(start));
  }
  if (end) {
    // Add end of day if only date provided
    let endDate = new Date(end);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    }
    conditions.push(`date <= $${paramIndex++}`);
    params.push(endDate);
  }
  if (store) {
    conditions.push(`store = $${paramIndex++}`);
    params.push(store);
  }
  if (state) {
    conditions.push(`state = $${paramIndex++}`);
    params.push(state);
  }
  if (platform) {
    conditions.push(`platform = $${paramIndex++}`);
    params.push(platform);
  }
  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }
  if (sale_channel) {
    conditions.push(`sale_channel = $${paramIndex++}`);
    params.push(sale_channel);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const query = `
    SELECT
      id,
      order_id as "orderId",
      date,
      store,
      product,
      ad_name as "adName",
      variation,
      sku,
      quantity,
      total,
      unit_price as "unitPrice",
      state,
      platform,
      status,
      cancel_by as "cancelBy",
      cancel_reason as "cancelReason",
      image,
      sale_channel as "saleChannel",
      client_name as "clientName",
      codcli,
      nome_fantasia as "nomeFantasia",
      cnpj_cpf as "cnpjCpf"
    FROM sales
    ${whereClause}
    ORDER BY date DESC
  `;

  const result = await db.query(query, params);

  // Convert numeric fields from string to number (PostgreSQL returns NUMERIC as string)
  return result.rows.map(row => ({
    ...row,
    quantity: parseFloat(row.quantity) || 0,
    total: parseFloat(row.total) || 0,
    unitPrice: parseFloat(row.unitPrice) || 0
  }));
}

/**
 * Check if any sales data exists
 */
async function hasSales() {
  const result = await db.query('SELECT EXISTS(SELECT 1 FROM sales LIMIT 1) as exists');
  return result.rows[0].exists;
}

/**
 * Clear all sales data (for testing/reset)
 */
async function clearSales() {
  await db.query('TRUNCATE sales RESTART IDENTITY CASCADE');
}

/**
 * Get distinct stores
 */
async function getStores() {
  const result = await db.query(
    'SELECT DISTINCT store FROM sales ORDER BY store'
  );
  return result.rows.map(r => r.store);
}

/**
 * Get distinct states
 */
async function getStates() {
  const result = await db.query(
    `SELECT DISTINCT state FROM sales
     WHERE state IS NOT NULL AND state != ''
     ORDER BY state`
  );
  return result.rows.map(r => r.state);
}

/**
 * Get the timestamp of the last sales import/update
 */
async function getLastUpdate() {
  const result = await db.query(
    "SELECT MAX(updated_at) AT TIME ZONE 'UTC' as last_update FROM sales"
  );
  return result.rows[0]?.last_update || null;
}

/**
 * Get total revenue for a specific date (excluding canceled orders)
 */
async function getDailyRevenue(date, filters = {}) {
  const params = [date];
  let extraConditions = '';
  let paramIdx = 2;
  if (filters.store) {
    extraConditions += ` AND store = $${paramIdx++}`;
    params.push(filters.store);
  }
  if (filters.sale_channel) {
    extraConditions += ` AND sale_channel = $${paramIdx++}`;
    params.push(filters.sale_channel);
  }
  const result = await db.query(
    `SELECT COALESCE(SUM(total), 0) as revenue
     FROM sales
     WHERE date::date = $1::date${extraConditions}
       AND (
         status IS NULL OR status = ''
         OR LOWER(TRANSLATE(status, 'áàãâéêíóôõúüç', 'aaaaeeiooouuc'))
           NOT SIMILAR TO '%(cancelado)%'
       )`,
    params
  );
  return parseFloat(result.rows[0]?.revenue) || 0;
}

/**
 * Search sales by order_id, codcli, client_name or cnpj_cpf
 */
async function searchSales(searchTerm, limit = 500) {
  const term = `%${searchTerm}%`;
  const cleanTerm = `%${searchTerm.replace(/[.\-\/]/g, '')}%`;
  const query = `
    SELECT
      id, order_id as "orderId", date, store, product,
      ad_name as "adName", variation, sku, quantity, total,
      unit_price as "unitPrice", state, platform, status,
      cancel_by as "cancelBy", cancel_reason as "cancelReason",
      image, sale_channel as "saleChannel",
      client_name as "clientName", codcli,
      nome_fantasia as "nomeFantasia", cnpj_cpf as "cnpjCpf"
    FROM sales
    WHERE order_id ILIKE $1
       OR codcli ILIKE $1
       OR client_name ILIKE $1
       OR nome_fantasia ILIKE $1
       OR REPLACE(REPLACE(REPLACE(cnpj_cpf, '.', ''), '-', ''), '/', '') ILIKE $2
    ORDER BY date DESC
    LIMIT $3
  `;
  const result = await db.query(query, [term, cleanTerm, limit]);
  return result.rows.map(row => ({
    ...row,
    quantity: parseFloat(row.quantity) || 0,
    total: parseFloat(row.total) || 0,
    unitPrice: parseFloat(row.unitPrice) || 0
  }));
}

/**
 * Get daily sales details grouped by order for a specific date
 * Excludes canceled orders. Returns summary + detail rows.
 */
async function getDailySalesDetails(date, filters = {}) {
  const params = [date];
  let extraConditions = '';
  let paramIdx = 2;
  if (filters.store) {
    extraConditions += ` AND store = $${paramIdx++}`;
    params.push(filters.store);
  }
  if (filters.sale_channel) {
    extraConditions += ` AND sale_channel = $${paramIdx++}`;
    params.push(filters.sale_channel);
  }

  const notCanceled = `
    AND (
      status IS NULL OR status = ''
      OR LOWER(TRANSLATE(status, 'áàãâéêíóôõúüç', 'aaaaeeiooouuc'))
        NOT SIMILAR TO '%(cancelado)%'
    )`;

  const query = `
    SELECT
      order_id AS "orderId",
      MIN(date) AS date,
      COALESCE(NULLIF(store, ''), 'Todas') AS store,
      COALESCE(NULLIF(platform, ''), '-') AS platform,
      COALESCE(NULLIF(client_name, ''), '-') AS "clientName",
      COALESCE(NULLIF(state, ''), '-') AS state,
      SUM(quantity) AS quantity,
      SUM(total) AS total
    FROM sales
    WHERE date::date = $1::date${extraConditions}${notCanceled}
    GROUP BY order_id, store, platform, client_name, state
    ORDER BY MIN(date) DESC
  `;

  const result = await db.query(query, params);
  const rows = result.rows.map(r => ({
    ...r,
    quantity: parseFloat(r.quantity) || 0,
    total: parseFloat(r.total) || 0
  }));

  const totalValue = rows.reduce((sum, r) => sum + r.total, 0);

  return {
    summary: {
      total: Number(totalValue.toFixed(2)),
      orders: rows.length
    },
    rows
  };
}

module.exports = {
  batchUpsertSales,
  getSales,
  searchSales,
  hasSales,
  clearSales,
  getStores,
  getStates,
  getLastUpdate,
  getDailyRevenue,
  getDailySalesDetails
};
