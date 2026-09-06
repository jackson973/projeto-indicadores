/**
 * Autenticação da API externa (/api/v1) por chave.
 *
 * A chave vai no header `X-API-Key: ind_...` ou `Authorization: Bearer ind_...`.
 * Cada credencial tem escopos (rotas liberadas) e um limite de requisições/minuto.
 * Toda requisição é registrada em api_request_logs.
 */
const apiClientsRepo = require('../db/apiClientsRepository');
const { SCOPES } = require('../api/routeRegistry');

const ALWAYS_ALLOWED = new Set(SCOPES.filter((s) => s.always).map((s) => s.key));

function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function extractKey(req) {
  const direct = req.headers['x-api-key'];
  if (direct) return String(direct).trim();
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req.query && req.query.api_key) return String(req.query.api_key).trim();
  return null;
}

// ── Rate limit em memória (janela fixa de 1 minuto por credencial) ──────────
const buckets = new Map(); // clientId -> { windowStart, count }

function checkRateLimit(clientId, limitPerMin, now = Date.now()) {
  const limit = Number(limitPerMin) || 0;
  if (limit <= 0) return { allowed: true, remaining: null };
  const windowStart = Math.floor(now / 60000) * 60000;
  let b = buckets.get(clientId);
  if (!b || b.windowStart !== windowStart) {
    b = { windowStart, count: 0 };
    buckets.set(clientId, b);
  }
  b.count += 1;
  const remaining = Math.max(limit - b.count, 0);
  return { allowed: b.count <= limit, remaining, resetAt: windowStart + 60000 };
}

function resetRateLimits() { buckets.clear(); }

// Limpa buckets antigos de vez em quando para não crescer sem limite
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [id, b] of buckets) if (b.windowStart < cutoff) buckets.delete(id);
}, 300000).unref();

function hasScope(client, scopeKey) {
  if (!scopeKey) return false;
  if (ALWAYS_ALLOWED.has(scopeKey)) return true;
  const scopes = client?.scopes || [];
  return scopes.includes('*') || scopes.includes(scopeKey);
}

/** Middleware: valida a chave, expiração, ativo e rate limit. Popula req.apiClient. */
async function apiKeyAuth(req, res, next) {
  const key = extractKey(req);
  if (!key) {
    return apiError(res, 401, 'missing_api_key', 'Informe a chave no header X-API-Key (ou Authorization: Bearer).');
  }

  let client;
  try {
    client = await apiClientsRepo.findByKey(key);
  } catch (err) {
    console.error('[API v1] Erro ao validar chave:', err.message);
    return apiError(res, 500, 'auth_error', 'Erro ao validar a credencial.');
  }

  if (!client) return apiError(res, 401, 'invalid_api_key', 'Chave inválida.');
  if (!client.active) return apiError(res, 403, 'api_key_disabled', 'Credencial desativada.');
  if (client.expires_at && new Date(client.expires_at).getTime() < Date.now()) {
    return apiError(res, 403, 'api_key_expired', 'Credencial expirada.');
  }

  const rl = checkRateLimit(client.id, client.rate_limit_per_min);
  if (rl.remaining !== null) {
    res.set('X-RateLimit-Limit', String(client.rate_limit_per_min));
    res.set('X-RateLimit-Remaining', String(rl.remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  }
  if (!rl.allowed) {
    return apiError(res, 429, 'rate_limited', `Limite de ${client.rate_limit_per_min} requisições por minuto atingido.`);
  }

  req.apiClient = client;
  next();
}

/** Middleware por rota: exige que a credencial tenha o escopo. */
function requireScope(scopeKey) {
  return (req, res, next) => {
    req.apiRouteKey = scopeKey;
    if (hasScope(req.apiClient, scopeKey)) return next();
    return apiError(res, 403, 'scope_denied', `Esta credencial não tem acesso à rota "${scopeKey}".`);
  };
}

/** Middleware: registra a requisição ao terminar a resposta (não bloqueia). */
function apiRequestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const payload = {
      client_id: req.apiClient?.id || null,
      method: req.method,
      path: req.originalUrl,
      route_key: req.apiRouteKey || null,
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64),
    };
    apiClientsRepo.logRequest(payload).catch((err) => console.error('[API v1] Log error:', err.message));
  });
  next();
}

module.exports = { apiKeyAuth, requireScope, apiRequestLogger, hasScope, checkRateLimit, resetRateLimits, extractKey, apiError };
