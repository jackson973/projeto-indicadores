const cron = require('node-cron');
const db = require('../db/connection');
const storesRepo = require('../db/storesRepository');
const { getValidMlToken } = require('./mlTokenService');

/**
 * Daily ML snapshot scheduler
 *
 * Runs at 03:00 AM (Brasília) to collect visits (7d/15d/30d), sold_quantity,
 * available_quantity and price for every item of every connected ML store.
 *
 * This guarantees that trend comparison data is always available even on days
 * when no one opens the Anúncios dashboard.
 */

// ── ML helpers (same logic as anuncios.js, kept self-contained) ────────────

async function fetchAllItemIds(userId, token) {
  const ids = [];
  const limit = 50;
  let offset = 0;
  let total  = null;

  do {
    const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar IDs`);
    const data = await res.json();
    if (total === null) total = data.paging?.total || 0;
    const results = data.results || [];
    ids.push(...results);
    offset += results.length;
  } while (ids.length < total && offset < total);

  return ids;
}

async function fetchItemDetails(ids, token) {
  const BATCH = 20;
  const results = [];

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const url = `https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=id,price,sold_quantity,available_quantity`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const data = await res.json();
    for (const entry of data) {
      if (entry.code === 200 && entry.body) results.push(entry.body);
    }
  }

  return results;
}

async function fetchVisits(ids, token, days) {
  const map = {};
  const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo   = new Date().toISOString().split('T')[0];

  await Promise.all(
    ids.map(async (id) => {
      try {
        const url = `https://api.mercadolibre.com/visits/items?ids=${id}&date_from=${dateFrom}&date_to=${dateTo}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const val = data[id];
        map[id] = val == null ? 0
          : typeof val === 'object' ? (val.total_visits ?? val.visits ?? 0)
          : val;
      } catch { /* non-critical */ }
    })
  );

  return map;
}

async function snapshotStore(store) {
  const tag = `[ML Snapshot] Store ${store.id} (${store.name})`;
  const userId = store.platform_user_id;

  if (!store.access_token || !userId) {
    console.log(`${tag}: missing token or user ID — skipping`);
    return;
  }

  let token;
  try {
    token = await getValidMlToken(store); // refresh if expired
  } catch (err) {
    console.error(`${tag}: token refresh failed — ${err.message}`);
    return;
  }

  // Check if today's snapshot is already complete for this store
  const { rows: existing } = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM ml_anuncios_snapshots
     WHERE store_id = $1 AND snapshot_date = CURRENT_DATE AND visits_7d IS NOT NULL`,
    [store.id]
  );
  const existingCount = parseInt(existing[0].cnt, 10);

  // Fetch item IDs
  const allIds = await fetchAllItemIds(userId, token);
  if (allIds.length === 0) {
    console.log(`${tag}: no items found`);
    return;
  }

  if (existingCount === allIds.length) {
    console.log(`${tag}: today's snapshot already complete (${existingCount} items) — skipping`);
    return;
  }

  console.log(`${tag}: collecting snapshot for ${allIds.length} items...`);

  // Fetch in parallel: item details + 3 visit windows
  const [itemDetails, map7d, map15d, map30d] = await Promise.all([
    fetchItemDetails(allIds, token),
    fetchVisits(allIds, token, 7),
    fetchVisits(allIds, token, 15),
    fetchVisits(allIds, token, 30),
  ]);

  const detailMap = {};
  for (const item of itemDetails) detailMap[item.id] = item;

  // Upsert snapshots
  let saved = 0;
  for (const id of allIds) {
    const item = detailMap[id];
    if (!item) continue;
    try {
      await db.query(
        `INSERT INTO ml_anuncios_snapshots
           (store_id, item_id, snapshot_date, visits, visits_7d, visits_15d, sold_quantity, available_quantity, price)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (store_id, item_id, snapshot_date) DO UPDATE SET
           visits             = EXCLUDED.visits,
           visits_7d          = EXCLUDED.visits_7d,
           visits_15d         = EXCLUDED.visits_15d,
           sold_quantity      = EXCLUDED.sold_quantity,
           available_quantity = EXCLUDED.available_quantity,
           price              = EXCLUDED.price`,
        [
          store.id, id,
          map30d[id] || 0, map7d[id] || 0, map15d[id] || 0,
          item.sold_quantity || 0, item.available_quantity || 0, item.price || 0,
        ]
      );
      saved++;
    } catch (err) {
      console.error(`${tag}: error saving snapshot for ${id}:`, err.message);
    }
  }

  console.log(`${tag}: saved ${saved}/${allIds.length} snapshots`);
}

async function runSnapshotJob() {
  console.log('[ML Snapshot] Starting daily snapshot job...');
  try {
    const allStores = await storesRepo.listStores();
    const connected = allStores.filter((s) => s.status === 'connected');

    if (connected.length === 0) {
      console.log('[ML Snapshot] No connected stores — nothing to do');
      return;
    }

    console.log(`[ML Snapshot] Processing ${connected.length} store(s)...`);

    for (const publicStore of connected) {
      try {
        const store = await storesRepo.getStoreCredentials(publicStore.id);
        await snapshotStore(store);
      } catch (err) {
        console.error(`[ML Snapshot] Error on store ${publicStore.id}:`, err.message);
      }
    }

    console.log('[ML Snapshot] Daily snapshot job complete');
  } catch (err) {
    console.error('[ML Snapshot] Job failed:', err.message);
  }
}

function startMlSnapshotScheduler() {
  console.log('[ML Snapshot] Initializing... (daily at 03:00 Brasília)');

  cron.schedule('0 3 * * *', runSnapshotJob, {
    scheduled: true,
    timezone: 'America/Sao_Paulo',
  });

  console.log('[ML Snapshot] Scheduler started');
}

module.exports = { startMlSnapshotScheduler };
