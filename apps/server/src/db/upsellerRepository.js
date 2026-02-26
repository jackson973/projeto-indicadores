const db = require('./connection');
const { encrypt, decrypt } = require('../lib/encryption');

async function getSettings() {
  const result = await db.query(
    `SELECT id, active,
            upseller_email AS "upsellerEmail",
            upseller_password_encrypted AS "upsellerPasswordEncrypted",
            upseller_url AS "upsellerUrl",
            anticaptcha_key_encrypted AS "anticaptchaKeyEncrypted",
            imap_host AS "imapHost", imap_port AS "imapPort",
            imap_user AS "imapUser", imap_pass_encrypted AS "imapPassEncrypted",
            sync_interval_minutes AS "syncIntervalMinutes",
            default_days AS "defaultDays",
            last_sync_at AT TIME ZONE 'UTC' AS "lastSyncAt", last_sync_status AS "lastSyncStatus",
            last_sync_message AS "lastSyncMessage", last_sync_rows AS "lastSyncRows",
            session_cookies AS "sessionCookies",
            session_saved_at AT TIME ZONE 'UTC' AS "sessionSavedAt",
            created_at AT TIME ZONE 'UTC' AS "createdAt", updated_at AT TIME ZONE 'UTC' AS "updatedAt"
     FROM upseller_settings WHERE id = 1`
  );

  const row = result.rows[0];
  if (!row) return null;

  const tryDecrypt = (val) => {
    if (!val) return '';
    try { return decrypt(val); } catch { return ''; }
  };

  return {
    ...row,
    upsellerPassword: tryDecrypt(row.upsellerPasswordEncrypted),
    anticaptchaKey: tryDecrypt(row.anticaptchaKeyEncrypted),
    imapPass: tryDecrypt(row.imapPassEncrypted),
    upsellerPasswordEncrypted: undefined,
    anticaptchaKeyEncrypted: undefined,
    imapPassEncrypted: undefined
  };
}

async function updateSettings({
  active, upsellerEmail, upsellerPassword, upsellerUrl,
  anticaptchaKey, imapHost, imapPort, imapUser, imapPass,
  syncIntervalMinutes, defaultDays
}) {
  const params = [
    active || false,
    (upsellerEmail || '').trim(),
    (upsellerUrl || 'https://app.upseller.com/pt/login').trim(),
    (imapHost || 'imap.gmail.com').trim(),
    imapPort || 993,
    (imapUser || '').trim(),
    syncIntervalMinutes || 60,
    defaultDays || 90
  ];

  // Build dynamic encrypted field clauses
  let extraClauses = '';
  let paramIndex = 9;

  if (upsellerPassword && upsellerPassword !== '********') {
    extraClauses += `, upseller_password_encrypted = $${paramIndex}`;
    params.push(encrypt(upsellerPassword));
    paramIndex++;
  }

  if (anticaptchaKey && anticaptchaKey !== '********') {
    extraClauses += `, anticaptcha_key_encrypted = $${paramIndex}`;
    params.push(encrypt(anticaptchaKey));
    paramIndex++;
  }

  if (imapPass && imapPass !== '********') {
    extraClauses += `, imap_pass_encrypted = $${paramIndex}`;
    params.push(encrypt(imapPass));
    paramIndex++;
  }

  const result = await db.query(
    `UPDATE upseller_settings SET
       active = $1, upseller_email = $2, upseller_url = $3,
       imap_host = $4, imap_port = $5, imap_user = $6,
       sync_interval_minutes = $7, default_days = $8
       ${extraClauses}
     WHERE id = 1
     RETURNING id, active,
               upseller_email AS "upsellerEmail",
               upseller_url AS "upsellerUrl",
               imap_host AS "imapHost", imap_port AS "imapPort",
               imap_user AS "imapUser",
               sync_interval_minutes AS "syncIntervalMinutes",
               default_days AS "defaultDays",
               last_sync_at AT TIME ZONE 'UTC' AS "lastSyncAt", last_sync_status AS "lastSyncStatus",
               last_sync_message AS "lastSyncMessage", last_sync_rows AS "lastSyncRows"`,
    params
  );

  return result.rows[0] || null;
}

async function isActive() {
  const result = await db.query(
    `SELECT active, upseller_email, upseller_password_encrypted,
            anticaptcha_key_encrypted, imap_user, imap_pass_encrypted
     FROM upseller_settings WHERE id = 1`
  );

  const row = result.rows[0];
  if (!row) return false;

  return (
    row.active === true &&
    !!row.upseller_email &&
    !!row.upseller_password_encrypted &&
    !!row.anticaptcha_key_encrypted &&
    !!row.imap_user &&
    !!row.imap_pass_encrypted
  );
}

async function updateSyncStatus(status, message, rows) {
  await db.query(
    `UPDATE upseller_settings SET
       last_sync_at = CURRENT_TIMESTAMP,
       last_sync_status = $1,
       last_sync_message = $2,
       last_sync_rows = $3
     WHERE id = 1`,
    [status, message, rows || 0]
  );
}

async function getSessionCookies() {
  const result = await db.query(
    `SELECT session_cookies AS "sessionCookies",
            session_saved_at AT TIME ZONE 'UTC' AS "sessionSavedAt"
     FROM upseller_settings WHERE id = 1`
  );

  const row = result.rows[0];
  if (!row || !row.sessionCookies || !row.sessionSavedAt) return null;

  // Reject if older than 24h
  const age = Date.now() - new Date(row.sessionSavedAt).getTime();
  if (age > 24 * 60 * 60 * 1000) return null;

  return row.sessionCookies;
}

async function saveSessionCookies(cookies) {
  await db.query(
    `UPDATE upseller_settings SET
       session_cookies = $1,
       session_saved_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [cookies]
  );
}

async function clearSessionCookies() {
  await db.query(
    `UPDATE upseller_settings SET
       session_cookies = NULL,
       session_saved_at = NULL
     WHERE id = 1`
  );
}

module.exports = {
  getSettings,
  updateSettings,
  isActive,
  updateSyncStatus,
  getSessionCookies,
  saveSessionCookies,
  clearSessionCookies
};
