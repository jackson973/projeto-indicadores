const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { authenticate, requireModule } = require('../middleware/auth');
const requireAdmin = requireModule('pedidos');
const repo = require('../db/ordersRepository');
const sisplanRepo = require('../db/sisplanRepository');
const { queryFirebird, getFirebirdOptions } = require('../services/sisplanSyncService');
const sisplanOrderIntegration = require('../services/sisplanOrderIntegrationService');

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

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const uploadDir = path.join(UPLOADS_ROOT, 'order-products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.memoryStorage();
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
    // Always convert to PNG for PDF compatibility
    const filename = `product-${req.params.id}-${Date.now()}.png`;
    const destPath = path.join(uploadDir, filename);
    await sharp(req.file.buffer).png().toFile(destPath);
    const photoUrl = `/uploads/order-products/${filename}`;
    await repo.updateCatalogProductPhoto(req.params.id, photoUrl);
    res.json({ photoUrl });
  } catch (err) {
    console.error('orders/catalog photo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Catalog Barcodes ────────────────────────────────────────────────────────

// GET /api/orders/catalog/:id/barcodes
router.get('/catalog/:id/barcodes', async (req, res) => {
  try {
    res.json(await repo.getBarcodesForProduct(req.params.id));
  } catch (err) {
    console.error('orders/catalog/barcodes GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/catalog/:id/barcodes — bulk add barcodes
router.post('/catalog/:id/barcodes', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const { barcodes } = req.body;
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(400).json({ error: 'Envie um array de barcodes' });
    }
    console.log(`[Scan] Adding ${barcodes.length} barcode(s) to product #${req.params.id}:`, barcodes.map(b => `${b.barcode} → ${b.size_name}`).join(', '));
    const results = await repo.addBarcodesBulk(req.params.id, barcodes);
    console.log(`[Scan] Added OK (${Date.now() - t0}ms)`);
    res.json(results);
  } catch (err) {
    console.error(`[Scan] Add barcode error (${Date.now() - t0}ms):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/catalog/barcodes/:id
router.delete('/catalog/barcodes/:barcodeId', requireAdmin, async (req, res) => {
  try {
    await repo.removeBarcode(req.params.barcodeId);
    res.json({ ok: true });
  } catch (err) {
    console.error('orders/catalog/barcodes DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/catalog/:id/associate-group — auto-associate barcodes from a product group
router.post('/catalog/:id/associate-group', requireAdmin, async (req, res) => {
  const t0 = Date.now();
  try {
    const { groupId } = req.body;
    if (!groupId) return res.status(400).json({ error: 'groupId é obrigatório' });
    console.log(`[Scan] Auto-associate: product #${req.params.id} ← group #${groupId}`);
    const result = await repo.associateBarcodesByGroup(req.params.id, groupId);
    console.log(`[Scan] Auto-associate done (${Date.now() - t0}ms): ${result.message}`);
    res.json(result);
  } catch (err) {
    console.error(`[Scan] Auto-associate error (${Date.now() - t0}ms):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/catalog/:id/link-group — link/unlink catalog product to product group
router.put('/catalog/:id/link-group', requireAdmin, async (req, res) => {
  try {
    const { groupId } = req.body;
    await repo.linkCatalogProductGroup(req.params.id, groupId || null);
    console.log(`[Catalog] Product #${req.params.id} linked to group ${groupId || 'NONE'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Catalog] link-group error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/scan/:barcode — lookup barcode → product + size
router.get('/scan/:barcode', async (req, res) => {
  const t0 = Date.now();
  try {
    console.log(`[Scan] Lookup barcode: ${req.params.barcode}`);
    const result = await repo.lookupBarcode(req.params.barcode);
    const dt = Date.now() - t0;
    console.log(`[Scan] Result: found=${result.found}, source=${result.source || 'n/a'}, product=${result.product_name || 'n/a'}, size=${result.size_name || 'n/a'} (${dt}ms)`);
    res.json(result);
  } catch (err) {
    console.error(`[Scan] Error (${Date.now() - t0}ms):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/sisplan-products — for catalog config: grouped reference products
router.get('/sisplan-products', requireAdmin, async (req, res) => {
  try {
    const db = require('../db/connection');
    const { rows } = await db.query(
      `SELECT id, codigo, descricao, cod_cor, desc_cor, tamanho, sku, ean
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

// ─── Clientes: cadastro completo do Sisplan ──────────────────────────────────

// GET /api/orders/customers/registry — listagem com filtros e ordenação
router.get('/customers/registry', async (req, res) => {
  try {
    const customers = await repo.getSisplanCustomers({
      search: req.query.search,
      cidade: req.query.cidade,
      uf: req.query.uf,
      sort: req.query.sort,
      period: req.query.period,
    });
    res.json(customers);
  } catch (err) {
    console.error('orders/customers/registry GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

const CUSTOMERS_REGISTRY_SQL = `
  SELECT
    ENT.CEP AS "CEP"
  , ENT.CODCLI AS "idERP"
  , ENT.CNPJ AS "CNPJOrCPF"
  , ENT.ENDERECO AS "street"
  , 'A' AS "customerCategory"
  , ENT.NOME AS "companyName"
  , ENT.CEP_COB AS "billingCEP"
  , ENT.BAIRRO AS "neighborhood"
  , ENT.DATA_CAD AS "createdERP"
  , ENT.NUMERO AS "addressNumber"
  , ENT.END_COB AS "billingStreet"
  , ENT.INSCRICAO AS "stateInscription"
  , ENT.CREDITO AS "creditLimitApproved"
  , ENT.BAIRRO_COB AS "billingNeighborhood"
  , ENT.DDD_FONE AS "dddFone"
  , ENT.TELEFONE AS "telefone"
  , ENT.FONE_COMPL AS "foneCompl"
  , CID.CODIGO AS "id_city"
  , CID.COD_UF AS "UF"
  , CID.NOME AS "CITY"
  , IIF(ENT.FANTASIA = '',ENT.NOME,ENT.FANTASIA) AS "fantasyName"
  , (CASE ENT.INSCRICAO WHEN 'ISENTO' THEN '1' ELSE '2' END) AS "isNoTax"
  , (CASE ENT.ATIVO WHEN 'S' THEN '1' ELSE '2' END) AS "financialSituation"
  , CASE WHEN ENT.SUFRAMA IS NULL THEN '' ELSE ENT.SUFRAMA END AS "idSUFRAMA"
  , CASE WHEN SIT.CODIGO IS NULL THEN '00' ELSE SIT.CODIGO END AS "idActivity"
  , (CASE ENT.CONS_FINAL WHEN 'NAO' THEN '2' ELSE '1' END) AS "isFinalCustomer"
  , CASE WHEN ENT.CODREP IS NULL THEN '' ELSE ENT.CODREP END AS "idRepresentative"
  , CASE WHEN ENT.TIPO_ENTIDADE LIKE '%C%' THEN 'C' ELSE ENT.TIPO_ENTIDADE END AS "customerType"
 FROM ENTIDADE_001 ENT
LEFT JOIN SITCLI_001 SIT ON SIT.CODIGO = ENT.SIT_CLI
LEFT JOIN REPRESEN_001 REP ON REP.CODREP = ENT.CODREP
LEFT JOIN CADCEP_001 CEP ON CEP.CEP = ENT.CEP
LEFT JOIN CIDADE CID ON CID.CODIGO = CEP.CODMUN
WHERE ENT.TIPO_ENTIDADE LIKE '%C%'
GROUP BY
    ENT.CEP
  , ENT.CNPJ
  , ENT.NOME
  , ENT.ATIVO
  , ENT.NUMERO
  , REP.CODREP
  , ENT.CODCLI
  , SIT.CODIGO
  , ENT.BAIRRO
  , ENT.CODREP
  , ENT.CREDITO
  , ENT.END_COB
  , ENT.CEP_COB
  , ENT.SUFRAMA
  , ENT.FANTASIA
  , ENT.ENDERECO
  , ENT.DATA_CAD
  , ENT.INSCRICAO
  , ENT.BAIRRO_COB
  , ENT.CONS_FINAL
  , ENT.CLASSIFICA
  , ENT.TIPO_ENTIDADE
  , ENT.DDD_FONE
  , ENT.TELEFONE
  , ENT.FONE_COMPL
  , CID.CODIGO
  , CID.COD_UF
  , CID.NOME
`;

// Todos os pedidos com total por pedido — o último de cada cliente é escolhido no JS.
// CASTs evitam overflow aritmético do Firebird; COALESCE cobre campos nulos.
const CUSTOMERS_LAST_ORDER_SQL = `
  SELECT
    ped.CODCLI AS "codcli",
    ped.NUMERO AS "numero",
    ped.HR_EMISSAO AS "data",
    SUM(
      CAST(COALESCE(itens.QTDE,0) + COALESCE(itens.QTDE_F,0) - COALESCE(itens.QTDE_CANC,0) AS NUMERIC(14,2))
      * CAST(COALESCE(itens.PRECO,0) AS NUMERIC(14,2))
    ) AS "valor"
  FROM PEDIDO_001 ped
  INNER JOIN PED_ITEN_001 itens ON itens.NUMERO = ped.NUMERO
  GROUP BY ped.CODCLI, ped.NUMERO, ped.HR_EMISSAO
`;

// POST /api/orders/customers/registry/sync — sincroniza cadastro completo do Sisplan
router.post('/customers/registry/sync', requireAdmin, async (req, res) => {
  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings) return res.status(400).json({ error: 'Sisplan não configurado' });

    const fbOptions = getFirebirdOptions(settings);
    const str = (v) => (v === null || v === undefined) ? '' : String(v).trim();

    const rows = await queryFirebird(fbOptions, CUSTOMERS_REGISTRY_SQL);
    const customers = rows.map(r => ({
      codcli:              str(r.idERP),
      company_name:        str(r.companyName),
      fantasy_name:        str(r.fantasyName),
      cnpj:                str(r.CNPJOrCPF),
      customer_category:   str(r.customerCategory),
      customer_type:       str(r.customerType),
      cep:                 str(r.CEP),
      street:              str(r.street),
      address_number:      str(r.addressNumber),
      neighborhood:        str(r.neighborhood),
      billing_cep:         str(r.billingCEP),
      billing_street:      str(r.billingStreet),
      billing_neighborhood: str(r.billingNeighborhood),
      state_inscription:   str(r.stateInscription),
      credit_limit:        Number(r.creditLimitApproved) || 0,
      city_id:             str(r.id_city),
      uf:                  str(r.UF) || null,
      city:                str(r.CITY) || null,
      is_no_tax:           str(r.isNoTax) === '1',
      active:              str(r.financialSituation) === '1',
      suframa:             str(r.idSUFRAMA),
      activity_id:         str(r.idActivity),
      is_final_customer:   str(r.isFinalCustomer) === '1',
      representative_id:   str(r.idRepresentative),
      ddd_fone:            str(r.dddFone),
      telefone:            str(r.telefone),
      fone_compl:          str(r.foneCompl),
      created_erp:         r.createdERP instanceof Date ? r.createdERP : null,
    })).filter(c => c.codcli);

    const count = await repo.upsertSisplanCustomers(customers);

    // Último pedido por cliente (não bloqueia a sync do cadastro se falhar)
    let lastOrders = 0;
    let lastOrderError = null;
    try {
      const orderRows = await queryFirebird(fbOptions, CUSTOMERS_LAST_ORDER_SQL);
      const byClient = {};
      for (const r of orderRows) {
        const codcli = str(r.codcli);
        if (!codcli) continue;
        const current = byClient[codcli];
        const data = r.data instanceof Date ? r.data : null;
        const better = !current
          || (data && (!current.data || data > current.data))
          || (data && current.data && data.getTime() === current.data.getTime() && str(r.numero) > current.numero);
        if (better) {
          byClient[codcli] = { codcli, numero: str(r.numero), data, valor: Number(r.valor) || 0 };
        }
      }
      lastOrders = await repo.updateSisplanCustomersLastOrder(Object.values(byClient));
    } catch (err) {
      console.error('orders/customers/registry/sync last-order error:', err);
      lastOrderError = err.message;
    }

    res.json({ ok: true, count, lastOrders, lastOrderError });
  } catch (err) {
    console.error('orders/customers/registry/sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

// Forçar sincronização de pedidos do ERP (sync reversa + detecção de deletados)
router.post('/check-deleted', requireAdmin, async (req, res) => {
  try {
    await sisplanOrderIntegration.syncOrdersFromERP();
    res.json({ ok: true });
  } catch (err) {
    console.error('orders/sync-erp error:', err);
    res.status(500).json({ error: err.message });
  }
});

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

    // Integração automática no Sisplan quando é pedido (status enviado)
    if (order.type === 'pedido' && order.status === 'enviado') {
      try {
        const result = await sisplanOrderIntegration.integrateOrderExecute(order.id, req.user.id);
        if (result.success) {
          // Recarrega o pedido com sisplan_order_id atualizado
          const updated = await repo.getOrderById(order.id);
          return res.json(updated);
        }
        console.error('[Sisplan Integration] Falha na integração automática:', result.errors);
      } catch (intErr) {
        console.error('[Sisplan Integration] Erro na integração automática:', intErr.message);
        // Não falha a criação do pedido, apenas loga o erro
      }
    }

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

    // Integração automática no Sisplan quando pedido é finalizado (type=pedido, status=enviado)
    if (order.type === 'pedido' && order.status === 'enviado' && !order.sisplan_order_id) {
      try {
        const result = await sisplanOrderIntegration.integrateOrderExecute(order.id, req.user.id);
        if (result.success) {
          const updated = await repo.getOrderById(order.id);
          return res.json(updated);
        }
        console.error('[Sisplan Integration] Falha na integração automática:', result.errors);
      } catch (intErr) {
        console.error('[Sisplan Integration] Erro na integração automática:', intErr.message);
      }
    }

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

// DELETE /api/orders/:id  (only rascunho orders)
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await repo.deleteOrder(req.params.id);
    if (!deleted) return res.status(400).json({ error: 'Apenas orçamentos/pedidos em rascunho podem ser excluídos.' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /orders/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id/pdf/:filename?  (filename in path for iOS Safari naming)
router.get('/:id/pdf/:filename?', async (req, res) => {
  try {
    const order = await repo.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Relatório completo (abre a grade de tamanhos por produto) vs simplificado (atual)
    const detailed = req.query.mode === 'completo' || req.query.detailed === '1';
    // Ordem fixa de exibição dos tamanhos; desconhecidos vão para o fim
    const SIZE_ORDER = ['PRE', 'RN', 'P', 'M', 'G', 'GG', '1', '2', '3', '4', '6', '8', '10'];
    const sizeRank = (name) => {
      const idx = SIZE_ORDER.indexOf(String(name || '').trim().toUpperCase());
      return idx === -1 ? SIZE_ORDER.length : idx;
    };

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
    res.setHeader('Content-Disposition', `attachment; filename="${_filename}"; filename*=UTF-8''${_filename}`);
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

    // Fetch logo path from system_settings
    const { rows: settingsRows } = await db.query('SELECT logo_path FROM system_settings WHERE id=1');
    const logoFile = settingsRows[0]?.logo_path;
    const logoUrl = logoFile ? `/uploads/${logoFile}` : null;
    const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
    const isOrc   = order.type === 'orcamento';
    const typeLabel = isOrc ? 'ORÇAMENTO' : 'PEDIDO DE VENDA';
    const orderNum  = order.sisplan_order_id || String(order.id).padStart(5, '0');
    const c         = order.customer_snapshot || {};

    // ── Helpers ──────────────────────────────────────────────────────────────
    const fmtBRL = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Carrega imagem (disco para /uploads, HTTP para URLs externas), redimensiona e converte p/ JPEG
    const loadImage = async (urlPath, maxW = 100, maxH = 100) => {
      if (!urlPath) return null;
      try {
        let input = null;
        if (/^https?:\/\//i.test(urlPath)) {
          // URL externa: baixa via HTTP/HTTPS
          const client = urlPath.startsWith('https') ? require('https') : require('http');
          input = await new Promise((resolve) => {
            client.get(urlPath, (resp) => {
              if (resp.statusCode !== 200) { resp.resume(); return resolve(null); }
              const chunks = [];
              resp.on('data', (c) => chunks.push(c));
              resp.on('end', () => resolve(Buffer.concat(chunks)));
              resp.on('error', () => resolve(null));
            }).on('error', () => resolve(null));
          });
        } else if (urlPath.startsWith('/uploads/')) {
          // Arquivo local em disco — mais confiável que auto-chamada HTTP (independe de porta/nginx)
          const filePath = path.join(UPLOADS_ROOT, urlPath.replace(/^\/uploads\//, ''));
          if (!fs.existsSync(filePath)) return null;
          input = await fs.promises.readFile(filePath);
        }
        if (!input) return null;
        return await sharp(input)
          .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
      } catch (_) {
        return null;
      }
    };

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

    const PAGE_H = 842; // A4 height in points
    const PAGE_BOTTOM = PAGE_H - M; // usable bottom
    let curY = M;

    // ── HEADER ───────────────────────────────────────────────────────────────
    const LOGO_W = 80;
    const LOGO_H = 64;

    const logoData = await loadImage(logoUrl, 160, 128);
    if (logoData) {
      doc.image(logoData, M, curY, { width: LOGO_W, fit: [LOGO_W, LOGO_H] });
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

    // Table columns
    const IMG_COL = 52;   // photo column
    const NM_COL  = PW - IMG_COL - 55 - 65 - 65; // name
    const QT_COL  = 55;
    const PR_COL  = 65;
    const TOT_COL = 65;
    const thH = 18;
    const ROW_H = 40;

    // Draw table header (reusable for new pages)
    const drawTableHeader = () => {
      fillRect(M, curY, PW, thH, THBG);
      strokeRect(M, curY, PW, thH, RULE);
      const thY = curY + (thH - 8) / 2;
      txt('Produto',         M + IMG_COL + 6,              thY, { size: 8, font: 'Helvetica-Bold', color: MID });
      txt('Qtde',            M + IMG_COL + NM_COL,         thY, { size: 8, font: 'Helvetica-Bold', color: MID, align: 'center', w: QT_COL });
      txt('Preço Unit.',     M + IMG_COL + NM_COL + QT_COL, thY, { size: 8, font: 'Helvetica-Bold', color: MID, align: 'right', w: PR_COL });
      txt('Total',           M + IMG_COL + NM_COL + QT_COL + PR_COL, thY, { size: 8, font: 'Helvetica-Bold', color: MID, align: 'right', w: TOT_COL });
      curY += thH;
    };

    // Check if we need a new page, and if so, add page + re-draw table header
    const ensureSpace = (needed) => {
      if (curY + needed > PAGE_BOTTOM) {
        doc.addPage();
        curY = M;
        drawTableHeader();
      }
    };

    drawTableHeader();

    // Map de observações por catalog_product_id
    const obsByCatalogId = new Map();
    for (const po of order.product_observations || []) {
      if (po && po.catalog_product_id && po.observation) {
        obsByCatalogId.set(String(po.catalog_product_id), String(po.observation));
      }
    }

    // Group by product
    const grouped = {};
    for (const item of order.items) {
      if (!grouped[item.product_name]) grouped[item.product_name] = { items: [], photo_url: item.photo_url };
      grouped[item.product_name].items.push(item);
    }

    // Pre-load all product images in parallel (resized thumbnails)
    const groupEntries = Object.entries(grouped);
    const imageCache = {};
    await Promise.all(groupEntries.map(async ([productName, { photo_url }]) => {
      if (photo_url) {
        try {
          imageCache[productName] = await loadImage(photo_url, 90, 70);
        } catch (_) { /* skip */ }
      }
    }));

    let totalQty = 0;
    let totalVal = 0;
    let rowIdx   = 0;

    for (const [productName, { items: sizes }] of groupEntries) {
      const prodQty   = sizes.reduce((s, i) => s + i.qty, 0);
      const prodTotal = sizes.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
      const unitPrice = Number(sizes[0].unit_price);
      const bg        = rowIdx % 2 === 0 ? WHITE : ROWALT;

      // Relatório completo: grade de tamanhos como mini-tabela (nome em cima, qtd embaixo)
      const textX  = M + IMG_COL + 6;
      const nameW  = NM_COL - 8;

      // Dimensões da mini-tabela da grade
      const CELL_W   = 38;
      const HDR_H    = 13;   // célula do nome do tamanho
      const QTY_H    = 14;   // célula da quantidade
      const CELL_H   = HDR_H + QTY_H;
      const perLine  = Math.max(1, Math.floor((NM_COL - 12) / CELL_W));
      const NAME_GAP = 6 + 12 + 4; // padding topo + linha do nome + respiro até a grade

      let gridSizes = [];
      let gridH     = 0;
      if (detailed) {
        gridSizes = sizes
          .filter((i) => i.qty > 0)
          .sort((a, b) => sizeRank(a.size_name) - sizeRank(b.size_name) || String(a.size_name).localeCompare(String(b.size_name)));
        if (gridSizes.length) {
          gridH = Math.ceil(gridSizes.length / perLine) * CELL_H;
        }
      }

      // Altura da linha: no completo abre espaço p/ nome + mini-tabela
      let rowH = ROW_H;
      if (detailed && gridH) {
        rowH = Math.max(ROW_H, NAME_GAP + gridH + 6);
      }

      // Observação do produto (mesma para todos os tamanhos)
      const cpid = sizes[0].catalog_product_id;
      const obsText = cpid ? obsByCatalogId.get(String(cpid)) : null;
      const obsW    = PW - IMG_COL - 12;
      let obsH      = 0;
      if (obsText) {
        const measured = doc.font('Helvetica').fontSize(7).heightOfString(`Obs: ${obsText}`, { width: obsW });
        obsH = Math.min(40, measured + 4);
      }

      ensureSpace(rowH + obsH);

      fillRect(M, curY, PW, rowH + obsH, bg);

      // Photo (from cache)
      const imgData = imageCache[productName];
      if (imgData) {
        try {
          doc.image(imgData, M + 3, curY + 3, { fit: [IMG_COL - 6, rowH - 6] });
        } catch (_) { /* skip if image fails */ }
      }

      // Product name (+ mini-tabela da grade, no relatório completo)
      if (detailed && gridH) {
        txt(productName, textX, curY + 6, { size: 9, font: 'Helvetica-Bold', color: DARK, w: nameW });

        const gridY0 = curY + NAME_GAP;
        gridSizes.forEach((s, i) => {
          const cx = textX + (i % perLine) * CELL_W;
          const cy = gridY0 + Math.floor(i / perLine) * CELL_H;
          // cabeçalho: nome do tamanho
          fillRect(cx, cy, CELL_W, HDR_H, THBG);
          txt(String(s.size_name), cx, cy + 3, { size: 7, font: 'Helvetica-Bold', color: ACCENT, align: 'center', w: CELL_W });
          // valor: quantidade
          fillRect(cx, cy + HDR_H, CELL_W, QTY_H, WHITE);
          txt(String(s.qty), cx, cy + HDR_H + 4, { size: 8, font: 'Helvetica-Bold', color: DARK, align: 'center', w: CELL_W });
          // bordas da célula
          strokeRect(cx, cy, CELL_W, CELL_H, RULE, 0.5);
          hline(cy + HDR_H, cx, cx + CELL_W, RULE, 0.5);
        });
      } else {
        txt(productName, textX, curY + (rowH - 9) / 2, { size: 9, font: 'Helvetica-Bold', color: DARK, w: nameW });
      }

      // Qty
      txt(String(prodQty),
        M + IMG_COL + NM_COL, curY + (rowH - 9) / 2,
        { size: 9, font: 'Helvetica-Bold', color: DARK, align: 'center', w: QT_COL });

      // Unit price
      txt(`R$ ${fmtBRL(unitPrice)}`,
        M + IMG_COL + NM_COL + QT_COL, curY + (rowH - 9) / 2,
        { size: 9, color: MID, align: 'right', w: PR_COL });

      // Total
      txt(`R$ ${fmtBRL(prodTotal)}`,
        M + IMG_COL + NM_COL + QT_COL + PR_COL, curY + (rowH - 9) / 2,
        { size: 9, font: 'Helvetica-Bold', color: ACCENT, align: 'right', w: TOT_COL });

      curY += rowH;

      if (obsText) {
        txt(`Obs: ${obsText}`, M + IMG_COL + 6, curY, {
          size: 7, color: '#CC0000', w: obsW, lineBreak: true,
        });
        curY += obsH;
      }

      hline(curY, M, M + PW, RULE, 0.4);

      totalQty += prodQty;
      totalVal += prodTotal;
      rowIdx++;
    }

    // ── TOTAIS ───────────────────────────────────────────────────────────────
    ensureSpace(50); // ensure totals fit on current page
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

// ─── Sisplan Integration ────────────────────────────────────────────────────

// Dry-run: gera SQLs sem executar
router.post('/:id/integrate/dry-run', async (req, res) => {
  try {
    const result = await sisplanOrderIntegration.integrateOrderDryRun(
      Number(req.params.id),
      req.user.id
    );
    res.json(result);
  } catch (err) {
    console.error('orders/:id/integrate/dry-run error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Execução real: grava no Firebird com transaction
router.post('/:id/integrate', async (req, res) => {
  try {
    const result = await sisplanOrderIntegration.integrateOrderExecute(
      Number(req.params.id),
      req.user.id
    );
    res.json(result);
  } catch (err) {
    console.error('orders/:id/integrate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
