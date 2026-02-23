import anticaptcha from '@antiadmin/anticaptchaofficial';
import config from './config.js';
import logger from './logger.js';

anticaptcha.setAPIKey(config.anticaptcha.key);

/**
 * Solve an image CAPTCHA (text recognition) with retries.
 * @param {string} base64Image - Base64 encoded image (with or without data URI prefix).
 * @param {number} [maxRetries=5] - Max retry attempts.
 * @returns {Promise<string>} The recognized text.
 */
export async function solveImageCaptcha(base64Image, maxRetries = 5) {
  const clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ attempt }, 'Solving image CAPTCHA...');
      const text = await anticaptcha.solveImage(clean, true);
      logger.info({ text }, 'Image CAPTCHA solved');
      return text;
    } catch (err) {
      const msg = String(err?.message || err);
      logger.warn({ attempt, error: msg }, 'CAPTCHA solve failed');
      if (msg.includes('NO_SLOT') && attempt < maxRetries) {
        logger.warn({ attempt }, 'No workers available, retrying in 10s...');
        await new Promise((r) => setTimeout(r, 10000));
      } else {
        throw err;
      }
    }
  }
}

export async function getBalance() {
  const balance = await anticaptcha.getBalance();
  logger.info({ balance }, 'AntiCaptcha balance');
  return balance;
}
