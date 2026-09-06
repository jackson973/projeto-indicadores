const crypto = require('crypto');
const db = require('./connection');
const { normalizeScopes } = require('../api/routeRegistry');

const KEY_PREFIX = 'ind_';

/** Gera uma chave nova: ind_ + 40 hex (160 bits de entropia). */
function generateKey() {
  return `${KEY_PREFIX}${crypto.randomBytes(20).toString('hex')}`;
}

/** Hash da chave (sha256 hex). A chave tem alta entropia, então sha256 basta. */
function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

/** Prefixo visível da chave (ex: ind_a1b2c3d4…) para identificar na tela. */
function keyPrefixOf(key) {
  return String(key).slice(0, KEY_PREFIX.length + 8);
}

function toPublic(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    key_prefix: row.key_prefix,
    scopes: row.scopes || [],
    active: row.active,
    rate_limit_per_min: row.rate_limit_per_min,
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
    request_count: Number(row.request_count || 0),
    created_by: row.created_by,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listClients() {
  const { rows } = await db.query(
    `SELECT c.*, u.name AS created_by_name
       FROM api_clients c
       LEFT JOIN users u ON u.id = c.created_by
      ORDER BY c.created_at DESC`
  );
  return rows.map(toPublic);
}

async function getClientById(id) {
  const { rows } = await db.query(
    `SELECT c.*, u.name AS created_by_name
       FROM api_clients c LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = $1`,
    [id]
  );
  return toPublic(rows[0]);
}

/** Cria credencial. Retorna o registro público + a chave em texto (mostrada UMA vez). */
async function createClient({ name, description = null, scopes = [], rate_limit_per_min = 120, expires_at = null, created_by = null }) {
  const key = generateKey();
  const { rows } = await db.query(
    `INSERT INTO api_clients (name, description, key_prefix, key_hash, scopes, rate_limit_per_min, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, description, keyPrefixOf(key), hashKey(key), normalizeScopes(scopes), rate_limit_per_min, expires_at, created_by]
  );
  return { client: toPublic(rows[0]), key };
}

async function updateClient(id, { name, description, scopes, active, rate_limit_per_min, expires_at }) {
  const sets = [];
  const params = [];
  const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  if (name !== undefined) add('name', name);
  if (description !== undefined) add('description', description);
  if (scopes !== undefined) add('scopes', normalizeScopes(scopes));
  if (active !== undefined) add('active', !!active);
  if (rate_limit_per_min !== undefined) add('rate_limit_per_min', rate_limit_per_min);
  if (expires_at !== undefined) add('expires_at', expires_at);
  if (!sets.length) return getClientById(id);

  sets.push('updated_at = now()');
  params.push(id);
  const { rows } = await db.query(
    `UPDATE api_clients SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return toPublic(rows[0]);
}

/** Gera uma chave nova para a credencial (a antiga deixa de valer na hora). */
async function rotateKey(id) {
  const key = generateKey();
  const { rows } = await db.query(
    `UPDATE api_clients SET key_prefix = $1, key_hash = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [keyPrefixOf(key), hashKey(key), id]
  );
  if (!rows[0]) return null;
  return { client: toPublic(rows[0]), key };
}

async function deleteClient(id) {
  const { rowCount } = await db.query('DELETE FROM api_clients WHERE id = $1', [id]);
  return rowCount > 0;
}

/** Busca a credencial pela chave em texto (usado no middleware). Retorna null se não existir. */
async function findByKey(key) {
  if (!key || !String(key).startsWith(KEY_PREFIX)) return null;
  const { rows } = await db.query(
    `SELECT id, name, scopes, active, rate_limit_per_min, expires_at FROM api_clients WHERE key_hash = $1`,
    [hashKey(key)]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    scopes: row.scopes || [],
    active: row.active,
    rate_limit_per_min: row.rate_limit_per_min,
    expires_at: row.expires_at,
  };
}

/** Registra uma requisição e atualiza last_used/contador (fire-and-forget no middleware). */
async function logRequest({ client_id, method, path, route_key, status_code, duration_ms, ip }) {
  await db.query(
    `INSERT INTO api_request_logs (client_id, method, path, route_key, status_code, duration_ms, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [client_id, method, String(path || '').slice(0, 500), route_key, status_code, duration_ms, ip]
  );
  if (client_id) {
    await db.query(
      `UPDATE api_clients SET last_used_at = now(), request_count = request_count + 1 WHERE id = $1`,
      [client_id]
    );
  }
}

async function listLogs(clientId, { limit = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT id, method, path, route_key, status_code, duration_ms, ip, created_at
       FROM api_request_logs
      WHERE client_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [clientId, Math.min(Math.max(Number(limit) || 100, 1), 1000)]
  );
  return rows;
}

/** Resumo de uso dos últimos N dias (por credencial) para a tela. */
async function usageSummary({ days = 7 } = {}) {
  const { rows } = await db.query(
    `SELECT client_id,
            COUNT(*)::int AS requests,
            COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
            ROUND(AVG(duration_ms))::int AS avg_ms
       FROM api_request_logs
      WHERE created_at >= now() - ($1 || ' days')::interval
      GROUP BY client_id`,
    [String(days)]
  );
  const map = {};
  for (const r of rows) map[r.client_id] = { requests: r.requests, errors: r.errors, avg_ms: r.avg_ms };
  return map;
}

module.exports = {
  KEY_PREFIX,
  generateKey,
  hashKey,
  keyPrefixOf,
  listClients,
  getClientById,
  createClient,
  updateClient,
  rotateKey,
  deleteClient,
  findByKey,
  logRequest,
  listLogs,
  usageSummary,
};
