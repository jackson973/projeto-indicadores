const cron = require('node-cron');
const axios = require('axios');
const db = require('../db/connection');
const upsellerRepo = require('../db/upsellerRepository');
const salesRepo = require('../db/salesRepository');
const { getSaoPauloDate } = require('../lib/timezone');

let currentJob = null;
let isSyncing = false;

// ─── CAPTCHA ────────────────────────────────────────────────────────────────

async function solveImageCaptcha(base64Image, anticaptchaKey) {
  const anticaptcha = require('@antiadmin/anticaptchaofficial');
  anticaptcha.setAPIKey(anticaptchaKey);

  const clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`[UpSeller] Solving CAPTCHA (attempt ${attempt})...`);
      const text = await anticaptcha.solveImage(clean, true);
      console.log(`[UpSeller] CAPTCHA solved: ${text}`);
      return text;
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('NO_SLOT') && attempt < 5) {
        console.log(`[UpSeller] No CAPTCHA workers, retrying in 10s...`);
        await sleep(10000);
      } else {
        throw err;
      }
    }
  }
}

// ─── EMAIL VERIFICATION ─────────────────────────────────────────────────────

async function fetchVerificationCode(imapConfig, startTime, timeout = 120000) {
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');

  const client = new ImapFlow({
    host: imapConfig.host,
    port: imapConfig.port,
    secure: true,
    auth: { user: imapConfig.user, pass: imapConfig.pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  });

  console.log('[UpSeller] Connecting to IMAP...');
  await client.connect();

  const lock = await client.getMailboxLock('INBOX');

  try {
    // Delete old UpSeller emails (search returns sequence numbers)
    const oldMsgs = await client.search({ subject: 'UpSeller' });
    if (oldMsgs.length > 0) {
      console.log(`[UpSeller] Deleting ${oldMsgs.length} old UpSeller emails`);
      await client.messageDelete(oldMsgs).catch((err) => {
        console.log(`[UpSeller] Delete error: ${err.message}`);
      });
    }

    const start = Date.now();
    const interval = 4000;

    while (Date.now() - start < timeout) {
      console.log('[UpSeller] Searching for verification email...');
      await client.noop();

      // Search for 'UpSeller' (matches both PT "código de verificação do UpSeller" and EN "UpSeller verification code")
      const messages = await client.search({ subject: 'UpSeller' });
      if (messages.length > 0) {
        const msgId = messages[messages.length - 1];
        const msgMeta = await client.fetchOne(msgId, {
          envelope: true, internalDate: true, source: true,
        });

        // Allow 30s tolerance for clock drift
        if (startTime && msgMeta.internalDate < new Date(startTime.getTime() - 30000)) {
          await sleep(interval);
          continue;
        }

        const parsed = await simpleParser(msgMeta.source);
        console.log(`[UpSeller] Email found: ${parsed.subject}`);

        const match = parsed.subject?.match(/(\d{4,8})/);
        if (match) {
          console.log(`[UpSeller] Code: ${match[1]}`);
          await client.messageDelete(messages).catch(() => {});
          return match[1];
        }

        const bodyMatch = parsed.text?.match(/\b(\d{4,8})\b/);
        if (bodyMatch) {
          console.log(`[UpSeller] Code from body: ${bodyMatch[1]}`);
          await client.messageDelete(messages).catch(() => {});
          return bodyMatch[1];
        }
      }

      await sleep(interval);
    }

    throw new Error(`No verification email within ${timeout / 1000}s`);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

// ─── PUPPETEER LOGIN ────────────────────────────────────────────────────────

async function fullLogin(settings) {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  let captchaBase64 = null;

  page.on('response', async (response) => {
    if (response.url().includes('/api/vcode')) {
      try {
        const data = await response.json();
        captchaBase64 = data?.data?.replace(/^data:image\/[^;]+;base64,/, '');
      } catch { /* ignore */ }
    }
  });

  try {
    console.log('[UpSeller] Navigating to login page...');
    await page.goto(settings.upsellerUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Fill email and password
    const inputFields = await page.$$('input.ant-input');
    if (inputFields.length < 2) throw new Error('Email/password inputs not found');
    await inputFields[0].type(settings.upsellerEmail);
    await inputFields[1].type(settings.upsellerPassword);

    // Focus CAPTCHA input to trigger captcha load
    const captchaInput = await getCaptchaInput(page);
    await captchaInput.focus();
    await sleep(2000);
    if (!captchaBase64) throw new Error('Captcha not loaded');

    // Login with CAPTCHA retry
    let loginSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[UpSeller] Login attempt ${attempt}`);

      const captchaText = await solveImageCaptcha(captchaBase64, settings.anticaptchaKey);

      await captchaInput.click({ clickCount: 3 });
      await captchaInput.press('Backspace');
      await captchaInput.type(captchaText);

      const loginButton = await page.$('button.main_btn.ant-btn.ant-btn-primary');
      if (!loginButton) throw new Error('Login button not found');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        loginButton.click(),
      ]);
      await sleep(1000);

      const captchaError = await page.$('div.ant-form-extra span.f_red');
      if (captchaError) {
        console.log(`[UpSeller] CAPTCHA invalid, retrying...`);
        await page.waitForResponse(
          (res) => res.url().includes('/api/vcode') && res.status() === 200,
          { timeout: 10000 },
        ).catch(() => {});
        continue;
      }

      loginSuccess = true;
      break;
    }

    if (!loginSuccess) throw new Error('All CAPTCHA attempts failed');

    // Email verification
    console.log('[UpSeller] Checking for email verification...');
    const needsVerification = await page.$('button.send_code_btn')
      .then((el) => !!el)
      .catch(() => false);

    if (needsVerification) {
      await page.waitForSelector('button.send_code_btn', { visible: true, timeout: 5000 });
      await page.click('button.send_code_btn');
      const sendTime = new Date();

      const code = await fetchVerificationCode(
        { host: settings.imapHost, port: settings.imapPort, user: settings.imapUser, pass: settings.imapPass },
        sendTime,
        120000
      );

      await page.waitForSelector('input.inp_code.ant-input', { visible: true });
      await page.click('input.inp_code.ant-input');
      await page.type('input.inp_code.ant-input', code, { delay: 100 });

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        page.click('button.main_btn.ant-btn-primary'),
      ]);

      console.log('[UpSeller] Email verification completed');
    } else {
      console.log('[UpSeller] No email verification needed');
    }

    await sleep(3000);
    console.log(`[UpSeller] Authenticated: ${page.url()}`);

    // Extract cookies
    const browserCookies = await page.cookies();
    const cookieString = browserCookies.map((c) => `${c.name}=${c.value}`).join('; ');

    return cookieString;
  } finally {
    await browser.close();
  }
}

async function getCaptchaInput(page) {
  const spanHandles = await page.$$('span.inp_placeholder');
  for (const spanHandle of spanHandles) {
    const text = await spanHandle.evaluate((span) => span.textContent.trim());
    if (text.toUpperCase().includes('CAPTCHA')) {
      const inputHandle = await spanHandle.evaluateHandle(
        (span) => span.previousElementSibling,
      );
      return inputHandle.asElement();
    }
  }
  throw new Error('CAPTCHA input not found');
}

// ─── SESSION MANAGEMENT ─────────────────────────────────────────────────────

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

async function getOrCreateSession(settings) {
  // Try saved cookies
  const savedCookies = await upsellerRepo.getSessionCookies();
  if (savedCookies) {
    console.log('[UpSeller] Checking saved cookies...');
    if (await checkSession(savedCookies)) {
      console.log('[UpSeller] Saved cookies valid');
      return savedCookies;
    }
    console.log('[UpSeller] Saved cookies expired');
    await upsellerRepo.clearSessionCookies();
  }

  // Full login
  console.log('[UpSeller] Performing full login...');
  const cookies = await fullLogin(settings);
  await upsellerRepo.saveSessionCookies(cookies);
  console.log('[UpSeller] Cookies saved');
  return cookies;
}

// ─── DATA FETCHING ──────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

/**
 * Fetch orders from /api/order/index (POST form).
 * Uses timeType=1 (data do pedido) with startTime/endTime to filter
 * server-side, matching the UpSeller frontend behaviour.
 */
async function fetchOrders(cookies, cutoffDate) {
  const allOrders = [];
  let pageNum = 1;

  const startTime = `${cutoffDate} 00:00:00`;
  const endTime = `${getSaoPauloDate()} 23:59:59`;

  console.log(`[UpSeller] Fetching orders (timeType=1, ${startTime} → ${endTime})...`);

  while (true) {
    const params = new URLSearchParams({
      pageNum: String(pageNum),
      pageSize: String(PAGE_SIZE),
      timeType: '1',
      startTime,
      endTime,
      sortName: '1',
      sortValue: '1',
    });

    const { data: res } = await axios.post(
      'https://app.upseller.com/api/order/index',
      params.toString(),
      {
        headers: {
          Cookie: cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        timeout: 30000,
      }
    );

    if (res.code !== 0) {
      throw new Error(`order/index error: code=${res.code} msg=${res.msg}`);
    }

    const orders = res.data.list || [];
    if (orders.length === 0) break;

    allOrders.push(...orders);
    console.log(`[UpSeller] Page ${pageNum}: ${allOrders.length} orders so far`);

    // All pages fetched when we get less than a full page
    if (orders.length < PAGE_SIZE) break;

    pageNum++;
    if (pageNum > 500) break;
  }

  console.log(`[UpSeller] Total orders fetched: ${allOrders.length}`);
  return allOrders;
}

function mapOrdersToSales(orders) {
  const platformMap = {
    mercado: 'Mercado Livre',
    'mercado libre': 'Mercado Livre',
    'mercado livre': 'Mercado Livre',
    meli: 'Mercado Livre',
    shopee: 'Shopee',
    shein: 'Shein',
    amazon: 'Amazon',
    tiktok: 'TikTok Shop',
    magalu: 'Magalu',
  };

  const sales = [];

  for (const order of orders) {
    const rawPlatform = (order.platform || '').toLowerCase().trim();
    const basePlatform = platformMap[rawPlatform] || order.platform || '';
    const items = order.orderItemList || [];

    // Derive status from orderStatePlatform (e.g. CANCELLED, cancelled_cancelled, cancelled_not_delivered_returned)
    // Orders with orderAmount=0 but items with prices are refunded orders (sale happened),
    // not true cancellations - the UpSeller analytics panel counts them as valid sales
    const platformState = (order.orderStatePlatform || '').toLowerCase();
    const rawOrderTotal = parseFloat(order.orderAmount) || 0;
    const itemsSum = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.productCount || 1), 0);
    const orderTotal = rawOrderTotal > 0 ? rawOrderTotal : itemsSum;
    const isRefunded = rawOrderTotal === 0 && itemsSum > 0;
    const isCancelled = platformState.includes('cancel') && !isRefunded;
    const orderStatus = isCancelled ? 'Cancelado' : '';

    // Use orderPayTime as date (matches UpSeller's timeType=1 "hora do pagamento" filter)
    const orderDate = order.orderPayTime || order.orderCreateTime || '';

    if (items.length === 0) {
      // Order without item detail - create single row
      sales.push({
        orderId: order.orderNumber || '',
        date: orderDate,
        store: order.shopName || '',
        product: 'Geral',
        adName: 'Geral',
        variation: '',
        sku: '',
        quantity: 1,
        total: orderTotal,
        unitPrice: orderTotal,
        state: '',
        platform: basePlatform,
        status: orderStatus,
        cancelBy: '',
        cancelReason: '',
        image: '',
        clientName: order.buyerAccount || order.buyerName || '',
        codcli: '',
        nomeFantasia: '',
        cnpjCpf: '',
      });
    } else {
      // Distribute orderTotal proportionally across items
      const ratio = itemsSum > 0 ? orderTotal / itemsSum : 1;

      for (const item of items) {
        const itemValue = (parseFloat(item.price) || 0) * (item.productCount || 1);
        sales.push({
          orderId: order.orderNumber || '',
          date: orderDate,
          store: order.shopName || '',
          product: item.productName || 'Geral',
          adName: item.productName || 'Geral',
          variation: item.productAttr || '',
          sku: item.productSku || item.variationSku || '',
          quantity: item.productCount || 1,
          total: Number((itemValue * ratio).toFixed(2)),
          unitPrice: Number(((parseFloat(item.price) || 0) * ratio).toFixed(2)),
          state: '',
          platform: basePlatform,
          status: orderStatus,
          cancelBy: '',
          cancelReason: item.cancelReason || '',
          image: item.productImg || '',
          clientName: order.buyerAccount || order.buyerName || '',
          codcli: '',
          nomeFantasia: '',
          cnpjCpf: '',
        });
      }
    }
  }

  return sales;
}

// ─── SYNC ───────────────────────────────────────────────────────────────────

async function runSync() {
  if (isSyncing) {
    console.log('[UpSeller] Sync already in progress, skipping');
    return { success: false, message: 'Sincronização já em andamento.' };
  }

  isSyncing = true;
  console.log('[UpSeller] Starting sync...');

  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings || !settings.active) {
      return { success: false, message: 'Integração não ativa.' };
    }

    if (!settings.upsellerEmail || !settings.upsellerPassword || !settings.anticaptchaKey) {
      await upsellerRepo.updateSyncStatus('error', 'Configuração incompleta.', 0);
      return { success: false, message: 'Configuração incompleta.' };
    }

    // Calculate cutoff date in São Paulo timezone
    const days = settings.defaultDays || 90;
    const cutoffDate = getSaoPauloDate(-days);
    console.log(`[UpSeller] Date range: ${cutoffDate} → ${getSaoPauloDate()} (São Paulo TZ)`);

    // Get or create session
    const cookies = await getOrCreateSession(settings);

    // Fetch orders (paginate until cutoff date)
    const orders = await fetchOrders(cookies, cutoffDate);

    if (orders.length === 0) {
      await upsellerRepo.updateSyncStatus('success', 'Nenhum pedido encontrado.', 0);
      return { success: true, message: 'Nenhum pedido encontrado.', rows: 0 };
    }

    // Map and upsert
    const salesData = mapOrdersToSales(orders);
    const validRows = salesData.filter((r) => r.date && r.total > 0);

    console.log(`[UpSeller] ${validRows.length} valid rows to upsert`);

    // Clean old UpSeller data in the date range to avoid duplicates
    // (old profit-report rows had product="Geral", new order/index rows have real product names)
    const upsellerPlatforms = ['Mercado Livre', 'Shopee', 'Shein', 'Amazon', 'TikTok Shop', 'Magalu'];
    await db.query(
      `DELETE FROM sales WHERE platform = ANY($1) AND date::date >= $2::date`,
      [upsellerPlatforms, cutoffDate]
    );

    const { inserted, updated } = await salesRepo.batchUpsertSales(validRows, 'online');

    const message = `Sincronizado: ${inserted} inseridos, ${updated} atualizados (${validRows.length} pedidos).`;
    console.log(`[UpSeller] ${message}`);
    await upsellerRepo.updateSyncStatus('success', message, validRows.length);

    return { success: true, message, rows: validRows.length, inserted, updated };
  } catch (error) {
    const message = error.message || 'Erro desconhecido';
    console.error('[UpSeller] Sync error:', message);
    await upsellerRepo.updateSyncStatus('error', message, 0);

    // If login-related error, clear cookies so next attempt does fresh login
    if (message.includes('CAPTCHA') || message.includes('Login') || message.includes('login')) {
      await upsellerRepo.clearSessionCookies().catch(() => {});
    }

    return { success: false, message };
  } finally {
    isSyncing = false;
  }
}

// ─── SCHEDULER ──────────────────────────────────────────────────────────────

async function startUpsellerSyncScheduler() {
  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings || !settings.active) {
      console.log('[UpSeller] Integration not active, scheduler not started.');
      return;
    }

    const interval = settings.syncIntervalMinutes || 60;
    const schedule = `*/${interval} * * * *`;

    currentJob = cron.schedule(schedule, async () => {
      await runSync();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    console.log(`[UpSeller] Scheduler started (every ${interval} minutes)`);
  } catch (error) {
    console.error('[UpSeller] Failed to start scheduler:', error.message);
  }
}

function stopUpsellerSyncScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    console.log('[UpSeller] Scheduler stopped');
  }
}

async function restartUpsellerSyncScheduler() {
  stopUpsellerSyncScheduler();
  await startUpsellerSyncScheduler();
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  startUpsellerSyncScheduler,
  stopUpsellerSyncScheduler,
  restartUpsellerSyncScheduler,
  runSync,
};
