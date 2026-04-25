const cron = require('node-cron');
const axios = require('axios');
const upsellerRepo = require('../db/upsellerRepository');
const analyticsRepo = require('../db/upsellerAnalyticsRepository');
const { getSaoPauloDate } = require('../lib/timezone');

const PER_HOUR_URL = 'https://app.upseller.com/api/statistics/sale-data/per-hour';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let analyticsJob = null;
let isFetching = false;

// ─── FETCH PER-HOUR DATA ────────────────────────────────────────────────────

async function fetchPerHourData(cookies) {
  const today = getSaoPauloDate(); // YYYY-MM-DD
  const { data } = await axios.post(PER_HOUR_URL, {
    topFlag: true,
    currencyTime: today,
    reqTime: Date.now(),
  }, {
    headers: {
      Cookie: cookies,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      'Origin': 'https://app.upseller.com',
      'Referer': 'https://app.upseller.com/pt/analytics/overview-sales',
    },
    timeout: 15000,
  });

  if (data.code !== 0) {
    throw new Error(`per-hour API error: code=${data.code} msg=${data.msg}`);
  }

  const d = data.data || {};
  console.log(`[UpSeller Analytics] today: R$${d.todaySaleAmount} (${d.todayOrderNum} orders), shops: ${d.shopTops?.length || 0}, products: ${d.productTops?.length || 0}`);

  return data.data;
}

// ─── SYNC ANALYTICS ─────────────────────────────────────────────────────────

async function syncAnalytics() {
  if (isFetching) return { success: false, message: 'Já em andamento.' };
  isFetching = true;

  try {
    const cookies = await upsellerRepo.getSessionCookies();
    if (!cookies) {
      return { success: false, message: 'Sem sessão ativa do UpSeller.' };
    }

    // Validate session
    const isValid = await checkSession(cookies);
    if (!isValid) {
      return { success: false, message: 'Sessão expirada.' };
    }

    const apiData = await fetchPerHourData(cookies);
    const today = getSaoPauloDate();

    await analyticsRepo.upsertDailyAnalytics(today, {
      perHour: apiData.perHour || [],
      yesPerHour: apiData.yesPerHour || [],
      productTops: apiData.productTops || [],
      shopTops: apiData.shopTops || [],
      todayOrderNum: apiData.todayOrderNum || 0,
      todaySaleAmount: apiData.todaySaleAmount || 0,
      yesterdayOrderNum: apiData.yesterdayOrderNum || 0,
      yesterdaySaleAmount: apiData.yesterdaySaleAmount || 0,
      yesterdayPeriodOrderNum: apiData.yesterdayPeriodOrderNum || 0,
      yesterdayPeriodSaleAmount: apiData.yesterdayPeriodSaleAmount || 0,
      currency: apiData.currency || 'BRL',
    });

    console.log(`[UpSeller Analytics] Data synced for ${today}`);
    return { success: true };
  } catch (error) {
    console.error('[UpSeller Analytics] Sync error:', error.message);
    return { success: false, message: error.message };
  } finally {
    isFetching = false;
  }
}

async function checkSession(cookies) {
  try {
    const { data } = await axios.get('https://app.upseller.com/api/is-login', {
      headers: { Cookie: cookies },
      timeout: 10000,
      params: { reqTime: Date.now() },
    });
    return data.code === 0 && data.data === true;
  } catch {
    return false;
  }
}

// ─── GET OR FETCH ───────────────────────────────────────────────────────────

async function getTodayAnalytics() {
  const today = getSaoPauloDate();

  // Check if we have fresh data
  const fresh = await analyticsRepo.isFresh(today);
  if (fresh) {
    return analyticsRepo.getDailyAnalytics(today);
  }

  // Try to sync fresh data
  const result = await syncAnalytics();
  if (result.success) {
    return analyticsRepo.getDailyAnalytics(today);
  }

  // Return stale data if available
  const stale = await analyticsRepo.getDailyAnalytics(today);
  if (stale) return stale;

  return null;
}

// ─── SCHEDULER ──────────────────────────────────────────────────────────────

async function startAnalyticsScheduler() {
  try {
    const active = await upsellerRepo.isActive();
    if (!active) {
      console.log('[UpSeller Analytics] Integration not active, scheduler not started.');
      return;
    }

    // Run every 5 minutes
    analyticsJob = cron.schedule('*/5 * * * *', async () => {
      await syncAnalytics();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo',
    });

    // Fetch immediately on start
    syncAnalytics().catch(() => {});

    console.log('[UpSeller Analytics] Scheduler started (every 5 minutes)');
  } catch (error) {
    console.error('[UpSeller Analytics] Failed to start scheduler:', error.message);
  }
}

function stopAnalyticsScheduler() {
  if (analyticsJob) {
    analyticsJob.stop();
    analyticsJob = null;
    console.log('[UpSeller Analytics] Scheduler stopped');
  }
}

async function restartAnalyticsScheduler() {
  stopAnalyticsScheduler();
  await startAnalyticsScheduler();
}

module.exports = {
  syncAnalytics,
  getTodayAnalytics,
  startAnalyticsScheduler,
  stopAnalyticsScheduler,
  restartAnalyticsScheduler,
};
