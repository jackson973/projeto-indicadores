const fs = require('fs');
const path = require('path');
const db = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Detect which migrations were already applied manually (before this runner existed).
 * Checks for key artifacts of each migration to avoid re-running them.
 */
async function detectAppliedMigrations(client) {
  const checks = [
    { file: '001_create_sales_table.sql',           sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'sales'" },
    { file: '002_create_users_table.sql',            sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'users'" },
    { file: '003_create_cashflow_tables.sql',        sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'cashflow_entries'" },
    { file: '004_add_installment_to_recurrences.sql', sql: "SELECT 1 FROM information_schema.columns WHERE table_name = 'cashflow_recurrences' AND column_name = 'installment'" },
    { file: '005_add_cashflow_boxes.sql',            sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'cashflow_boxes'" },
    { file: '006_sisplan_integration.sql',           sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'sisplan_settings'" },
    { file: '007_add_whatsapp_to_users.sql',         sql: "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'whatsapp'" },
    { file: '008_create_whatsapp_settings.sql',      sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_settings'" },
    { file: '009_add_client_name_to_sales.sql',      sql: "SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'client_name'" },
    { file: '010_create_whatsapp_phones.sql',        sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_phones'" },
    { file: '011_upseller_integration.sql',          sql: "SELECT 1 FROM information_schema.tables WHERE table_name = 'upseller_settings'" },
  ];

  const alreadyApplied = [];
  for (const check of checks) {
    const { rows } = await client.query(check.sql);
    if (rows.length > 0) {
      alreadyApplied.push(check.file);
    }
  }
  return alreadyApplied;
}

/**
 * Auto-run pending SQL migrations on server startup.
 * Tracks applied migrations in a `schema_migrations` table.
 * Files must follow the naming convention: NNN_description.sql
 */
async function runMigrations() {
  const client = await db.getClient();
  try {
    // Check if this is the first time the runner is being used
    const { rows: tableCheck } = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'"
    );
    const isFirstRun = tableCheck.length === 0;

    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // On first run, detect migrations that were applied manually before this runner existed
    if (isFirstRun) {
      const alreadyApplied = await detectAppliedMigrations(client);
      if (alreadyApplied.length > 0) {
        console.log(`[Migrations] First run - detected ${alreadyApplied.length} previously applied migration(s)`);
        for (const file of alreadyApplied) {
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
          console.log(`[Migrations] Marked as applied: ${file}`);
        }
      }
    }

    // Get already-applied migrations
    const { rows: applied } = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    // Read migration files sorted by name
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[Migrations] Applying ${file}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        count++;
        console.log(`[Migrations] Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrations] Failed on ${file}:`, err.message);
        throw err;
      }
    }

    if (count === 0) {
      console.log('[Migrations] Database is up to date');
    } else {
      console.log(`[Migrations] Applied ${count} migration(s)`);
    }
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
