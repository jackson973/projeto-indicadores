const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upsellerRepo = require('../db/upsellerRepository');
const {
  runSync,
  restartUpsellerSyncScheduler,
} = require('../services/upsellerSyncService');
const {
  getTodayAnalytics,
  syncAnalytics,
  restartAnalyticsScheduler,
} = require('../services/upsellerAnalyticsService');

const router = express.Router();

// ── Rotas acessíveis por qualquer usuário autenticado ───────────────────────

// GET /api/upseller/today-analytics - Dados de vendas de hoje (per-hour)
router.get('/today-analytics', authenticate, async (req, res) => {
  try {
    const data = await getTodayAnalytics();
    if (!data) {
      return res.json({ available: false, message: 'Dados não disponíveis.' });
    }
    await mergeSisplanData(data);
    return res.json({ available: true, ...data });
  } catch (error) {
    console.error('Today analytics error:', error);
    return res.status(500).json({ message: 'Erro ao buscar analytics.' });
  }
});

// Helper to merge Sisplan/Fábrica data into analytics
async function mergeSisplanData(data) {
  try {
    const salesRepository = require('../db/salesRepository');
    const { getSaoPauloDate } = require('../lib/timezone');
    const spToday = getSaoPauloDate();
    const spYesterday = getSaoPauloDate(-1);
    const [fabricaToday, fabricaYesterday, fabricaTodayDetails] = await Promise.all([
      salesRepository.getDailyRevenue(spToday, { store: 'Fabrica' }),
      salesRepository.getDailyRevenue(spYesterday, { store: 'Fabrica' }),
      salesRepository.getDailySalesDetails(spToday, { store: 'Fabrica' }),
    ]);
    if (fabricaToday > 0 || (fabricaTodayDetails && fabricaTodayDetails.summary.orders > 0)) {
      data.todaySaleAmount = parseFloat(data.todaySaleAmount || 0) + fabricaToday;
      data.yesterdaySaleAmount = parseFloat(data.yesterdaySaleAmount || 0) + fabricaYesterday;
      data.todayOrderNum = parseInt(data.todayOrderNum || 0) + (fabricaTodayDetails?.summary?.orders || 0);
      const shopTops = data.shopTops || [];
      shopTops.push({
        shopId: 'fabrica',
        shopName: 'Fábrica',
        platform: 'Sisplan',
        validOrders: fabricaTodayDetails?.summary?.orders || 0,
        validSales: fabricaToday,
      });
      shopTops.sort((a, b) => parseFloat(b.validSales || 0) - parseFloat(a.validSales || 0));
      data.shopTops = shopTops;
    }
  } catch (e) {
    console.error('Error merging Sisplan data into today analytics:', e.message);
  }
}

// POST /api/upseller/today-analytics/refresh - Forçar atualização
router.post('/today-analytics/refresh', authenticate, async (req, res) => {
  try {
    const result = await syncAnalytics();
    if (!result.success) {
      return res.status(400).json(result);
    }
    const data = await getTodayAnalytics();
    await mergeSisplanData(data);
    return res.json({ available: true, ...data });
  } catch (error) {
    console.error('Analytics refresh error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar analytics.' });
  }
});

// ── Rotas admin ─────────────────────────────────────────────────────────────
router.use(authenticate, requireAdmin);

// GET /api/upseller - Retorna configurações (senhas mascaradas)
router.get('/', async (req, res) => {
  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      ...settings,
      upsellerPassword: settings.upsellerPassword ? '********' : '',
      anticaptchaKey: settings.anticaptchaKey ? '********' : '',
      imapPass: settings.imapPass ? '********' : '',
      sessionCookies: undefined,
      sessionSavedAt: undefined,
    });
  } catch (error) {
    console.error('Get upseller settings error:', error);
    return res.status(500).json({ message: 'Erro ao buscar configurações.' });
  }
});

// PUT /api/upseller - Salvar configurações
router.put('/', async (req, res) => {
  try {
    const {
      active, upsellerEmail, upsellerPassword, upsellerUrl,
      anticaptchaKey, imapHost, imapPort, imapUser, imapPass,
      syncIntervalMinutes, defaultDays
    } = req.body;

    const result = await upsellerRepo.updateSettings({
      active: active || false,
      upsellerEmail: (upsellerEmail || '').trim(),
      upsellerPassword: upsellerPassword === '********' ? '' : (upsellerPassword || ''),
      upsellerUrl: (upsellerUrl || '').trim(),
      anticaptchaKey: anticaptchaKey === '********' ? '' : (anticaptchaKey || ''),
      imapHost: (imapHost || '').trim(),
      imapPort: imapPort || 993,
      imapUser: (imapUser || '').trim(),
      imapPass: imapPass === '********' ? '' : (imapPass || ''),
      syncIntervalMinutes: syncIntervalMinutes || 60,
      defaultDays: defaultDays || 90,
    });

    await restartUpsellerSyncScheduler();
    await restartAnalyticsScheduler();

    return res.json(result);
  } catch (error) {
    console.error('Update upseller settings error:', error);
    return res.status(500).json({ message: 'Erro ao salvar configurações.' });
  }
});

// POST /api/upseller/sync - Sync manual
router.post('/sync', async (req, res) => {
  try {
    const result = await runSync();
    if (result.success) {
      return res.json(result);
    }
    return res.status(400).json(result);
  } catch (error) {
    console.error('Manual upseller sync error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/upseller/status - Status do último sync
router.get('/status', async (req, res) => {
  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      active: settings.active,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastSyncMessage: settings.lastSyncMessage,
      lastSyncRows: settings.lastSyncRows,
    });
  } catch (error) {
    console.error('Upseller status error:', error);
    return res.status(500).json({ message: 'Erro ao buscar status.' });
  }
});

module.exports = router;
