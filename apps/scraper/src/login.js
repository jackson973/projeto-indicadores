/**
 * Login module - Uses Puppeteer to authenticate on UpSeller.
 * Handles CAPTCHA solving and email verification.
 * Returns session cookies for HTTP API calls.
 *
 * Supports cookie persistence: saves cookies after login and
 * reuses them if still valid (checked via /api/is-login).
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import config from './config.js';
import logger from './logger.js';
import { solveImageCaptcha } from './captcha.js';
import { fetchCode } from './email.js';

puppeteer.use(StealthPlugin());

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = resolve(__dirname, '..', '.cookies.json');
const MAX_CAPTCHA_ATTEMPTS = 3;

/**
 * Try to reuse saved cookies. If invalid, do full login.
 * @returns {Promise<{cookies: string, jsessionId: string}>}
 */
export async function login() {
  // Try saved cookies first
  const saved = loadCookies();
  if (saved) {
    logger.info('Found saved cookies, checking if still valid...');
    const valid = await checkSession(saved.cookies);
    if (valid) {
      logger.info('Saved cookies are still valid, skipping login');
      return saved;
    }
    logger.info('Saved cookies expired, doing full login');
  }

  const result = await fullLogin();

  // Save cookies for next run
  saveCookies(result);
  return result;
}

function loadCookies() {
  try {
    const data = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
    if (data.cookies && data.savedAt) {
      // Reject if older than 24h
      const age = Date.now() - new Date(data.savedAt).getTime();
      if (age < 24 * 60 * 60 * 1000) return data;
    }
  } catch { /* no saved cookies */ }
  return null;
}

function saveCookies(data) {
  writeFileSync(COOKIE_FILE, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  logger.info('Cookies saved for reuse');
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

/**
 * Full login via Puppeteer (CAPTCHA + email verification).
 */
async function fullLogin() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  let captchaBase64 = null;

  // Intercept CAPTCHA from API response
  page.on('response', async (response) => {
    if (response.url().includes('/api/vcode')) {
      try {
        const data = await response.json();
        captchaBase64 = data?.data?.replace(/^data:image\/[^;]+;base64,/, '');
        logger.info('Captcha base64 captured from API');
      } catch { /* ignore */ }
    }
  });

  try {
    // Step 1: Navigate to login page
    logger.info('Navigating to login page...');
    await page.goto(config.upseller.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Step 2: Fill email and password
    const inputFields = await page.$$('input.ant-input');
    if (inputFields.length < 2) throw new Error('Email/password inputs not found');
    await inputFields[0].type(config.upseller.email);
    await inputFields[1].type(config.upseller.password);
    logger.info('Email and password filled');

    // Step 3: Focus CAPTCHA input to trigger captcha load
    const captchaInput = await getCaptchaInput(page);
    await captchaInput.focus();
    await sleep(2000);
    if (!captchaBase64) throw new Error('Captcha not loaded after focus');

    // Step 4: Login with CAPTCHA retry loop
    let loginSuccess = false;

    for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
      logger.info({ attempt }, 'Login attempt');

      const captchaText = await solveImageCaptcha(captchaBase64);
      logger.info({ captchaText }, 'CAPTCHA solved');

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

      // Check for CAPTCHA error
      const captchaError = await page.$('div.ant-form-extra span.f_red');
      if (captchaError) {
        logger.warn({ attempt }, 'CAPTCHA invalid, retrying...');
        await page.waitForResponse(
          (res) => res.url().includes('/api/vcode') && res.status() === 200,
          { timeout: 10000 },
        ).catch(() => {});
        continue;
      }

      loginSuccess = true;
      logger.info('Login successful');
      break;
    }

    if (!loginSuccess) throw new Error('All CAPTCHA attempts failed');

    // Step 5: Handle email verification
    logger.info('Checking for email verification...');
    await handleEmailVerification(page);
    await sleep(3000);

    logger.info({ url: page.url() }, 'Authenticated');

    // Step 6: Extract session cookies
    const browserCookies = await page.cookies();
    const cookieString = browserCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const jsessionId = browserCookies.find((c) => c.name === 'JSESSIONID')?.value;

    logger.info('Session cookies extracted');
    return { cookies: cookieString, jsessionId };
  } finally {
    await browser.close();
    logger.info('Browser closed');
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

async function handleEmailVerification(page) {
  try {
    await page.waitForSelector('button.send_code_btn', { visible: true, timeout: 5000 });
  } catch {
    logger.info('No email verification needed');
    return;
  }

  await page.click('button.send_code_btn');
  const sendCodeClickTime = new Date();
  logger.info('Send Code clicked');

  const code = await fetchCode(sendCodeClickTime, { timeout: 120000 });
  logger.info({ code }, 'Verification code received');

  await page.waitForSelector('input.inp_code.ant-input', { visible: true });
  await page.click('input.inp_code.ant-input');
  await page.type('input.inp_code.ant-input', code, { delay: 100 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button.main_btn.ant-btn-primary'),
  ]);

  logger.info('Email verification completed');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
