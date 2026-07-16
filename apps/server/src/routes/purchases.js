const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, requireModule } = require('../middleware/auth');

// pdf-parse carregado de forma tolerante: se a lib quebrar neste Node,
// o app sobe normalmente e só a importação de PDF fica indisponível.
let pdfParse = null;
try { pdfParse = require('pdf-parse'); }
catch (e) { console.error('[Compras] pdf-parse indisponível — importação de PDF desativada:', e.message); }
const repo = require('../db/purchasesRepository');
const { parseOrderText } = require('../lib/purchaseOrderParser');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const PURCHASES_DIR = path.join(UPLOADS_ROOT, 'purchases');
fs.mkdirSync(PURCHASES_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^application\/pdf$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Envie o PDF da cópia de pedido.'));
  },
});

const unlinkQuiet = (relPath) => { if (relPath) fs.unlink(path.join(UPLOADS_ROOT, relPath), () => {}); };

// Janitor: PDFs temporários (parse sem salvar) com mais de 24h
function cleanTmpFiles() {
  fs.readdir(PURCHASES_DIR, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    files.filter(f => f.startsWith('tmp_')).forEach(f => {
      const full = path.join(PURCHASES_DIR, f);
      fs.stat(full, (e, st) => { if (!e && st.mtimeMs < cutoff) fs.unlink(full, () => {}); });
    });
  });
}

const router = express.Router();
router.use(authenticate);
router.use(requireModule('compras'));

router.get('/', async (req, res) => {
  try { return res.json(await repo.list()); }
  catch (error) {
    console.error('List purchases error:', error);
    return res.status(500).json({ message: 'Erro ao listar compras.' });
  }
});

router.get('/meta', async (req, res) => {
  try { return res.json({ lastCategoryId: await repo.lastCategoryId() }); }
  catch (error) { return res.status(500).json({ message: 'Erro ao carregar sugestões.' }); }
});

router.get('/check', async (req, res) => {
  try {
    const id = await repo.existsOrderNumber(req.query.orderNumber || '');
    return res.json({ exists: !!id, purchaseId: id });
  } catch (error) { return res.status(500).json({ message: 'Erro ao verificar pedido.' }); }
});

// Lê o PDF da cópia de pedido: extrai os campos e guarda o arquivo (tmp_) para anexar no salvar
router.post('/parse-order', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Erro no upload.' });
    if (!req.file) return res.status(400).json({ message: 'Arquivo é obrigatório.' });
    if (!pdfParse) return res.status(503).json({ message: 'Leitura de PDF indisponível no servidor — preencha os campos manualmente.' });
    try {
      cleanTmpFiles();
      const parsed = await pdfParse(req.file.buffer);
      const fields = parseOrderText(parsed.text);
      const token = `tmp_${Date.now()}_${Math.round(Math.random() * 1e6)}.pdf`;
      fs.writeFileSync(path.join(PURCHASES_DIR, token), req.file.buffer);
      return res.json({ ...fields, fileToken: token, fileName: req.file.originalname });
    } catch (error) {
      console.error('Parse order error:', error);
      return res.status(400).json({ message: 'Não consegui ler este PDF — preencha os campos manualmente.' });
    }
  });
});

router.post('/', async (req, res) => {
  try {
    const { orderNumber, supplierName, orderDate, totalAmount, totalPieces, paymentTerms, obs,
            items, installments, createEntries, boxId, categoryId, fileToken, fileName } = req.body;
    if (!orderNumber || !supplierName || !orderDate || totalAmount === undefined) {
      return res.status(400).json({ message: 'Nº do pedido, fornecedor, data e valor são obrigatórios.' });
    }
    if (createEntries && (!boxId || !categoryId)) {
      return res.status(400).json({ message: 'Escolha o caixa e a categoria para lançar as parcelas.' });
    }
    if (createEntries && (!Array.isArray(installments) || !installments.length)) {
      return res.status(400).json({ message: 'Defina as parcelas para lançar no fluxo de caixa.' });
    }

    // PDF importado: promove o tmp_ para arquivo definitivo
    let filePath = null;
    if (fileToken && /^tmp_[\w.-]+\.pdf$/.test(fileToken)) {
      const tmpAbs = path.join(PURCHASES_DIR, fileToken);
      if (fs.existsSync(tmpAbs)) {
        const finalName = fileToken.replace(/^tmp_/, 'ord_');
        fs.renameSync(tmpAbs, path.join(PURCHASES_DIR, finalName));
        filePath = `purchases/${finalName}`;
      }
    }

    const result = await repo.create({
      orderNumber, supplierName, orderDate,
      totalAmount: Number(totalAmount) || 0,
      totalPieces: totalPieces ? parseInt(totalPieces) : null,
      paymentTerms, obs,
      items: Array.isArray(items) ? items : [],
      installments: Array.isArray(installments) ? installments : [],
      createEntries: !!createEntries,
      boxId: boxId ? parseInt(boxId) : null,
      categoryId: categoryId ? parseInt(categoryId) : null,
      filePath, fileName: fileName || null,
      createdBy: req.user.id,
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Create purchase error:', error);
    return res.status(500).json({ message: 'Erro ao salvar compra.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await repo.get(req.params.id);
    if (!p) return res.status(404).json({ message: 'Compra não encontrada.' });
    return res.json(p);
  } catch (error) { return res.status(500).json({ message: 'Erro ao carregar compra.' }); }
});

router.get('/:id/file', async (req, res) => {
  try {
    const p = await repo.get(req.params.id);
    if (!p || !p.file_path) return res.status(404).json({ message: 'Arquivo não encontrado.' });
    const abs = path.join(UPLOADS_ROOT, p.file_path);
    if (!abs.startsWith(PURCHASES_DIR) || !fs.existsSync(abs)) {
      return res.status(404).json({ message: 'Arquivo não encontrado no servidor.' });
    }
    res.type('application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(p.file_name || 'copia-pedido.pdf')}"`);
    return res.sendFile(abs);
  } catch (error) { return res.status(500).json({ message: 'Erro ao abrir arquivo.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await repo.remove(req.params.id);
    if (!result) return res.status(404).json({ message: 'Compra não encontrada.' });
    if (result.blocked) {
      return res.status(409).json({
        message: `Esta ordem de compra tem ${result.paidCount} parcela(s) paga(s) no fluxo de caixa — exclusão bloqueada.`,
      });
    }
    unlinkQuiet(result.filePath);
    return res.json({ message: 'Compra excluída (parcelas pendentes removidas do fluxo de caixa).' });
  } catch (error) {
    console.error('Delete purchase error:', error);
    return res.status(500).json({ message: 'Erro ao excluir compra.' });
  }
});

module.exports = router;
