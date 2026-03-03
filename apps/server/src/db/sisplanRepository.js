const db = require('./connection');
const { encrypt, decrypt } = require('../lib/encryption');

async function getSettings() {
  const result = await db.query(
    `SELECT id, active, host, port, database_path AS "databasePath",
            fb_user AS "fbUser", fb_password_encrypted AS "fbPasswordEncrypted",
            sql_query AS "sqlQuery", column_mapping AS "columnMapping",
            sync_interval_minutes AS "syncIntervalMinutes",
            last_sync_at AT TIME ZONE 'UTC' AS "lastSyncAt", last_sync_status AS "lastSyncStatus",
            last_sync_message AS "lastSyncMessage", last_sync_rows AS "lastSyncRows",
            nf_active AS "nfActive", nf_sql_query AS "nfSqlQuery",
            nf_column_mapping AS "nfColumnMapping", nf_base_path AS "nfBasePath",
            nf_local_path AS "nfLocalPath",
            nf_last_sync_at AT TIME ZONE 'UTC' AS "nfLastSyncAt",
            nf_last_sync_status AS "nfLastSyncStatus",
            nf_last_sync_message AS "nfLastSyncMessage",
            nf_last_sync_rows AS "nfLastSyncRows",
            created_at AT TIME ZONE 'UTC' AS "createdAt", updated_at AT TIME ZONE 'UTC' AS "updatedAt"
     FROM sisplan_settings WHERE id = 1`
  );

  const row = result.rows[0];
  if (!row) return null;

  let fbPassword = '';
  if (row.fbPasswordEncrypted) {
    try {
      fbPassword = decrypt(row.fbPasswordEncrypted);
    } catch {
      fbPassword = '';
    }
  }

  return {
    ...row,
    fbPassword,
    fbPasswordEncrypted: undefined
  };
}

async function updateSettings({
  active, host, port, databasePath, fbUser, fbPassword,
  sqlQuery, columnMapping, syncIntervalMinutes,
  nfActive, nfSqlQuery, nfColumnMapping, nfBasePath, nfLocalPath
}) {
  let passwordClause = '';
  const params = [
    active, host, port || 3050, databasePath, fbUser,
    sqlQuery, columnMapping || {}, syncIntervalMinutes || 5,
    nfActive || false, (nfSqlQuery || '').trim() || null,
    nfColumnMapping || {}, (nfBasePath || '').trim() || null,
    (nfLocalPath || '').trim() || null
  ];
  let paramIndex = 14;

  if (fbPassword) {
    const encrypted = encrypt(fbPassword);
    passwordClause = `, fb_password_encrypted = $${paramIndex}`;
    params.push(encrypted);
    paramIndex++;
  }

  const result = await db.query(
    `UPDATE sisplan_settings SET
       active = $1, host = $2, port = $3, database_path = $4, fb_user = $5,
       sql_query = $6, column_mapping = $7, sync_interval_minutes = $8,
       nf_active = $9, nf_sql_query = $10, nf_column_mapping = $11, nf_base_path = $12,
       nf_local_path = $13
       ${passwordClause}
     WHERE id = 1
     RETURNING id, active, host, port, database_path AS "databasePath",
               fb_user AS "fbUser", sql_query AS "sqlQuery",
               column_mapping AS "columnMapping",
               sync_interval_minutes AS "syncIntervalMinutes",
               last_sync_at AT TIME ZONE 'UTC' AS "lastSyncAt", last_sync_status AS "lastSyncStatus",
               last_sync_message AS "lastSyncMessage", last_sync_rows AS "lastSyncRows",
               nf_active AS "nfActive", nf_sql_query AS "nfSqlQuery",
               nf_column_mapping AS "nfColumnMapping", nf_base_path AS "nfBasePath",
               nf_local_path AS "nfLocalPath",
               nf_last_sync_at AT TIME ZONE 'UTC' AS "nfLastSyncAt",
               nf_last_sync_status AS "nfLastSyncStatus",
               nf_last_sync_message AS "nfLastSyncMessage",
               nf_last_sync_rows AS "nfLastSyncRows"`,
    params
  );

  return result.rows[0] || null;
}

async function isActive() {
  const result = await db.query(
    `SELECT active, host, database_path, fb_user,
            fb_password_encrypted, sql_query
     FROM sisplan_settings WHERE id = 1`
  );

  const row = result.rows[0];
  if (!row) return false;

  return (
    row.active === true &&
    !!row.host &&
    !!row.database_path &&
    !!row.fb_user &&
    !!row.fb_password_encrypted &&
    !!row.sql_query
  );
}

async function updateSyncStatus(status, message, rows) {
  await db.query(
    `UPDATE sisplan_settings SET
       last_sync_at = CURRENT_TIMESTAMP,
       last_sync_status = $1,
       last_sync_message = $2,
       last_sync_rows = $3
     WHERE id = 1`,
    [status, message, rows || 0]
  );
}

async function updateNfSyncStatus(status, message, rows) {
  await db.query(
    `UPDATE sisplan_settings SET
       nf_last_sync_at = CURRENT_TIMESTAMP,
       nf_last_sync_status = $1,
       nf_last_sync_message = $2,
       nf_last_sync_rows = $3
     WHERE id = 1`,
    [status, message, rows || 0]
  );
}

module.exports = {
  getSettings,
  updateSettings,
  isActive,
  updateSyncStatus,
  updateNfSyncStatus
};
