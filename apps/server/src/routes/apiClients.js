/**
 * Administração das credenciais da API externa (Configurações → API).
 * Acesso: usuários com o módulo "configuracoes".
 */
const express = require('express');
const { authenticate, requireModule } = require('../middleware/auth');
const repo = require('../db/apiClientsRepository');
const { SCOPES, API_BASE, normalizeScopes, isValidScope } = require('../api/routeRegistry');

const router = express.Router();
router.use(authenticate, requireModule('configuracoes'));

function parseExpires(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Data de expiração inválida.');
  return d.toISOString();
}

function parseRateLimit(value) {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error('Limite por minuto inválido (0 = sem limite, máx. 100000).');
  return n;
}

function validateScopes(scopes) {
  if (scopes === undefined) return undefined;
  if (!Array.isArray(scopes)) throw new Error('scopes deve ser uma lista.');
  const bad = scopes.filter((s) => !isValidScope(s));
  if (bad.length) throw new Error(`Rota(s) desconhecida(s): ${bad.join(', ')}.`);
  return normalizeScopes(scopes);
}

// Rotas disponíveis (para a tela montar os checkboxes e a documentação)
router.get('/routes', (_req, res) => res.json({ base: API_BASE, scopes: SCOPES }));

// PDF da documentação (gerado do registro de rotas)
router.get('/docs.pdf', (req, res) => {
  try {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const fallback = host ? `${proto}://${host}${API_BASE}` : API_BASE;
    const baseUrl = String(req.query.base_url || fallback).slice(0, 300);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Documentacao_API_externa.pdf"');
    const { createApiDocsPdf } = require('../services/apiDocsPdf');
    createApiDocsPdf({ baseUrl }).pipe(res);
  } catch (err) {
    console.error('[API Clients] docs pdf error:', err);
    res.status(500).json({ message: 'Erro ao gerar o PDF da documentação.' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const [clients, usage] = await Promise.all([repo.listClients(), repo.usageSummary({ days: 7 })]);
    res.json(clients.map((c) => ({ ...c, usage_7d: usage[c.id] || { requests: 0, errors: 0, avg_ms: null } })));
  } catch (err) {
    console.error('[API Clients] list error:', err);
    res.status(500).json({ message: 'Erro ao listar credenciais.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, scopes, rate_limit_per_min, expires_at } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const result = await repo.createClient({
      name: String(name).trim().slice(0, 120),
      description: description ? String(description).slice(0, 2000) : null,
      scopes: validateScopes(scopes) || [],
      rate_limit_per_min: parseRateLimit(rate_limit_per_min) ?? 120,
      expires_at: parseExpires(expires_at) ?? null,
      created_by: req.user.id,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[API Clients] create error:', err);
    res.status(400).json({ message: err.message || 'Erro ao criar credencial.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, description, scopes, active, rate_limit_per_min, expires_at } = req.body || {};
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const client = await repo.updateClient(req.params.id, {
      name: name !== undefined ? String(name).trim().slice(0, 120) : undefined,
      description: description !== undefined ? (description ? String(description).slice(0, 2000) : null) : undefined,
      scopes: validateScopes(scopes),
      active: active !== undefined ? !!active : undefined,
      rate_limit_per_min: parseRateLimit(rate_limit_per_min),
      expires_at: parseExpires(expires_at),
    });
    if (!client) return res.status(404).json({ message: 'Credencial não encontrada.' });
    res.json(client);
  } catch (err) {
    console.error('[API Clients] update error:', err);
    res.status(400).json({ message: err.message || 'Erro ao atualizar credencial.' });
  }
});

router.post('/:id/rotate', async (req, res) => {
  try {
    const result = await repo.rotateKey(req.params.id);
    if (!result) return res.status(404).json({ message: 'Credencial não encontrada.' });
    res.json(result);
  } catch (err) {
    console.error('[API Clients] rotate error:', err);
    res.status(500).json({ message: 'Erro ao gerar nova chave.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await repo.deleteClient(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Credencial não encontrada.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API Clients] delete error:', err);
    res.status(500).json({ message: 'Erro ao excluir credencial.' });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await repo.listLogs(req.params.id, { limit: req.query.limit || 100 });
    res.json(logs);
  } catch (err) {
    console.error('[API Clients] logs error:', err);
    res.status(500).json({ message: 'Erro ao carregar log de requisições.' });
  }
});

module.exports = router;
