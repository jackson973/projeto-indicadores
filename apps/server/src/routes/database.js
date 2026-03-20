const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { spawn } = require('child_process');

// GET /api/database/schema - List all tables and their columns
router.get('/schema', async (_req, res) => {
  try {
    const tablesResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const columnsResult = await db.query(`
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const columnsByTable = {};
    for (const col of columnsResult.rows) {
      if (!columnsByTable[col.table_name]) {
        columnsByTable[col.table_name] = [];
      }

      let type = col.data_type;
      if (col.character_maximum_length) {
        type += `(${col.character_maximum_length})`;
      } else if (col.numeric_precision && col.data_type === 'numeric') {
        type += `(${col.numeric_precision},${col.numeric_scale})`;
      }

      columnsByTable[col.table_name].push({
        name: col.column_name,
        type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
      });
    }

    const tables = tablesResult.rows.map((t) => ({
      name: t.table_name,
      columns: columnsByTable[t.table_name] || [],
    }));

    return res.json({ tables });
  } catch (error) {
    console.error('Database schema error:', error);
    return res.status(500).json({ message: 'Erro ao buscar schema.' });
  }
});

// POST /api/database/query - Execute a SQL query
router.post('/query', async (req, res) => {
  const { sql } = req.body;

  if (!sql || !sql.trim()) {
    return res.status(400).json({ message: 'Query SQL não pode ser vazia.' });
  }

  const start = Date.now();

  try {
    const result = await db.query(sql);
    const duration = Date.now() - start;

    const fields = result.fields
      ? result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }))
      : [];

    return res.json({
      rows: result.rows || [],
      fields,
      rowCount: result.rowCount,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - start;
    return res.status(400).json({
      message: error.message,
      duration,
    });
  }
});

// GET /api/database/backup - Download a pg_dump of the database
router.get('/backup', (req, res) => {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'indicadores';
  const user = process.env.DB_USER || 'indicadores_user';
  const password = process.env.DB_PASSWORD || 'indicadores_pass';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${database}-${timestamp}.sql.gz`;

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const pgdump = spawn('pg_dump', [
    '-h', host,
    '-p', port,
    '-U', user,
    '-d', database,
    '--no-owner',
    '--no-acl',
  ], {
    env: { ...process.env, PGPASSWORD: password },
  });

  const gzip = spawn('gzip', ['-c']);

  pgdump.stdout.pipe(gzip.stdin);
  gzip.stdout.pipe(res);

  pgdump.stderr.on('data', (data) => {
    console.error('pg_dump stderr:', data.toString());
  });

  pgdump.on('error', (err) => {
    console.error('pg_dump error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'pg_dump não encontrado. Instale o postgresql-client.' });
    }
  });

  gzip.on('error', (err) => {
    console.error('gzip error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erro ao compactar backup.' });
    }
  });

  pgdump.on('close', (code) => {
    if (code !== 0) {
      console.error(`pg_dump exited with code ${code}`);
    }
  });
});

module.exports = router;
