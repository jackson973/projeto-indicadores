const express = require('express');
const { authenticate, requireModule } = require('../middleware/auth');
const requireAdmin = requireModule('custo-preco');
const repo = require('../db/costRepository');
const pricing = require('../db/pricingRepository');
const sim = require('../db/simulationRepository');

const router = express.Router();

router.use(authenticate);

// ─── Fornecedores ────────────────────────────────────────────────────────────
router.get('/suppliers', async (req, res) => {
  try {
    const rows = await repo.listSuppliers({
      search: req.query.search || '',
      includeInactive: req.query.includeInactive === 'true',
    });
    res.json(rows);
  } catch (err) {
    console.error('cost/suppliers GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/suppliers', requireAdmin, async (req, res) => {
  try {
    res.json(await repo.createSupplier(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/suppliers/:id', requireAdmin, async (req, res) => {
  try {
    res.json(await repo.updateSupplier(req.params.id, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/suppliers/:id', requireAdmin, async (req, res) => {
  try {
    await repo.deleteSupplier(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Status de configuração (custo/fornecedor/lojas) de todos os produtos
router.get('/config-status', async (req, res) => {
  try {
    res.json(await repo.getConfigStatus());
  } catch (err) {
    console.error('cost/config-status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Custos por produto ──────────────────────────────────────────────────────
router.get('/products/:id/costs', async (req, res) => {
  try {
    res.json(await repo.getProductCosts(req.params.id));
  } catch (err) {
    console.error('cost/products costs GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/products/:id/costs', requireAdmin, async (req, res) => {
  try {
    res.json(await repo.createProductCost({ ...req.body, product_id: Number(req.params.id) }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/costs/:id', requireAdmin, async (req, res) => {
  try {
    res.json(await repo.updateProductCost(req.params.id, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/costs/:id', requireAdmin, async (req, res) => {
  try {
    await repo.deleteProductCost(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Fase 2: Canais & Taxas ──────────────────────────────────────────────────
router.get('/fee-bands', async (req, res) => {
  try { res.json(await pricing.getFeeBands()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/fee-bands', requireAdmin, async (req, res) => {
  try { res.json(await pricing.createFeeBand(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.put('/fee-bands/:id', requireAdmin, async (req, res) => {
  try { res.json(await pricing.updateFeeBand(req.params.id, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/fee-bands/:id', requireAdmin, async (req, res) => {
  try { await pricing.deleteFeeBand(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Lojas de precificação (vêm das lojas das vendas) ────────────────────────
router.get('/stores', async (req, res) => {
  try { res.json(await pricing.listStoresForPricing()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/stores/sync', requireAdmin, async (req, res) => {
  try { res.json(await pricing.syncLojasFromSales()); }
  catch (err) { console.error('cost/stores/sync error:', err); res.status(500).json({ error: err.message }); }
});
router.put('/stores/:id', requireAdmin, async (req, res) => {
  try { res.json(await pricing.updateStore(req.params.id, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Preço de venda por loja ─────────────────────────────────────────────────
router.get('/products/:id/prices', async (req, res) => {
  try { res.json(await pricing.getProductPrices(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/products/:id/prices/:storeId', requireAdmin, async (req, res) => {
  try { res.json(await pricing.upsertProductPrice(Number(req.params.id), Number(req.params.storeId), req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/products/:id/prices/:storeId', requireAdmin, async (req, res) => {
  try { await pricing.deleteProductPrice(Number(req.params.id), Number(req.params.storeId)); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Valorização (read-only) ─────────────────────────────────────────────────
router.get('/valuation', async (req, res) => {
  try { res.json(await pricing.getValuation()); }
  catch (err) { console.error('cost/valuation error:', err); res.status(500).json({ error: err.message }); }
});

// ─── Fase 3: Simulador de cenários ───────────────────────────────────────────
router.get('/simulation-base', async (req, res) => {
  try { res.json(await sim.buildBase()); }
  catch (err) { console.error('cost/simulation-base error:', err); res.status(500).json({ error: err.message }); }
});
router.get('/simulations', async (req, res) => {
  try { res.json(await sim.list()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/simulations/:id', async (req, res) => {
  try {
    const s = await sim.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Cenário não encontrado' });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/simulations', requireAdmin, async (req, res) => {
  try { res.json(await sim.create({ ...req.body, user_id: req.user.id })); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.post('/simulations/:id/duplicate', requireAdmin, async (req, res) => {
  try { res.json(await sim.duplicate(req.params.id, req.user.id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/simulations/:id', requireAdmin, async (req, res) => {
  try { await sim.remove(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
// Exclui o grupo inteiro (todas as versões de um cenário)
router.delete('/simulation-groups/:id', requireAdmin, async (req, res) => {
  try { await sim.removeGroup(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
