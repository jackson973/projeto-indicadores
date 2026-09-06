const test = require('node:test');
const assert = require('node:assert/strict');

// Mock do db ANTES de importar repositório/middleware
const { mockDb, setQueryResults, resetMock, getQueryCalls } = require('./helpers/mockDb');
const connectionPath = require.resolve('../src/db/connection');
require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };

const repo = require('../src/db/apiClientsRepository');
const registry = require('../src/api/routeRegistry');
const { hasScope, checkRateLimit, resetRateLimits, extractKey, apiKeyAuth, requireScope } = require('../src/middleware/apiKeyAuth');

// ── Registro de rotas ────────────────────────────────────────────────────────

test('routeRegistry: escopos únicos e health sempre liberado', () => {
  const keys = registry.SCOPES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('health'));
  assert.ok(registry.SCOPES.find((s) => s.key === 'health').always);
  for (const k of ['stores', 'sales', 'orders', 'products', 'stock', 'indicators', 'marketplaces']) {
    assert.ok(keys.includes(k), `falta o escopo ${k}`);
  }
});

test('normalizeScopes: remove inválidos e duplicados, aceita *', () => {
  assert.deepEqual(registry.normalizeScopes(['sales', 'sales', 'xpto', ' stock ', '*']), ['sales', 'stock', '*']);
  assert.deepEqual(registry.normalizeScopes(null), []);
});

// ── Chaves ───────────────────────────────────────────────────────────────────

test('generateKey: prefixo ind_ + 40 hex, hash sha256 determinístico', () => {
  const key = repo.generateKey();
  assert.match(key, /^ind_[0-9a-f]{40}$/);
  assert.notEqual(repo.generateKey(), key);
  assert.equal(repo.hashKey(key), repo.hashKey(key));
  assert.match(repo.hashKey(key), /^[0-9a-f]{64}$/);
  assert.equal(repo.keyPrefixOf(key), key.slice(0, 12));
});

test('createClient: grava hash (nunca a chave) e devolve a chave uma vez', async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 7, name: 'BI', key_prefix: 'ind_abc', scopes: ['sales'], active: true, request_count: 0 }] }]);
  const { client, key } = await repo.createClient({ name: 'BI', scopes: ['sales', 'xpto'], created_by: 1 });
  assert.match(key, /^ind_/);
  assert.equal(client.id, 7);
  const call = getQueryCalls()[0];
  assert.ok(call.text.includes('INSERT INTO api_clients'));
  assert.equal(call.params[3], repo.hashKey(key));      // key_hash
  assert.ok(!call.params.includes(key));                 // chave em texto não vai pro banco
  assert.deepEqual(call.params[4], ['sales']);           // escopo inválido descartado
});

test('findByKey: ignora chaves sem o prefixo sem consultar o banco', async () => {
  resetMock();
  assert.equal(await repo.findByKey('abc'), null);
  assert.equal(getQueryCalls().length, 0);
});

// ── Escopos ──────────────────────────────────────────────────────────────────

test('hasScope: health sempre, * libera tudo, escopo explícito', () => {
  assert.ok(hasScope({ scopes: [] }, 'health'));
  assert.ok(hasScope({ scopes: ['*'] }, 'stock'));
  assert.ok(hasScope({ scopes: ['sales'] }, 'sales'));
  assert.ok(!hasScope({ scopes: ['sales'] }, 'stock'));
  assert.ok(!hasScope(null, 'stock'));
});

// ── Rate limit ───────────────────────────────────────────────────────────────

test('checkRateLimit: bloqueia acima do limite e reinicia na janela seguinte', () => {
  resetRateLimits();
  const t0 = 1_700_000_000_000;
  assert.ok(checkRateLimit(1, 2, t0).allowed);
  assert.ok(checkRateLimit(1, 2, t0 + 10).allowed);
  assert.ok(!checkRateLimit(1, 2, t0 + 20).allowed);
  assert.ok(checkRateLimit(2, 2, t0 + 20).allowed);           // outra credencial não é afetada
  assert.ok(checkRateLimit(1, 2, t0 + 60_000).allowed);       // nova janela
  assert.equal(checkRateLimit(1, 0, t0).remaining, null);     // 0 = sem limite
});

// ── Middleware ───────────────────────────────────────────────────────────────

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  return res;
}

test('extractKey: header X-API-Key, Bearer ou query api_key', () => {
  assert.equal(extractKey({ headers: { 'x-api-key': ' ind_1 ' }, query: {} }), 'ind_1');
  assert.equal(extractKey({ headers: { authorization: 'Bearer ind_2' }, query: {} }), 'ind_2');
  assert.equal(extractKey({ headers: {}, query: { api_key: 'ind_3' } }), 'ind_3');
  assert.equal(extractKey({ headers: {}, query: {} }), null);
});

test('apiKeyAuth: 401 sem chave, 401 chave inválida, 403 inativa/expirada, passa quando ok', async () => {
  resetRateLimits();
  let res = fakeRes();
  await apiKeyAuth({ headers: {}, query: {} }, res, () => assert.fail('não deveria passar'));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'missing_api_key');

  resetMock(); setQueryResults([{ rows: [] }]);
  res = fakeRes();
  await apiKeyAuth({ headers: { 'x-api-key': 'ind_x' }, query: {} }, res, () => assert.fail());
  assert.equal(res.body.error.code, 'invalid_api_key');

  resetMock(); setQueryResults([{ rows: [{ id: 1, name: 'a', scopes: [], active: false, rate_limit_per_min: 10, expires_at: null }] }]);
  res = fakeRes();
  await apiKeyAuth({ headers: { 'x-api-key': 'ind_x' }, query: {} }, res, () => assert.fail());
  assert.equal(res.body.error.code, 'api_key_disabled');

  resetMock(); setQueryResults([{ rows: [{ id: 1, name: 'a', scopes: [], active: true, rate_limit_per_min: 10, expires_at: '2000-01-01T00:00:00Z' }] }]);
  res = fakeRes();
  await apiKeyAuth({ headers: { 'x-api-key': 'ind_x' }, query: {} }, res, () => assert.fail());
  assert.equal(res.body.error.code, 'api_key_expired');

  resetMock(); setQueryResults([{ rows: [{ id: 1, name: 'a', scopes: ['sales'], active: true, rate_limit_per_min: 10, expires_at: null }] }]);
  res = fakeRes();
  const req = { headers: { 'x-api-key': 'ind_x' }, query: {} };
  let passed = false;
  await apiKeyAuth(req, res, () => { passed = true; });
  assert.ok(passed);
  assert.equal(req.apiClient.id, 1);
  assert.equal(res.headers['X-RateLimit-Limit'], '10');
});

test('requireScope: 403 sem o escopo, next com o escopo', () => {
  let res = fakeRes();
  requireScope('stock')({ apiClient: { scopes: ['sales'] } }, res, () => assert.fail());
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'scope_denied');

  let ok = false;
  requireScope('stock')({ apiClient: { scopes: ['*'] } }, fakeRes(), () => { ok = true; });
  assert.ok(ok);
});
