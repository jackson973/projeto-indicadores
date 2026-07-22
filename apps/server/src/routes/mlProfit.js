const express = require('express');
const { authenticate, requireModule } = require('../middleware/auth');
const { getReportData, listMlStoreLabels } = require('../services/mlProfitReportService');
const { createProfitPdf } = require('../services/mlProfitPdf');
const {
  syncDayFees,
  fetchOrderFees,
  resolveStoreForSalesLabel,
  createTokenProvider,
} = require('../services/mlOrderFeesService');
const { getSaoPauloDate } = require('../lib/timezone');

const router = express.Router();
router.use(authenticate, requireModule('lojas'));

// ── Opções da tela: lojas ML presentes em sales + data padrão (ontem) ────────
router.get('/options', async (req, res) => {
  try {
    const stores = await listMlStoreLabels();
    return res.json({ stores, defaultDate: getSaoPauloDate(-1) });
  } catch (error) {
    console.error('[ML Profit] Options error:', error);
    return res.status(500).json({ message: 'Erro ao carregar opções.' });
  }
});

// ── Dados do relatório (JSON para a tela) ────────────────────────────────────
router.get('/data', async (req, res) => {
  try {
    const { store, date } = req.query;
    if (!store || !date) {
      return res.status(400).json({ message: 'Parâmetros store e date são obrigatórios.' });
    }
    const data = await getReportData({ store, date });
    return res.json(data);
  } catch (error) {
    console.error('[ML Profit] Data error:', error);
    return res.status(500).json({ message: 'Erro ao montar o relatório.' });
  }
});

// ── Sincronizar valores reais do ML para um dia ──────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const { store, date, force } = req.body || {};
    if (!store || !date) {
      return res.status(400).json({ message: 'Parâmetros store e date são obrigatórios.' });
    }
    const result = await syncDayFees({ store, date, force: !!force });
    return res.json(result);
  } catch (error) {
    console.error('[ML Profit] Sync error:', error);
    return res.status(500).json({ message: error.message || 'Erro ao sincronizar com o ML.' });
  }
});

// ── PDF do relatório ─────────────────────────────────────────────────────────
router.get('/pdf', async (req, res) => {
  try {
    const { store, date } = req.query;
    if (!store || !date) {
      return res.status(400).json({ message: 'Parâmetros store e date são obrigatórios.' });
    }
    const data = await getReportData({ store, date });
    const slug = String(store).replace(/\(.*?\)/g, '').trim().replace(/\s+/g, '_');
    const [y, m, d] = date.split('-');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Lucro_ML_${slug}_${d}-${m}-${y}.pdf"`
    );
    const doc = createProfitPdf(data);
    doc.pipe(res);
  } catch (error) {
    console.error('[ML Profit] PDF error:', error);
    return res.status(500).json({ message: 'Erro ao gerar o PDF.' });
  }
});

// ── Auditoria: reconciliação com o billing do ML ─────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { store, date } = req.query;
    if (!store || !date) {
      return res.status(400).json({ message: 'Parâmetros store e date são obrigatórios.' });
    }
    const { auditDay } = require('../services/mlBillingAuditService');
    const result = await auditDay({ store, date });
    return res.json(result);
  } catch (error) {
    console.error('[ML Profit] Audit error:', error);
    return res.status(500).json({ message: error.message || 'Erro na auditoria com o billing do ML.' });
  }
});

// ── Debug: payloads brutos do ML para um pedido (validação de valores) ───────
router.get('/debug-order', async (req, res) => {
  try {
    const { store, order_id } = req.query;
    if (!store || !order_id) {
      return res.status(400).json({ message: 'Parâmetros store e order_id são obrigatórios.' });
    }
    const creds = await resolveStoreForSalesLabel(store);
    if (!creds) return res.status(404).json({ message: `Loja ML não encontrada para "${store}".` });
    const fees = await fetchOrderFees(order_id, createTokenProvider(creds.id));
    return res.json(fees);
  } catch (error) {
    console.error('[ML Profit] Debug order error:', error);
    return res.status(500).json({ message: error.message || 'Erro ao consultar pedido no ML.' });
  }
});

module.exports = router;
