const express = require('express');
const multer = require('multer');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  processReconciliation,
  fetchShopeeStores,
} = require('../services/validadorShopeeService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.use(authenticate, requireAdmin);

router.get('/shopee/stores', async (req, res) => {
  try {
    const stores = await fetchShopeeStores();
    return res.json({ stores });
  } catch (err) {
    console.error('[Validador Shopee] stores error:', err);
    return res.status(500).json({ message: err.message || 'Erro ao buscar lojas.' });
  }
});

router.post('/shopee/reconciliate', upload.single('incomeReport'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Envie o Income Report da Shopee (arquivo .xlsx).' });
    }

    const { start, end, store } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ message: 'Informe o período (start/end).' });
    }

    const result = await processReconciliation(
      { start, end, store: store || null },
      req.file.buffer
    );

    return res.json(result);
  } catch (err) {
    console.error('[Validador Shopee] reconciliate error:', err);
    return res.status(500).json({ message: err.message || 'Erro ao processar reconciliação.' });
  }
});

module.exports = router;
