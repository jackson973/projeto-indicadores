/**
 * Investigation script - Based on user's working login flow.
 * Uses Puppeteer to login to UpSeller, intercept API requests,
 * and map endpoints for the report download.
 *
 * Usage: npm run investigate
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import logger from './logger.js';
import { solveImageCaptcha, getBalance } from './captcha.js';
import { fetchCode } from './email.js';

puppeteer.use(StealthPlugin());

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, '..', 'logs');
mkdirSync(LOGS_DIR, { recursive: true });

const interceptedRequests = [];

async function main() {
  await getBalance();

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  let captchaBase64 = null;

  // Intercept CAPTCHA from API response
  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('/api/vcode')) {
      try {
        const data = await response.json();
        captchaBase64 = data?.data?.replace(/^data:image\/[^;]+;base64,/, '');
        logger.info('Captcha base64 captured from API');
      } catch (e) {
        logger.error({ err: e.message }, 'Failed to read captcha from response');
      }
    }

    // Log UpSeller API responses
    if (url.includes('app.upseller.com/api')) {
      try {
        const body = await response.json().catch(() => null);
        const entry = {
          timestamp: new Date().toISOString(),
          method: response.request().method(),
          url,
          status: response.status(),
          requestHeaders: filterHeaders(response.request().headers()),
          requestBody: tryParseJson(response.request().postData()),
          responseBody: body,
        };
        interceptedRequests.push(entry);
        logger.info({ method: entry.method, url, status: entry.status }, '← API');
        if (body) logger.info({ body: summarize(body) }, '  data');
      } catch { /* ignore */ }
    }
  });

  try {
    // Step 1: Navigate to login page
    logger.info('Navigating to login page...');
    await page.goto(config.upseller.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.screenshot({ path: resolve(LOGS_DIR, '01-login-page.png'), fullPage: true });

    // Step 2: Fill email and password
    logger.info('Filling email and password...');
    const inputFields = await page.$$('input.ant-input');
    if (inputFields.length < 2) throw new Error('Email/password inputs not found');
    await inputFields[0].type(config.upseller.email);
    await inputFields[1].type(config.upseller.password);
    logger.info('Email and password filled');

    // Step 3: Find and focus CAPTCHA input (triggers new captcha load)
    const captchaInput = await getCaptchaInput(page);
    await captchaInput.focus();
    logger.info('CAPTCHA input focused, waiting for captcha image...');
    await sleep(2000);

    if (!captchaBase64) throw new Error('Captcha not loaded after focus');

    await page.screenshot({ path: resolve(LOGS_DIR, '02-form-filled.png'), fullPage: true });

    // Step 4: Login with CAPTCHA retry loop
    let loginSuccess = false;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      logger.info({ attempt }, 'Login attempt');

      // Solve CAPTCHA
      const captchaText = await solveImageCaptcha(captchaBase64);
      logger.info({ captchaText }, 'CAPTCHA solved');

      // Fill CAPTCHA input
      await captchaInput.click({ clickCount: 3 });
      await captchaInput.press('Backspace');
      await captchaInput.type(captchaText);

      // Click Login button
      const loginButton = await page.$('button.main_btn.ant-btn.ant-btn-primary');
      if (!loginButton) throw new Error('Login button not found');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        loginButton.click(),
      ]);

      await sleep(1000);
      await page.screenshot({ path: resolve(LOGS_DIR, `03-attempt-${attempt}.png`), fullPage: true });

      // Check for CAPTCHA error
      const captchaError = await page.$('div.ant-form-extra span.f_red');
      if (captchaError) {
        logger.warn({ attempt }, 'CAPTCHA invalid, retrying...');

        // Wait for new captcha from API
        await page.waitForResponse(
          (res) => res.url().includes('/api/vcode') && res.status() === 200,
          { timeout: 10000 },
        ).catch(() => logger.warn('Timeout waiting for new captcha'));

        // Update captcha base64
        const captchaElement = await page.$('img[src^="data:image"]');
        if (captchaElement) {
          const newSrc = await page.evaluate((img) => img.src, captchaElement);
          captchaBase64 = newSrc.replace(/^data:image\/[^;]+;base64,/, '');
        }
        continue;
      }

      loginSuccess = true;
      logger.info('Login successful (no captcha error)');
      break;
    }

    if (!loginSuccess) throw new Error('All login attempts failed');

    logger.info({ url: page.url() }, 'URL after login');
    await page.screenshot({ path: resolve(LOGS_DIR, '04-after-login.png'), fullPage: true });

    // Step 5: Handle email verification
    logger.info('Checking for email verification...');
    await handleEmailVerification(page);
    await sleep(3000);

    await page.screenshot({ path: resolve(LOGS_DIR, '05-after-verification.png'), fullPage: true });
    logger.info({ url: page.url() }, 'URL after verification');

    // Step 6: Navigate to profit report page
    logger.info('Navigating to profit report...');
    await page.goto('https://app.upseller.com/pt/finance/profit-report/order', {
      waitUntil: 'networkidle2',
    });
    await sleep(3000);
    await page.screenshot({ path: resolve(LOGS_DIR, '06-report-page.png'), fullPage: true });
    logger.info({ url: page.url() }, 'Report page loaded');

    // Step 7: Manual exploration - user selects dates and exports
    logger.info('=== BROWSER ABERTO PARA EXPLORAÇÃO MANUAL (10 minutos) ===');
    logger.info('Por favor: feche o modal, selecione o período e clique em Exportar');
    logger.info('Todas as chamadas de API serão capturadas automaticamente');
    await sleep(600000);

  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Investigation failed');
    await page.screenshot({ path: resolve(LOGS_DIR, 'error.png'), fullPage: true });
  } finally {
    const logPath = resolve(LOGS_DIR, `requests-${Date.now()}.json`);
    writeFileSync(logPath, JSON.stringify(interceptedRequests, null, 2));
    logger.info({ path: logPath, count: interceptedRequests.length }, 'Saved intercepted requests');
    await browser.close();
  }
}

/**
 * Find the CAPTCHA input via the placeholder span.
 */
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
  throw new Error('CAPTCHA input not found via placeholder span');
}

/**
 * Handle email verification after login.
 * Based on user's working emailAuth.js.
 */
async function handleEmailVerification(page) {
  // Click "Send Code" button
  try {
    await page.waitForSelector('button.send_code_btn', { visible: true, timeout: 5000 });
  } catch {
    logger.info('No Send Code button found - verification may not be needed');
    return false;
  }

  await page.click('button.send_code_btn');
  const sendCodeClickTime = new Date();
  logger.info('Clicked Send Code button');

  await page.screenshot({ path: resolve(LOGS_DIR, '04b-code-requested.png'), fullPage: true });

  // Fetch code from email
  logger.info('Waiting for verification code in email...');
  const code = await fetchCode(sendCodeClickTime, { timeout: 120000 });
  logger.info({ code }, 'Verification code received');

  // Fill code input (specific selector from working script)
  await page.waitForSelector('input.inp_code.ant-input', { visible: true });
  await page.click('input.inp_code.ant-input');
  await page.type('input.inp_code.ant-input', code, { delay: 100 });
  logger.info('Verification code entered');

  // Click Continue
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button.main_btn.ant-btn-primary'),
  ]);

  logger.info({ url: page.url() }, 'After email verification');
  return true;
}

async function explorePage(page) {
  // Capture all navigation elements
  const navInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      text: a.innerText.trim().substring(0, 80),
      href: a.href,
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => ({
      text: b.innerText.trim().substring(0, 50),
      class: b.className,
    }));
    const menuItems = Array.from(
      document.querySelectorAll('[class*="menu-item"], [class*="nav"], [class*="sidebar"]'),
    ).map((el) => ({
      tag: el.tagName,
      text: el.innerText.trim().substring(0, 200),
      class: el.className,
    }));

    return {
      links: links.filter((l) => l.text.length > 0).slice(0, 100),
      buttons: buttons.filter((b) => b.text.length > 0).slice(0, 50),
      menuItems: menuItems.slice(0, 20),
    };
  });

  writeFileSync(resolve(LOGS_DIR, 'navigation.json'), JSON.stringify(navInfo, null, 2));
  logger.info(
    { links: navInfo.links.length, buttons: navInfo.buttons.length },
    'Navigation elements saved',
  );

  const html = await page.content();
  writeFileSync(resolve(LOGS_DIR, 'dashboard.html'), html);
  logger.info('Dashboard HTML saved');
}

/**
 * Apply date range filter on the report page.
 * Based on user's PreencherFiltrosDatas.
 */
async function applyDateFilter(page, startDate, endDate) {
  await page.waitForSelector('.ant-calendar-picker-input.ant-input', { timeout: 10000 });
  await page.click('.ant-calendar-picker-input.ant-input');
  logger.info('Date picker opened');

  await page.waitForSelector('input.ant-calendar-range-picker-input');
  const inputs = await page.$$('input.ant-calendar-range-picker-input');
  if (inputs.length < 2) throw new Error('Date range inputs not found');

  await page.evaluate(
    (start, end) => {
      const inputs = document.querySelectorAll('input.ant-calendar-range-picker-input');
      inputs[0].value = '';
      inputs[1].value = '';
      inputs[0].value = start;
      inputs[1].value = end;

      [inputs[0], inputs[1]].forEach((input, i) => {
        const val = i === 0 ? start : end;
        input.focus();
        input.dispatchEvent(new Event('focus', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        if (input._valueTracker) input._valueTracker.setValue('');
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    startDate,
    endDate,
  );

  await inputs[1].focus();
  await inputs[1].press('Enter');
  await page.click('body');
  logger.info({ startDate, endDate }, 'Date filter applied');
}

/**
 * Find an export/download button on the report page.
 */
async function findExportButton(page) {
  // Try common export button patterns
  const selectors = [
    'button:has(span:contains("Export"))',
    'button:has(span:contains("Exportar"))',
    'button:has(span:contains("Download"))',
    'button:has(span:contains("Baixar"))',
    'a[href*="export"]',
    'a[href*="download"]',
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await page.evaluate((e) => e.innerText, el);
        logger.info({ selector: sel, text }, 'Found export element');
        return el;
      }
    } catch { /* selector may not be valid */ }
  }

  // Fallback: search by button text content
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate((b) => b.innerText.trim().toLowerCase(), btn);
    if (text.includes('export') || text.includes('exportar') || text.includes('download')) {
      logger.info({ text }, 'Found export button by text');
      return btn;
    }
  }

  // Also check for icons/links
  const links = await page.$$('a');
  for (const link of links) {
    const text = await page.evaluate((a) => a.innerText.trim().toLowerCase(), link);
    const href = await page.evaluate((a) => a.href, link);
    if (text.includes('export') || text.includes('download') || href.includes('export')) {
      logger.info({ text, href }, 'Found export link');
      return link;
    }
  }

  logger.warn('No export/download button found');
  return null;
}

// Helpers
function filterHeaders(headers) {
  const keep = ['content-type', 'authorization', 'cookie', 'x-csrf-token', 'x-requested-with'];
  const filtered = {};
  for (const k of keep) {
    if (headers[k]) filtered[k] = headers[k];
  }
  return filtered;
}

function tryParseJson(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function summarize(obj) {
  const str = JSON.stringify(obj);
  return str.length > 500 ? str.substring(0, 500) + '...' : obj;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'Fatal error');
  process.exit(1);
});
