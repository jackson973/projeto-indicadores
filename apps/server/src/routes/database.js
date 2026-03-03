const express = require('express');
const router = express.Router();
const db = require('../db/connection');

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

module.exports = router;
