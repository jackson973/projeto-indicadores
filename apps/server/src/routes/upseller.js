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

    const [
      fabricaTodayRevenue,
      fabricaYesterdayRevenue,
      fabricaTodayDetails,
      fabricaYesterdayDetails,
      fabricaTodayHourly,
      fabricaYesterdayHourly,
      fabricaProductTops,
    ] = await Promise.all([
      salesRepository.getDailyRevenue(spToday, { store: 'Fabrica' }),
      salesRepository.getDailyRevenue(spYesterday, { store: 'Fabrica' }),
      salesRepository.getDailySalesDetails(spToday, { store: 'Fabrica' }),
      salesRepository.getDailySalesDetails(spYesterday, { store: 'Fabrica' }),
      salesRepository.getHourlySales(spToday, { store: 'Fabrica' }),
      salesRepository.getHourlySales(spYesterday, { store: 'Fabrica' }),
      salesRepository.getTopProducts(spToday, { store: 'Fabrica' }),
    ]);

    // Save original UpSeller-only values
    data.online = {
      todaySaleAmount: parseFloat(data.todaySaleAmount || 0),
      todayOrderNum: parseInt(data.todayOrderNum || 0),
      yesterdaySaleAmount: parseFloat(data.yesterdaySaleAmount || 0),
      yesterdayOrderNum: parseInt(data.yesterdayOrderNum || 0),
      yesterdayPeriodSaleAmount: parseFloat(data.yesterdayPeriodSaleAmount || 0),
      yesterdayPeriodOrderNum: parseInt(data.yesterdayPeriodOrderNum || 0),
      perHour: data.perHour || [],
      yesPerHour: data.yesPerHour || [],
      shopTops: data.shopTops || [],
      productTops: data.productTops || [],
    };

    // Compute Fábrica "period" values (sum up to current SP hour)
    const currentHourSP = new Date().toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false,
    });
    const currentHour = parseInt(currentHourSP) || 0;
    let fabricaYesPeriodAmount = 0;
    let fabricaYesPeriodOrders = 0;
    for (let h = 0; h <= currentHour && h < 24; h++) {
      fabricaYesPeriodAmount += fabricaYesterdayHourly[h]?.amount || 0;
      fabricaYesPeriodOrders += fabricaYesterdayHourly[h]?.validOrders || 0;
    }

    // Build Fábrica data object
    data.fabrica = {
      todaySaleAmount: fabricaTodayRevenue,
      todayOrderNum: fabricaTodayDetails?.summary?.orders || 0,
      yesterdaySaleAmount: fabricaYesterdayRevenue,
      yesterdayOrderNum: fabricaYesterdayDetails?.summary?.orders || 0,
      yesterdayPeriodSaleAmount: fabricaYesPeriodAmount,
      yesterdayPeriodOrderNum: fabricaYesPeriodOrders,
      perHour: fabricaTodayHourly,
      yesPerHour: fabricaYesterdayHourly,
      shopTops: (fabricaTodayRevenue > 0 || (fabricaTodayDetails?.summary?.orders || 0) > 0) ? [{
        shopId: 'fabrica',
        shopName: 'Fábrica',
        platform: 'Sisplan',
        validOrders: fabricaTodayDetails?.summary?.orders || 0,
        validSales: fabricaTodayRevenue,
      }] : [],
      productTops: fabricaProductTops || [],
    };

    // Keep merged top-level values for backward compatibility
    data.todaySaleAmount = data.online.todaySaleAmount + data.fabrica.todaySaleAmount;
    data.todayOrderNum = data.online.todayOrderNum + data.fabrica.todayOrderNum;
    data.yesterdaySaleAmount = data.online.yesterdaySaleAmount + data.fabrica.yesterdaySaleAmount;
    data.yesterdayOrderNum = data.online.yesterdayOrderNum + data.fabrica.yesterdayOrderNum;
    data.yesterdayPeriodSaleAmount = data.online.yesterdayPeriodSaleAmount + data.fabrica.yesterdayPeriodSaleAmount;
    data.yesterdayPeriodOrderNum = data.online.yesterdayPeriodOrderNum + data.fabrica.yesterdayPeriodOrderNum;

    // Merge shopTops
    const allShops = [...(data.online.shopTops || []), ...data.fabrica.shopTops];
    allShops.sort((a, b) => parseFloat(b.validSales || 0) - parseFloat(a.validSales || 0));
    data.shopTops = allShops;
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

// GET /api/upseller - Retorna configurações (senhas de login mascaradas)
router.get('/', async (req, res) => {
  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      ...settings,
      upsellerPassword: settings.upsellerPassword ? '********' : '',
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

    // Preserve existing values when masked placeholder is sent back
    const existing = await upsellerRepo.getSettings();
    const result = await upsellerRepo.updateSettings({
      active: active || false,
      upsellerEmail: (upsellerEmail || '').trim(),
      upsellerPassword: upsellerPassword === '********' ? (existing?.upsellerPassword || '') : (upsellerPassword || ''),
      upsellerUrl: (upsellerUrl || '').trim(),
      anticaptchaKey: anticaptchaKey === '********' ? (existing?.anticaptchaKey || '') : (anticaptchaKey || ''),
      imapHost: (imapHost || '').trim(),
      imapPort: imapPort || 993,
      imapUser: (imapUser || '').trim(),
      imapPass: imapPass === '********' ? (existing?.imapPass || '') : (imapPass || ''),
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
