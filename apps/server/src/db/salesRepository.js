const db = require('./connection');

/**
 * Batch upsert sales data
 * Uses PostgreSQL INSERT ... ON CONFLICT UPDATE for atomic upserts
 * Processes in batches to avoid parameter limit
 * @param {Array} salesData - Array of normalized sale objects
 * @returns {Promise<{inserted: number, updated: number}>}
 */
async function batchUpsertSales(salesData) {
  if (!salesData || salesData.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // Process in batches of 500 to avoid PostgreSQL parameter limit (~65535)
  const BATCH_SIZE = 500;
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < salesData.length; i += BATCH_SIZE) {
    const batch = salesData.slice(i, i + BATCH_SIZE);
    const result = await upsertBatch(batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
  }

  return { inserted: totalInserted, updated: totalUpdated };
}

/**
 * Internal function to upsert a single batch
 */
async function upsertBatch(batch) {
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
        sale.image || ''
      ];

      values.push(
        `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, ` +
        `$${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, ` +
        `$${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, ` +
        `$${paramIndex+12}, $${paramIndex+13}, $${paramIndex+14}, $${paramIndex+15})`
      );
      params.push(...rowParams);
      paramIndex += 16;
    });

    const query = `
      INSERT INTO sales (
        order_id, date, store, product, ad_name, variation, sku,
        quantity, total, unit_price, state, platform, status,
        cancel_by, cancel_reason, image
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
  const { start, end, store, state, platform, status } = filters;

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
      image
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

module.exports = {
  batchUpsertSales,
  getSales,
  hasSales,
  clearSales,
  getStores,
  getStates
};
