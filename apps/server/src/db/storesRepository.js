const db = require('./connection');
const { encrypt, decrypt } = require('../lib/encryption');

// Safely decrypt a field — returns null if value is missing or decryption fails
function safeDecrypt(value) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

// Row from DB → object safe for API responses (no raw credentials)
function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    platform_user_id: row.platform_user_id,
    platform_seller_name: row.platform_seller_name,
    status: row.status,
    has_credentials: !!(row.client_id_enc && row.client_secret_enc),
    token_expires_at: row.token_expires_at,
    last_sync_at: row.last_sync_at,
    total_listings: row.total_listings,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Row from DB → object with decrypted credentials (for internal server use)
function toPrivate(row) {
  return {
    ...toPublic(row),
    client_id: safeDecrypt(row.client_id_enc),
    client_secret: safeDecrypt(row.client_secret_enc),
    access_token: safeDecrypt(row.access_token_enc),
    refresh_token: safeDecrypt(row.refresh_token_enc),
  };
}

async function listStores() {
  const result = await db.query(
    'SELECT * FROM stores ORDER BY platform, name'
  );
  return result.rows.map(toPublic);
}

async function getStoreById(id) {
  const result = await db.query('SELECT * FROM stores WHERE id = $1', [id]);
  if (!result.rows[0]) return null;
  return result.rows[0];
}

async function getStoreCredentials(id) {
  const row = await getStoreById(id);
  if (!row) return null;
  return toPrivate(row);
}

async function createStore({ name, platform, client_id, client_secret, access_token, refresh_token, platform_user_id }) {
  const result = await db.query(
    `INSERT INTO stores
      (name, platform, platform_user_id, client_id_enc, client_secret_enc, access_token_enc, refresh_token_enc)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      name,
      platform,
      platform_user_id || null,
      client_id ? encrypt(client_id) : null,
      client_secret ? encrypt(client_secret) : null,
      access_token ? encrypt(access_token) : null,
      refresh_token ? encrypt(refresh_token) : null,
    ]
  );
  return toPublic(result.rows[0]);
}

async function updateStore(id, { name, client_id, client_secret, access_token, refresh_token, platform_user_id, platform_seller_name }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (platform_user_id !== undefined) { fields.push(`platform_user_id = $${idx++}`); values.push(platform_user_id); }
  if (platform_seller_name !== undefined) { fields.push(`platform_seller_name = $${idx++}`); values.push(platform_seller_name); }
  if (client_id !== undefined) { fields.push(`client_id_enc = $${idx++}`); values.push(client_id ? encrypt(client_id) : null); }
  if (client_secret !== undefined) { fields.push(`client_secret_enc = $${idx++}`); values.push(client_secret ? encrypt(client_secret) : null); }
  if (access_token !== undefined) { fields.push(`access_token_enc = $${idx++}`); values.push(access_token ? encrypt(access_token) : null); }
  if (refresh_token !== undefined) { fields.push(`refresh_token_enc = $${idx++}`); values.push(refresh_token ? encrypt(refresh_token) : null); }

  if (fields.length === 0) return getStoreById(id).then(r => r ? toPublic(r) : null);

  values.push(id);
  const result = await db.query(
    `UPDATE stores SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
  return toPublic(result.rows[0]);
}

async function updateStoreSync(id, { status, platform_seller_name, platform_user_id, total_listings, token_expires_at }) {
  const result = await db.query(
    `UPDATE stores
     SET status = $1, platform_seller_name = $2, platform_user_id = $3,
         total_listings = $4, token_expires_at = $5, last_sync_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [status, platform_seller_name, platform_user_id, total_listings, token_expires_at, id]
  );
  if (!result.rows[0]) return null;
  return toPublic(result.rows[0]);
}

async function updateStoreTokens(id, { access_token, refresh_token, token_expires_at }) {
  // COALESCE: nunca apagar um refresh_token existente por falta de um novo —
  // sem ele a conexão morre em 6h ("no refresh_token — user must re-authorize").
  const result = await db.query(
    `UPDATE stores
     SET access_token_enc = $1,
         refresh_token_enc = COALESCE($2, refresh_token_enc),
         token_expires_at = $3, status = 'connected'
     WHERE id = $4
     RETURNING *`,
    [
      access_token ? encrypt(access_token) : null,
      refresh_token ? encrypt(refresh_token) : null,
      token_expires_at || null,
      id,
    ]
  );
  if (!result.rows[0]) return null;
  return toPublic(result.rows[0]);
}

async function deleteStore(id) {
  const result = await db.query('DELETE FROM stores WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = {
  listStores,
  getStoreById,
  getStoreCredentials,
  createStore,
  updateStore,
  updateStoreSync,
  updateStoreTokens,
  deleteStore,
};
