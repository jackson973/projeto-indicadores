const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { authenticate, requireModule } = require('../middleware/auth');
const requireAdmin = requireModule('estoque');
const repo = require('../db/stockRepository');

const router = express.Router();

router.use(authenticate);

// ─── Multer (upload de imagem do produto) ────────────────────────────────────

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const uploadDir = path.join(UPLOADS_ROOT, 'stock-products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// ─── Produtos ────────────────────────────────────────────────────────────────

// GET /api/stock/products?search=&includeInactive=
router.get('/products', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const products = await repo.getProducts({ search: req.query.search, includeInactive });
    res.json(products);
  } catch (err) {
    console.error('stock/products GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const product = await repo.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  } catch (err) {
    console.error('stock/products/:id GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stock/products
router.post('/products', requireAdmin, async (req, res) => {
  try {
    const { codigo, descricao, familia, default_kit_qty, initial_cost, sale_price, variants } = req.body;
    if (!codigo || !descricao) return res.status(400).json({ error: 'Informe código e descrição' });
    const product = await repo.createProduct({ codigo, descricao, familia, default_kit_qty, initial_cost, sale_price, variants });
    res.json(product);
  } catch (err) {
    console.error('stock/products POST error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Código de produto ou variante já existe' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/stock/products/:id
router.put('/products/:id', requireAdmin, async (req, res) => {
  try {
    const { codigo, descricao, familia, default_kit_qty, initial_cost, sale_price, variants } = req.body;
    const product = await repo.updateProduct(req.params.id, { codigo, descricao, familia, default_kit_qty, initial_cost, sale_price, variants });
    res.json(product);
  } catch (err) {
    console.error('stock/products/:id PUT error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Código de produto ou variante já existe' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stock/products/:id (soft delete)
router.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    await repo.deleteProduct(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('stock/products/:id DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stock/products/:id/photo
router.post('/products/:id/photo', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const filename = `stock-${req.params.id}-${Date.now()}.webp`;
    const destPath = path.join(uploadDir, filename);
    await sharp(req.file.buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(destPath);
    const imageUrl = `/uploads/stock-products/${filename}`;
    await repo.updateProductPhoto(req.params.id, imageUrl);
    res.json({ imageUrl });
  } catch (err) {
    console.error('stock/products photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Códigos de barras ───────────────────────────────────────────────────────

// GET /api/stock/variants/:id/barcodes
router.get('/variants/:id/barcodes', async (req, res) => {
  try { res.json(await repo.getBarcodesForVariant(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/stock/variants/:id/barcodes  body: { barcodes: ["...","..."] } ou { barcode: "..." }
router.post('/variants/:id/barcodes', requireAdmin, async (req, res) => {
  try {
    const list = Array.isArray(req.body.barcodes)
      ? req.body.barcodes
      : (req.body.barcode ? [req.body.barcode] : []);
    if (list.length === 0) return res.status(400).json({ error: 'Envie um ou mais códigos de barras' });
    const result = await repo.addBarcodesBulk(req.params.id, list);
    res.json(result);
  } catch (err) {
    console.error('stock/variants barcodes POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stock/barcodes/:id
router.delete('/barcodes/:id', requireAdmin, async (req, res) => {
  try { await repo.removeBarcode(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/stock/scan/:barcode — resolve EAN → variante + produto + saldo
router.get('/scan/:barcode', async (req, res) => {
  try {
    const result = await repo.lookupBarcode(req.params.barcode);
    if (!result) return res.status(404).json({ error: 'Código de barras não cadastrado' });
    res.json(result);
  } catch (err) {
    console.error('stock/scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Motivos de movimentação ─────────────────────────────────────────────────

// GET /api/stock/reasons?includeInactive=
router.get('/reasons', async (req, res) => {
  try { res.json(await repo.getReasons({ includeInactive: req.query.includeInactive === 'true' })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reasons', requireAdmin, async (req, res) => {
  try {
    const { nome, direcao, sort_order } = req.body;
    if (!nome || !['entrada', 'saida'].includes(direcao)) {
      return res.status(400).json({ error: 'Informe nome e direção (entrada/saida)' });
    }
    res.json(await repo.createReason({ nome, direcao, sort_order }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/reasons/:id', requireAdmin, async (req, res) => {
  try { res.json(await repo.updateReason(req.params.id, req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/reasons/:id', requireAdmin, async (req, res) => {
  try { await repo.deleteReason(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Movimentos (operacional — qualquer usuário logado) ──────────────────────

// POST /api/stock/movements  body: { variant_id, tipo:'entrada'|'saida', qty, reason_id?, note?, unit_cost? }
router.post('/movements', async (req, res) => {
  try {
    const { variant_id, tipo, qty, reason_id, note, unit_cost } = req.body;
    if (!variant_id) return res.status(400).json({ error: 'Informe a variante' });
    const mov = await repo.applyMovement({ variant_id, tipo, qty, reason_id, note, unit_cost, user_id: req.user.id });
    res.json(mov);
  } catch (err) {
    console.error('stock/movements POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stock/opening-cost  body: { items: [{ variant_id, unit_cost }] }  — semeia o custo médio inicial
router.post('/opening-cost', requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const rows = await repo.applyOpeningCost(items, req.user.id);
    res.json({ ok: true, count: rows.length, movements: rows });
  } catch (err) {
    console.error('stock/opening-cost POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/movements?variant_id=&from=&to=&tipo=&limit=
router.get('/movements', async (req, res) => {
  try {
    const { variant_id, from, to, tipo, limit } = req.query;
    res.json(await repo.getMovements({ variant_id, from, to, tipo, limit: limit ? +limit : 100 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Inventário / acerto (operacional) ───────────────────────────────────────

router.get('/inventory', async (req, res) => {
  try { res.json(await repo.listInventorySessions()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/inventory', async (req, res) => {
  try {
    const { modo, note } = req.body;
    res.json(await repo.openInventorySession({ modo, note, user_id: req.user.id }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/inventory/:id', async (req, res) => {
  try {
    const session = await repo.getInventorySession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/stock/inventory/:id/count  body: { variant_id, counted_qty? } ou { variant_id, increment }
router.post('/inventory/:id/count', async (req, res) => {
  try {
    const { variant_id, counted_qty, increment } = req.body;
    if (!variant_id) return res.status(400).json({ error: 'Informe a variante' });
    let row;
    if (increment !== undefined) row = await repo.incrementInventoryCount(req.params.id, variant_id, increment, req.user.id);
    else row = await repo.setInventoryCount(req.params.id, variant_id, counted_qty, req.user.id);
    res.json(row);
  } catch (err) {
    console.error('stock/inventory count error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/inventory/:id/count/:variantId', async (req, res) => {
  try { await repo.removeInventoryCount(req.params.id, req.params.variantId); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/inventory/:id/finalize', async (req, res) => {
  try { res.json(await repo.finalizeInventorySession(req.params.id, req.user.id)); }
  catch (err) {
    console.error('stock/inventory finalize error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/inventory/:id/cancel', async (req, res) => {
  try { await repo.cancelInventorySession(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Relatórios ──────────────────────────────────────────────────────────────

// GET /api/stock/reports/consumption?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/reports/consumption', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Informe o período (from/to)' });
    // 'to' é inclusivo no front; aqui usamos exclusivo no fim do dia
    const toExclusive = `${to} 23:59:59.999`;
    const rows = await repo.getConsumptionReport({ from, to: toExclusive });
    const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
    const data = rows.map(r => {
      const totalOut = Number(r.total_out) || 0;
      const avgDaily = totalOut / days;
      const coverageDays = avgDaily > 0 ? r.balance / avgDaily : null;
      return { ...r, total_out: totalOut, avg_daily: avgDaily, coverage_days: coverageDays };
    });
    res.json({ from, to, days, items: data });
  } catch (err) {
    console.error('stock/reports/consumption error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/reports/low-stock?full=true  (full = grade completa dos produtos em alerta)
router.get('/reports/low-stock', async (req, res) => {
  try { res.json(await repo.getLowStock({ fullGrid: req.query.full === 'true' })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/stock/reports/low-stock.pdf
// PDF do alerta, no mesmo layout da tela: uma linha por produto-pai com os
// tamanhos lado a lado (ordem da grade) e saldo/mínimo em cada um.
router.get('/reports/low-stock.pdf', async (req, res) => {
  try {
    const fullGrid = req.query.full === 'true';
    const rows = await repo.getLowStock({ fullGrid });

    const SIZE_ORDER = ['PRE', 'RN', 'P', 'M', 'G', 'GG'];
    const sizeRank = (t) => {
      const up = String(t || '').toUpperCase().trim();
      const named = SIZE_ORDER.indexOf(up);
      if (named >= 0) return named;
      const n = parseInt(up, 10);
      return Number.isNaN(n) ? 999 : SIZE_ORDER.length + n;
    };
    const byProd = new Map();
    for (const v of rows) {
      const g = byProd.get(v.product_codigo) ||
        { codigo: v.product_codigo, descricao: v.descricao, variants: [] };
      g.variants.push(v);
      byProd.set(v.product_codigo, g);
    }
    const groups = [...byProd.values()]
      .map(g => ({ ...g, variants: g.variants.sort((a, b) => sizeRank(a.tamanho) - sizeRank(b.tamanho)) }))
      .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));

    const PDFDocument = require('pdfkit');
    const { getSaoPauloDate } = require('../lib/timezone');
    const [y, m, d] = getSaoPauloDate().split('-');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Estoque_Baixo_${d}-${m}-${y}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    doc.pipe(res);

    const RED = '#C0392B';
    const GREEN = '#1E7E34';
    const GREY = '#6B7683';
    const BORD = '#E0B4B4';
    const BORD_OK = '#B7DFC0';
    const LEFT = 40;
    const RIGHT = 555;
    const BOTTOM = 800;
    const CHIP_W = 44;
    const CHIP_H = 26;
    const GAP = 5;

    const lowCount = rows.filter((v) => v.low !== false).length;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(RED)
      .text('Produtos com estoque baixo', LEFT, 40);
    doc.font('Helvetica').fontSize(9).fillColor(GREY)
      .text(
        `Gerado em ${d}/${m}/${y} · ${groups.length} produtos, ${lowCount} tamanhos em alerta` +
        (fullGrid ? ' · grade completa (verde = acima do mínimo)' : '') +
        ' · valor = saldo/mínimo',
        LEFT, doc.y + 2
      );
    let cy = doc.y + 12;

    const chipsPerRow = Math.floor((RIGHT - LEFT) / (CHIP_W + GAP));

    for (const g of groups) {
      doc.font('Helvetica-Bold').fontSize(10);
      const name = `${g.codigo} · ${g.descricao}`;
      const nameH = doc.heightOfString(name, { width: RIGHT - LEFT });
      const chipRows = Math.ceil(g.variants.length / chipsPerRow);
      const blockH = nameH + 4 + chipRows * (CHIP_H + 4) + 10;
      if (cy + blockH > BOTTOM) { doc.addPage(); cy = 40; }

      doc.fillColor('#000000').text(name, LEFT, cy, { width: RIGHT - LEFT });
      cy += nameH + 4;

      let cx = LEFT;
      for (const v of g.variants) {
        if (cx + CHIP_W > RIGHT) { cx = LEFT; cy += CHIP_H + 4; }
        const isLow = v.low !== false;
        doc.lineWidth(0.7).strokeColor(isLow ? BORD : BORD_OK)
          .roundedRect(cx, cy, CHIP_W, CHIP_H, 4).stroke();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000')
          .text(String(v.tamanho), cx + 1, cy + 4, { width: CHIP_W - 2, align: 'center', lineBreak: false });
        const bal = String(v.balance);
        const min = `/${v.min_stock}`;
        doc.font('Helvetica-Bold').fontSize(8.5);
        const wBal = doc.widthOfString(bal);
        doc.font('Helvetica').fontSize(8.5);
        const wMin = doc.widthOfString(min);
        const sx = cx + (CHIP_W - (wBal + wMin)) / 2;
        doc.font('Helvetica-Bold').fillColor(isLow ? RED : GREEN).text(bal, sx, cy + 14, { lineBreak: false });
        doc.font('Helvetica').fillColor(GREY).text(min, sx + wBal, cy + 14, { lineBreak: false });
        cx += CHIP_W + GAP;
      }
      cy += CHIP_H + 10;
      doc.lineWidth(0.4).strokeColor('#F0D8D8').moveTo(LEFT, cy - 5).lineTo(RIGHT, cy - 5).stroke();
    }

    if (!groups.length) {
      doc.font('Helvetica').fontSize(11).fillColor(GREY)
        .text('Nenhum produto abaixo do estoque mínimo.', LEFT, cy);
    }

    doc.end();
  } catch (err) {
    console.error('stock/reports/low-stock.pdf error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/reports/movements?from=&to=&tipo=&product_codigo=&tamanho=&q=&limit=
// Relatório de movimentações (bipagens/entradas/saídas/ajustes) com filtros.
router.get('/reports/movements', async (req, res) => {
  try {
    const { from, to, tipo, product_codigo, tamanho, q, limit } = req.query;
    const items = await repo.getMovementsReport({
      from, to, tipo, product_codigo, tamanho, q,
      limit: limit ? Math.min(Number(limit) || 1000, 5000) : 1000,
    });
    const totalIn = items.filter(m => m.qty > 0).reduce((s, m) => s + m.qty, 0);
    const totalOut = items.filter(m => m.qty < 0).reduce((s, m) => s + Math.abs(m.qty), 0);
    res.json({ from, to, count: items.length, total_in: totalIn, total_out: totalOut, items });
  } catch (err) {
    console.error('stock/reports/movements error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/reports/separation?from=&to=&product_codigo=&familia=
// Dashboard de Separação: agregações sobre as SAÍDAS bipadas no período.
router.get('/reports/separation', async (req, res) => {
  try {
    const { from, to, product_codigo, familia } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Informe o período (from/to)' });
    res.json(await repo.getSeparationDashboard({
      from, to,
      product_codigo: product_codigo || null,
      familia: familia || null,
    }));
  } catch (err) {
    console.error('stock/reports/separation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/reports/separation-options — produtos e famílias p/ os filtros.
router.get('/reports/separation-options', async (req, res) => {
  try { res.json(await repo.getSeparationFilters()); }
  catch (err) {
    console.error('stock/reports/separation-options error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
