import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import config from './config.js';
import logger from './logger.js';

/**
 * Fetch the verification code from the UpSeller email.
 * Keeps IMAP connection open and polls until a matching email arrives.
 *
 * Based on user's working fetchCode.js.
 *
 * @param {Date} startTime - Only consider emails after this time.
 * @param {object} [options]
 * @param {number} [options.timeout=60000] - Max wait time in ms.
 * @param {number} [options.interval=2000] - Poll interval in ms.
 * @returns {Promise<string>} The verification code.
 */
export async function fetchCode(startTime, { timeout = 60000, interval = 3000 } = {}) {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: true,
    auth: { user: config.imap.user, pass: config.imap.pass },
    tls: { rejectUnauthorized: false },
    logger: false,
  });

  logger.info('Connecting to IMAP server...');
  await client.connect();
  logger.info('IMAP connected');

  const lock = await client.getMailboxLock('INBOX');
  logger.info('INBOX locked');

  try {
    // Delete old UpSeller verification emails first (search returns sequence numbers)
    const oldMsgs = await client.search({ subject: 'UpSeller' });
    if (oldMsgs.length > 0) {
      logger.info({ count: oldMsgs.length }, 'Deleting old UpSeller emails');
      await client.messageDelete(oldMsgs).catch((e) => {
        logger.warn({ err: e.message }, 'Failed to delete old emails');
      });
    }

    const start = Date.now();

    while (Date.now() - start < timeout) {
      logger.info('Searching for verification email...');

      // Use NOOP to force server to notify about new messages
      await client.noop();

      // Search for 'UpSeller' to match both PT and EN subjects (old ones already deleted)
      const messages = await client.search({ subject: 'UpSeller' });
      logger.info({ count: messages.length }, 'Search results');

      if (messages.length > 0) {
        // Get the newest message (last sequence number)
        const msgId = messages[messages.length - 1];
        const msgMeta = await client.fetchOne(msgId, {
          envelope: true,
          internalDate: true,
          source: true,
        });

        // Skip emails older than startTime (with 30s tolerance for clock drift)
        const tolerance = 30000;
        if (startTime && msgMeta.internalDate < new Date(startTime.getTime() - tolerance)) {
          logger.info(
            { date: msgMeta.internalDate.toISOString(), startTime: startTime.toISOString() },
            'Email too old, waiting for new one...',
          );
          await sleep(interval);
          continue;
        }

        const parsed = await simpleParser(msgMeta.source);
        logger.info({ subject: parsed.subject, from: parsed.from?.text }, 'Email found');

        const match = parsed.subject?.match(/(\d{4,8})/);
        if (match) {
          logger.info({ code: match[1] }, 'Code extracted from subject');

          // Delete all UpSeller emails to keep inbox clean
          await client.messageDelete(messages).catch(() => {});
          return match[1];
        }

        // Also try body
        const bodyMatch = parsed.text?.match(/\b(\d{4,8})\b/);
        if (bodyMatch) {
          logger.info({ code: bodyMatch[1] }, 'Code extracted from body');
          await client.messageDelete(messages).catch(() => {});
          return bodyMatch[1];
        }

        logger.warn({ subject: parsed.subject }, 'No code found in email');
      }

      await sleep(interval);
    }

    throw new Error(`No verification email received within ${timeout / 1000}s`);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
    logger.info('IMAP connection closed');
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
