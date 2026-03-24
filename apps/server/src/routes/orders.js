const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { authenticate, requireAdmin } = require('../middleware/auth');
const repo = require('../db/ordersRepository');
const sisplanRepo = require('../db/sisplanRepository');
const { queryFirebird, getFirebirdOptions } = require('../services/sisplanSyncService');

const router = express.Router();

// Allow token via query string (needed for PDF direct browser open)
router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

router.use(authenticate);

// ─── Multer setup ────────────────────────────────────────────────────────────

const uploadDir = path.join(process.cwd(), 'uploads', 'order-products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `product-${req.params.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// ─── Payment Conditions ──────────────────────────────────────────────────────

function toErpCode(terms) {
  const nums = String(terms).match(/\d+/g);
  if (!nums || nums.length === 0) return '';
  return nums.map(n => n.padEnd(3, ' ')).join('');
}

router.get('/payment-conditions', async (req, res) => {
  try { res.json(await repo.getPaymentConditions()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payment-conditions', requireAdmin, async (req, res) => {
  try {
    const { name, terms, sort_order } = req.body;
    const erp_code = toErpCode(terms);
    res.json(await repo.createPaymentCondition({ name, erp_code, sort_order }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/payment-conditions/:id', requireAdmin, async (req, res) => {
  try {
    const { name, terms, sort_order } = req.body;
    const erp_code = toErpCode(terms);
    res.json(await repo.updatePaymentCondition(req.params.id, { name, erp_code, sort_order }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/payment-conditions/:id', requireAdmin, async (req, res) => {
  try { await repo.deletePaymentCondition(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Catalog Products ────────────────────────────────────────────────────────

// GET /api/orders/catalog
router.get('/catalog', async (req, res) => {
  try {
    const products = await repo.getCatalogProducts();
    res.json(products);
  } catch (err) {
    console.error('orders/catalog GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/catalog
router.post('/catalog', requireAdmin, async (req, res) => {
  try {
    const product = await repo.createCatalogProduct(req.body);
    res.json(product);
  } catch (err) {
    console.error('orders/catalog POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/catalog/:id
router.put('/catalog/:id', requireAdmin, async (req, res) => {
  try {
    const product = await repo.updateCatalogProduct(req.params.id, req.body);
    res.json(product);
  } catch (err) {
    console.error('orders/catalog PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/catalog/:id
router.delete('/catalog/:id', requireAdmin, async (req, res) => {
  try {
    await repo.deleteCatalogProduct(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('orders/catalog DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/catalog/:id/photo
router.post('/catalog/:id/photo', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const photoUrl = `/uploads/order-products/${req.file.filename}`;
    await repo.updateCatalogProductPhoto(req.params.id, photoUrl);
    res.json({ photoUrl });
  } catch (err) {
    console.error('orders/catalog photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/sisplan-products — for catalog config: grouped reference products
router.get('/sisplan-products', requireAdmin, async (req, res) => {
  try {
    const db = require('../db/connection');
    const { rows } = await db.query(
      `SELECT id, codigo, descricao, cod_cor, desc_cor, tamanho, sku
       FROM sisplan_products WHERE active=true
       ORDER BY codigo, tamanho`
    );
    res.json(rows);
  } catch (err) {
    console.error('orders/sisplan-products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Customers ───────────────────────────────────────────────────────────────

// GET /api/orders/customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await repo.getCustomers(req.query.search);
    res.json(customers);
  } catch (err) {
    console.error('orders/customers GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/customers/sync  — sync from Sisplan Firebird
router.post('/customers/sync', requireAdmin, async (req, res) => {
  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings) return res.status(400).json({ error: 'Sisplan não configurado' });

    const fbOptions = getFirebirdOptions(settings);

    const sql = req.body.sql || `
      SELECT
        ent.CODCLI                                                                                                                AS "sisplan_id",
        iif(ent.FANTASIA = '', ent.NOME, ent.FANTASIA)                                                                           AS "fantasy_name",
        ent.NOME                                                                                                                  AS "company_name",
        ent.CNPJ                                                                                                                  AS "cnpj",
        (SELECT scid.NOME   FROM CADCEP_001 scep INNER JOIN CIDADE scid ON scid.CODIGO = scep.CODMUN WHERE ent.CEP = scep.CEP)   AS "cityname",
        (SELECT scid.COD_UF FROM CADCEP_001 scep INNER JOIN CIDADE scid ON scid.CODIGO = scep.CODMUN WHERE ent.CEP = scep.CEP)   AS "uf"
      FROM ENTIDADE_001 ent
      WHERE ent.CODCLI IS NOT NULL
      ORDER BY ent.NOME
    `;

    const rows = await queryFirebird(fbOptions, sql);
    const customers = rows.map(r => ({
      sisplan_id:   String(r.sisplan_id   || '').trim(),
      fantasy_name: String(r.fantasy_name || '').trim(),
      company_name: String(r.company_name || '').trim(),
      cnpj:         String(r.cnpj         || '').trim(),
      cidade:       String(r.cityname     || '').trim() || null,
      uf:           String(r.uf           || '').trim() || null,
    })).filter(c => c.sisplan_id);

    const count = await repo.upsertCustomers(customers);
    res.json({ ok: true, count });
  } catch (err) {
    console.error('orders/customers/sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const orders = await repo.getOrders({
      status: req.query.status,
      type:   req.query.type,
      search: req.query.search,
    });
    res.json(orders);
  } catch (err) {
    console.error('orders GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await repo.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(order);
  } catch (err) {
    console.error('orders/:id GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const order = await repo.createOrder({ ...req.body, created_by: req.user.id });
    res.json(order);
  } catch (err) {
    console.error('orders POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id
router.put('/:id', async (req, res) => {
  try {
    const order = req.body.items !== undefined
      ? await repo.updateOrderFull(req.params.id, req.body)
      : await repo.updateOrder(req.params.id, req.body);
    res.json(order);
  } catch (err) {
    console.error('orders/:id PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PDF ─────────────────────────────────────────────────────────────────────

function formatPhone(raw) {
  // Remove non-digits
  let digits = raw.replace(/\D/g, '');
  // Remove country code 55 if present
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  // Format: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return raw; // fallback: return as-is
}

// GET /api/orders/:id/pdf/:filename?  (filename in path for iOS Safari naming)
router.get('/:id/pdf/:filename?', async (req, res) => {
  try {
    const order = await repo.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Fetch logged-in user's phone
    const db = require('../db/connection');
    const { rows: userRows } = await db.query(
      'SELECT name, whatsapp FROM users WHERE id=$1', [req.user.id]
    );
    const rawPhone = userRows[0]?.whatsapp?.trim() || null;
    const userPhone = rawPhone ? formatPhone(rawPhone) : null;

    const M  = 36;
    const PW = 595 - M * 2;
    const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });

    const _d = new Date(order.created_at);
    const _fileDateStr = `${String(_d.getDate()).padStart(2,'0')}_${String(_d.getMonth()+1).padStart(2,'0')}_${String(_d.getFullYear()).slice(2)}`;
    const _clientName = (order.customer_snapshot?.fantasy_name || order.customer_snapshot?.company_name || '').replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim();
    const _fileType = order.type === 'pedido' ? 'Pedido' : 'Orçamento';
    const _filename = encodeURIComponent(`${_fileType} ${_fileDateStr} - ${_clientName}.pdf`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${_filename}"; filename*=UTF-8''${_filename}`);
    doc.pipe(res);

    // ── Palette ──────────────────────────────────────────────────────────────
    const ACCENT  = '#1A56A0';   // blue accent
    const DARK    = '#1A1A1A';
    const MID     = '#444444';
    const MUTED   = '#888888';
    const RULE    = '#CCCCCC';
    const ROWALT  = '#F7F9FC';
    const WHITE   = '#FFFFFF';
    const THBG    = '#EEF2F8';

    const logo    = path.join(__dirname, '..', '..', 'uploads', 'logo.png');
    const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
    const isOrc   = order.type === 'orcamento';
    const typeLabel = isOrc ? 'ORÇAMENTO' : 'PEDIDO DE VENDA';
    const orderNum  = order.sisplan_order_id || String(order.id).padStart(5, '0');
    const c         = order.customer_snapshot || {};

    // ── Helpers ──────────────────────────────────────────────────────────────
    const fmtBRL = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const hline = (y, x1 = M, x2 = M + PW, color = RULE, lw = 0.5) =>
      doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(color).stroke().restore();

    const fillRect = (x, y, w, h, color) =>
      doc.save().rect(x, y, w, h).fillColor(color).fill().restore();

    const strokeRect = (x, y, w, h, color = RULE, lw = 0.5) =>
      doc.save().rect(x, y, w, h).lineWidth(lw).strokeColor(color).stroke().restore();

    const txt = (text, x, y, opts = {}) => {
      const { w, font = 'Helvetica', size = 8, color = DARK, align = 'left', lineBreak = false } = opts;
      doc.save().font(font).fontSize(size).fillColor(color)
        .text(String(text ?? ''), x, y, { width: w, align, lineBreak })
        .restore();
    };

    let curY = M;

    // ── HEADER ───────────────────────────────────────────────────────────────
    const LOGO_W = 80;
    const LOGO_H = 64;

    if (fs.existsSync(logo)) {
      doc.image(logo, M, curY, { width: LOGO_W, fit: [LOGO_W, LOGO_H] });
    }

    // Company info
    const ciX = M + LOGO_W + 14;
    const ciW = PW - LOGO_W - 14 - 130;
    txt('Tuck Kids', ciX, curY, { size: 11, font: 'Helvetica-Bold', color: DARK, w: ciW });
    txt('CNPJ: 33.736.227/0001-59   I.E.: 26.009.473-0', ciX, curY + 16, { size: 8, color: MID, w: ciW });
    txt('RUA VITOR SANSAO - GASPAR GRANDE - GASPAR / SC', ciX, curY + 27, { size: 8, color: MID, w: ciW });
    if (userPhone) {
      txt(`FONE: ${userPhone}`, ciX, curY + 38, { size: 8, color: MID, w: ciW });
    }

    // Order badge (top-right)
    const BADGE_X = M + PW - 128;
    const BADGE_W = 128;
    fillRect(BADGE_X, curY, BADGE_W, 28, ACCENT);
    txt(typeLabel, BADGE_X, curY + 5, { size: 10, font: 'Helvetica-Bold', color: WHITE, align: 'center', w: BADGE_W });
    fillRect(BADGE_X, curY + 28, BADGE_W, 36, THBG);
    strokeRect(BADGE_X, curY, BADGE_W, 64, ACCENT, 1);
    txt(`Nro: ${orderNum}`, BADGE_X, curY + 35, { size: 16, font: 'Helvetica-Bold', color: ACCENT, align: 'center', w: BADGE_W });
    txt(dateStr,            BADGE_X, curY + 54, { size: 9, color: MID, align: 'center', w: BADGE_W });

    curY += LOGO_H + 14;
    hline(curY, M, M + PW, ACCENT, 1.5);
    curY += 12;

    // ── CLIENTE ──────────────────────────────────────────────────────────────
    txt('DADOS DO CLIENTE', M, curY, { size: 7, font: 'Helvetica-Bold', color: ACCENT });
    curY += 11;

    const clientName = [c.company_name, c.fantasy_name ? `(${c.fantasy_name})` : ''].filter(Boolean).join(' ');
    txt(clientName || '—', M, curY, { size: 10, font: 'Helvetica-Bold', color: DARK, w: PW });
    curY += 14;

    const col1 = PW / 3;
    txt(`CNPJ: ${c.cnpj || '—'}`,    M,           curY, { size: 8, color: MID, w: col1 });
    const cidadeUF = [c.cidade, c.uf].filter(Boolean).join(' / ') || '—';
    txt(`Cidade: ${cidadeUF}`, M + col1, curY, { size: 8, color: MID, w: col1 });
    txt(`Emissão: ${dateStr}`,        M + col1 * 2, curY, { size: 8, color: MID, w: col1 });
    curY += 11;
    if (order.payment_condition) {
      txt(`Cond. Pagamento: ${order.payment_condition}`, M, curY, { size: 8, color: MID, w: PW });
      curY += 11;
    }

    if (order.notes) {
      txt(`Obs: ${order.notes}`, M, curY, { size: 8, color: MID, w: PW, lineBreak: true });
      curY += 12;
    }

    curY += 4;
    hline(curY, M, M + PW, RULE, 0.5);
    curY += 10;

    // ── ITENS ────────────────────────────────────────────────────────────────
    txt('ITENS DO PEDIDO', M, curY, { size: 7, font: 'Helvetica-Bold', color: ACCENT });
    curY += 11;

    // Table header
    const IMG_COL = 52;   // photo column
    const NM_COL  = PW - IMG_COL - 55 - 65 - 65; // name
    const QT_COL  = 55;
    const PR_COL  = 65;
    const TOT_COL = 65;

    const thH = 18;
    fillRect(M, curY, PW, thH, THBG);
    strokeRect(M, curY, PW, thH, RULE);
    const thY = curY + (thH - 8) / 2;
    txt('Produto',         M + IMG_COL + 6,              thY, { size: 8, font: 'Helvetica-Bold', color: MID });
    txt('Qtde',            M + IMG_COL + NM_COL,         thY, { size: 8, font: 'Helvetica-Bold', color: MID, align: 'center', w: QT_COL });
    txt('Preço Unit.',     M + IMG_COL + NM_COL + QT_COL, thY, { size: 8, font: 'Helvetica-Bold', color: MID, align: 'right', w: PR_COL });
    txt('Total',           M + IMG_COL + NM_COL + QT_COL + PR_COL, thY, { size: 8, font: 'Helvetica-Bold', color: MID, align: 'right', w: TOT_COL });
    curY += thH;

    // Group by product
    const grouped = {};
    for (const item of order.items) {
      if (!grouped[item.product_name]) grouped[item.product_name] = { items: [], photo_url: item.photo_url };
      grouped[item.product_name].items.push(item);
    }

    let totalQty = 0;
    let totalVal = 0;
    let rowIdx   = 0;

    for (const [productName, { items: sizes, photo_url }] of Object.entries(grouped)) {
      const prodQty   = sizes.reduce((s, i) => s + i.qty, 0);
      const prodTotal = sizes.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
      const unitPrice = Number(sizes[0].unit_price);
      const ROW_H     = 40;
      const bg        = rowIdx % 2 === 0 ? WHITE : ROWALT;

      fillRect(M, curY, PW, ROW_H, bg);
      hline(curY + ROW_H, M, M + PW, RULE, 0.4);

      // Photo
      if (photo_url) {
        const imgPath = path.join(process.cwd(), photo_url.replace(/^\//, ''));
        if (fs.existsSync(imgPath)) {
          try {
            doc.image(imgPath, M + 3, curY + 3, { fit: [IMG_COL - 6, ROW_H - 6] });
          } catch (_) { /* skip if image fails */ }
        }
      }

      // Product name + sizes
      const textX = M + IMG_COL + 6;
      txt(productName, textX, curY + (ROW_H - 9) / 2, { size: 9, font: 'Helvetica-Bold', color: DARK, w: NM_COL - 8 });

      // Qty
      txt(String(prodQty),
        M + IMG_COL + NM_COL, curY + (ROW_H - 9) / 2,
        { size: 9, font: 'Helvetica-Bold', color: DARK, align: 'center', w: QT_COL });

      // Unit price
      txt(`R$ ${fmtBRL(unitPrice)}`,
        M + IMG_COL + NM_COL + QT_COL, curY + (ROW_H - 9) / 2,
        { size: 9, color: MID, align: 'right', w: PR_COL });

      // Total
      txt(`R$ ${fmtBRL(prodTotal)}`,
        M + IMG_COL + NM_COL + QT_COL + PR_COL, curY + (ROW_H - 9) / 2,
        { size: 9, font: 'Helvetica-Bold', color: ACCENT, align: 'right', w: TOT_COL });

      curY += ROW_H;
      totalQty += prodQty;
      totalVal += prodTotal;
      rowIdx++;
    }

    // ── TOTAIS ───────────────────────────────────────────────────────────────
    curY += 6;
    hline(curY, M, M + PW, ACCENT, 1);
    curY += 8;

    const totX = M + PW - 200;
    txt(`Total de peças: ${totalQty}`, totX, curY, { size: 9, color: MID, w: 200, align: 'right' });
    curY += 14;
    txt(`R$ ${fmtBRL(totalVal)}`, totX, curY,
      { size: 18, font: 'Helvetica-Bold', color: ACCENT, w: 200, align: 'right' });

    doc.end();
  } catch (err) {
    console.error('orders/:id/pdf error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
