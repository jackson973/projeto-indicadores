const db = require('./connection');

/**
 * Get all sales alerts joined with user info (for admin panel)
 */
async function getAllAlerts() {
  const result = await db.query(`
    SELECT
      u.id AS "userId",
      u.name,
      u.whatsapp,
      u.active AS "userActive",
      COALESCE(a.active, false) AS "alertActive",
      COALESCE(a.interval_hours, 1) AS "intervalHours",
      COALESCE(a.hour_start, 8) AS "hourStart",
      COALESCE(a.hour_end, 22) AS "hourEnd",
      COALESCE(a.peak_alert, false) AS "peakAlert",
      a.last_sent_at AS "lastSentAt"
    FROM users u
    LEFT JOIN whatsapp_sales_alerts a ON a.user_id = u.id
    WHERE u.active = true
    ORDER BY u.name
  `);
  return result.rows;
}

/**
 * Get alert config for a single user
 */
async function getAlertByUserId(userId) {
  const result = await db.query(
    `SELECT
       active, interval_hours AS "intervalHours",
       hour_start AS "hourStart", hour_end AS "hourEnd",
       peak_alert AS "peakAlert", last_sent_at AS "lastSentAt"
     FROM whatsapp_sales_alerts WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Upsert alert config for a user
 */
async function upsertAlert(userId, { active, intervalHours, hourStart, hourEnd, peakAlert }) {
  const result = await db.query(
    `INSERT INTO whatsapp_sales_alerts (user_id, active, interval_hours, hour_start, hour_end, peak_alert)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       active = EXCLUDED.active,
       interval_hours = EXCLUDED.interval_hours,
       hour_start = EXCLUDED.hour_start,
       hour_end = EXCLUDED.hour_end,
       peak_alert = EXCLUDED.peak_alert
     RETURNING *`,
    [userId, active, intervalHours || 1, hourStart ?? 8, hourEnd ?? 22, peakAlert || false]
  );
  return result.rows[0];
}

/**
 * Get users who should receive an alert right now.
 * Checks: alert active, user active, has whatsapp, within active hours,
 * current hour aligns with interval, and enough time since last send.
 */
async function getAlertsToSendNow() {
  const result = await db.query(`
    SELECT
      u.id, u.name, u.whatsapp,
      a.interval_hours AS "intervalHours",
      a.peak_alert AS "peakAlert",
      a.last_sent_at AS "lastSentAt"
    FROM whatsapp_sales_alerts a
    JOIN users u ON u.id = a.user_id
    WHERE a.active = true
      AND u.active = true
      AND u.whatsapp IS NOT NULL
      AND u.whatsapp != ''
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') >= a.hour_start
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') < a.hour_end
      AND MOD(EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::int, a.interval_hours) = 0
      AND (
        a.last_sent_at IS NULL
        OR a.last_sent_at < NOW() - INTERVAL '1 hour' * (a.interval_hours - 0.5)
      )
  `);
  return result.rows;
}

/**
 * Get all users with peak_alert enabled (for spike detection)
 */
async function getPeakAlertUsers() {
  const result = await db.query(`
    SELECT u.id, u.name, u.whatsapp
    FROM whatsapp_sales_alerts a
    JOIN users u ON u.id = a.user_id
    WHERE a.active = true
      AND a.peak_alert = true
      AND u.active = true
      AND u.whatsapp IS NOT NULL
      AND u.whatsapp != ''
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') >= a.hour_start
      AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') < a.hour_end
  `);
  return result.rows;
}

/**
 * Update last_sent_at after successful send
 */
async function updateLastSentAt(userId) {
  await db.query(
    'UPDATE whatsapp_sales_alerts SET last_sent_at = NOW() WHERE user_id = $1',
    [userId]
  );
}

module.exports = {
  getAllAlerts,
  getAlertByUserId,
  upsertAlert,
  getAlertsToSendNow,
  getPeakAlertUsers,
  updateLastSentAt
};
