const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const productsRepo = require('../db/productsRepository');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ── GET /api/products/dashboard — product dashboard with kit_qty ─────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { start, end, group_ids, lojas } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'start e end são obrigatórios.' });
    const groupIds = group_ids ? group_ids.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean) : undefined;
    const lojasArr = lojas ? lojas.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const data = await productsRepo.getProductDashboard({ start, end, groupIds, lojas: lojasArr });
    res.json(data);
  } catch (err) {
    console.error('[Products] dashboard error:', err);
    res.status(500).json({ message: 'Erro ao gerar dashboard de produtos.' });
  }
});

// ── GET /api/products/dashboard/orders — orders for a specific product ────────
router.get('/dashboard/orders', async (req, res) => {
  try {
    const { svk, start, end, variationFilter } = req.query;
    if (!svk || !start || !end) return res.status(400).json({ message: 'svk, start e end são obrigatórios.' });
    const orders = await productsRepo.getProductOrders(svk, start, end, variationFilter || null);
    res.json(orders);
  } catch (err) {
    console.error('[Products] dashboard orders error:', err);
    res.status(500).json({ message: 'Erro ao buscar pedidos do produto.' });
  }
});

// ── GET /api/products — list distinct products from sales ────────────────────
router.get('/', async (req, res) => {
  try {
    const { codigo, nome, lojas, page, limit } = req.query;
    const lojasArr = lojas ? lojas.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const result = await productsRepo.listProducts({
      codigo: codigo || undefined,
      nome: nome || undefined,
      lojas: lojasArr,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json(result);
  } catch (err) {
    console.error('[Products] list error:', err);
    res.status(500).json({ message: 'Erro ao listar produtos.' });
  }
});

// ── GET /api/products/stores — distinct stores from sales ────────────────────
router.get('/stores', async (_req, res) => {
  try {
    const stores = await productsRepo.getDistinctStores();
    res.json(stores);
  } catch (err) {
    console.error('[Products] stores error:', err);
    res.status(500).json({ message: 'Erro ao buscar lojas.' });
  }
});

// ── PUT /api/products/kit-qty — update kit quantity by product name ──────────
router.put('/kit-qty', async (req, res) => {
  try {
    const { store_variation_key, kit_qty, nome } = req.body;
    if (!store_variation_key) return res.status(400).json({ message: 'store_variation_key é obrigatório.' });
    if (kit_qty == null || kit_qty < 1) {
      return res.status(400).json({ message: 'kit_qty deve ser >= 1.' });
    }
    const product = await productsRepo.updateKitQty(store_variation_key, kit_qty, { nome });
    res.json(product);
  } catch (err) {
    console.error('[Products] update kit_qty error:', err);
    res.status(500).json({ message: 'Erro ao atualizar qtd kit.' });
  }
});

// ── GET /api/products/variations — get variation prefixes for a product ───────
router.get('/variations', async (req, res) => {
  try {
    const { store_key, ad_name } = req.query;
    if (!store_key || !ad_name) return res.status(400).json({ message: 'store_key e ad_name são obrigatórios.' });
    const prefixes = await productsRepo.getVariationPrefixes(store_key, ad_name);
    res.json(prefixes);
  } catch (err) {
    console.error('[Products] variations error:', err);
    res.status(500).json({ message: 'Erro ao buscar variações.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Product Groups
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/products/groups ─────────────────────────────────────────────────
router.get('/groups', async (_req, res) => {
  try {
    res.json(await productsRepo.getProductGroups());
  } catch (err) {
    console.error('[Products] groups error:', err);
    res.status(500).json({ message: 'Erro ao listar grupos.' });
  }
});

// ── POST /api/products/groups ────────────────────────────────────────────────
router.post('/groups', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const group = await productsRepo.createProductGroup(name.trim());
    res.status(201).json(group);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Já existe um grupo com este nome.' });
    console.error('[Products] create group error:', err);
    res.status(500).json({ message: 'Erro ao criar grupo.' });
  }
});

// ── PUT /api/products/groups/:id ─────────────────────────────────────────────
router.put('/groups/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const group = await productsRepo.updateProductGroup(req.params.id, name.trim());
    if (!group) return res.status(404).json({ message: 'Grupo não encontrado.' });
    res.json(group);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Já existe um grupo com este nome.' });
    console.error('[Products] update group error:', err);
    res.status(500).json({ message: 'Erro ao atualizar grupo.' });
  }
});

// ── DELETE /api/products/groups/:id ──────────────────────────────────────────
router.delete('/groups/:id', async (req, res) => {
  try {
    await productsRepo.deleteProductGroup(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Products] delete group error:', err);
    res.status(500).json({ message: 'Erro ao excluir grupo.' });
  }
});

// ── GET /api/products/groups/:id/items ───────────────────────────────────────
router.get('/groups/:id/items', async (req, res) => {
  try {
    res.json(await productsRepo.getGroupItems(req.params.id));
  } catch (err) {
    console.error('[Products] group items error:', err);
    res.status(500).json({ message: 'Erro ao listar itens do grupo.' });
  }
});

// ── POST /api/products/groups/:id/items ──────────────────────────────────────
router.post('/groups/:id/items', async (req, res) => {
  try {
    const { ad_name, variation_filter } = req.body;
    if (!ad_name) return res.status(400).json({ message: 'ad_name é obrigatório.' });
    const item = await productsRepo.addItemToGroup(req.params.id, ad_name, variation_filter || null);
    res.status(201).json(item);
  } catch (err) {
    console.error('[Products] add item error:', err);
    res.status(500).json({ message: 'Erro ao adicionar item.' });
  }
});

// ── POST /api/products/groups/:id/items/batch ────────────────────────────────
router.post('/groups/:id/items/batch', async (req, res) => {
  try {
    const { ad_names, items } = req.body;
    // Support legacy (ad_names: string[]) and new (items: {ad_name, variation_filter}[])
    const data = items || (ad_names || []).map((n) => (typeof n === 'string' ? n : n));
    if (!data.length) return res.status(400).json({ message: 'ad_names ou items é obrigatório.' });
    const result = await productsRepo.addItemsToGroupBatch(req.params.id, data);
    res.status(201).json(result);
  } catch (err) {
    console.error('[Products] batch add error:', err);
    res.status(500).json({ message: 'Erro ao adicionar itens.' });
  }
});

// ── POST /api/products/groups/:groupId/items/remove-batch ────────────────────
// Uses POST instead of DELETE to avoid nginx issues with encoded slashes in body
router.post('/groups/:groupId/items/remove-batch', async (req, res) => {
  try {
    const { ad_names, items } = req.body;
    // Support legacy (ad_names: string[]) and new (items: {ad_name, variation_filter}[])
    const data = items || ad_names;
    if (!data || !data.length) return res.status(400).json({ message: 'ad_names ou items é obrigatório.' });
    const count = await productsRepo.removeItemsFromGroupBatch(req.params.groupId, data);
    res.json({ removed: count });
  } catch (err) {
    console.error('[Products] batch remove error:', err);
    res.status(500).json({ message: 'Erro ao remover itens.' });
  }
});

// ── POST /api/products/groups/:groupId/items/remove ─────────────────────────
// Uses POST instead of DELETE with :adName in URL path because ad_name can
// contain slashes (e.g. "RN/P/M/G/GG") which nginx rejects even when encoded.
router.post('/groups/:groupId/items/remove', async (req, res) => {
  try {
    const { ad_name, variation_filter } = req.body;
    if (!ad_name) return res.status(400).json({ message: 'ad_name é obrigatório.' });
    await productsRepo.removeItemFromGroup(req.params.groupId, ad_name, variation_filter || null);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Products] remove item error:', err);
    res.status(500).json({ message: 'Erro ao remover item.' });
  }
});

// ── GET /api/products/ads — all distinct ads with group info ─────────────────
router.get('/ads', async (_req, res) => {
  try {
    res.json(await productsRepo.getAllAdsWithGroup());
  } catch (err) {
    console.error('[Products] ads error:', err);
    res.status(500).json({ message: 'Erro ao listar anúncios.' });
  }
});

module.exports = router;
