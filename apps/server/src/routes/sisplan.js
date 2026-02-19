const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const sisplanRepo = require('../db/sisplanRepository');
const {
  runSync,
  restartSisplanSyncScheduler,
  testFirebirdConnection,
  queryFirebird,
  getFirebirdOptions
} = require('../services/sisplanSyncService');
const { encrypt, decrypt } = require('../lib/encryption');

const router = express.Router();

router.use(authenticate, requireAdmin);

// GET /api/sisplan - Retorna configurações (senha mascarada)
router.get('/', async (req, res) => {
  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      ...settings,
      fbPassword: settings.fbPassword ? '********' : ''
    });
  } catch (error) {
    console.error('Get sisplan settings error:', error);
    return res.status(500).json({ message: 'Erro ao buscar configurações.' });
  }
});

// PUT /api/sisplan - Salvar configurações
router.put('/', async (req, res) => {
  try {
    const {
      active, host, port, databasePath, fbUser, fbPassword,
      sqlQuery, columnMapping, syncIntervalMinutes
    } = req.body;

    const result = await sisplanRepo.updateSettings({
      active: active || false,
      host: (host || '').trim(),
      port: port || 3050,
      databasePath: (databasePath || '').trim(),
      fbUser: (fbUser || '').trim(),
      fbPassword: fbPassword === '********' ? '' : (fbPassword || ''),
      sqlQuery: (sqlQuery || '').trim(),
      columnMapping: columnMapping || {},
      syncIntervalMinutes: syncIntervalMinutes || 5
    });

    // Reiniciar scheduler com novas configurações
    await restartSisplanSyncScheduler();

    return res.json(result);
  } catch (error) {
    console.error('Update sisplan settings error:', error);
    return res.status(500).json({ message: 'Erro ao salvar configurações.' });
  }
});

// POST /api/sisplan/test-connection - Testar conexão com Firebird
router.post('/test-connection', async (req, res) => {
  try {
    const { host, port, databasePath, fbUser, fbPassword } = req.body;

    if (!host || !databasePath || !fbUser || !fbPassword) {
      return res.status(400).json({ message: 'Preencha todos os campos de conexão.' });
    }

    // Se a senha está mascarada, buscar a senha real do banco
    let realPassword = fbPassword;
    if (fbPassword === '********') {
      const settings = await sisplanRepo.getSettings();
      realPassword = settings?.fbPassword || '';
    }

    const options = getFirebirdOptions({
      host, port: port || 3050, databasePath, fbUser, fbPassword: realPassword
    });

    await testFirebirdConnection(options);

    return res.json({ success: true, message: 'Conexão estabelecida com sucesso!' });
  } catch (error) {
    console.error('Test connection error:', error);
    return res.status(400).json({
      success: false,
      message: `Falha na conexão: ${error.message}`
    });
  }
});

// POST /api/sisplan/test-query - Testar query e retornar preview
router.post('/test-query', async (req, res) => {
  try {
    const { host, port, databasePath, fbUser, fbPassword, sqlQuery } = req.body;

    if (!host || !databasePath || !fbUser || !fbPassword) {
      return res.status(400).json({ message: 'Preencha todos os campos de conexão.' });
    }
    if (!sqlQuery) {
      return res.status(400).json({ message: 'Informe a query SQL.' });
    }

    let realPassword = fbPassword;
    if (fbPassword === '********') {
      const settings = await sisplanRepo.getSettings();
      realPassword = settings?.fbPassword || '';
    }

    const options = getFirebirdOptions({
      host, port: port || 3050, databasePath, fbUser, fbPassword: realPassword
    });

    // Adicionar FIRST 10 para limitar resultados no preview
    const previewQuery = sqlQuery.trim().replace(/^SELECT/i, 'SELECT FIRST 10');
    const rows = await queryFirebird(options, previewQuery);

    // Extrair nomes das colunas
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return res.json({
      success: true,
      columns,
      rows: rows,
      totalPreview: rows.length
    });
  } catch (error) {
    console.error('Test query error:', error);
    return res.status(400).json({
      success: false,
      message: `Erro na query: ${error.message}`
    });
  }
});

// POST /api/sisplan/sync - Sync manual
router.post('/sync', async (req, res) => {
  try {
    const result = await runSync();
    if (result.success) {
      return res.json(result);
    }
    return res.status(400).json(result);
  } catch (error) {
    console.error('Manual sync error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/sisplan/status - Status do último sync
router.get('/status', async (req, res) => {
  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      active: settings.active,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastSyncMessage: settings.lastSyncMessage,
      lastSyncRows: settings.lastSyncRows
    });
  } catch (error) {
    console.error('Sisplan status error:', error);
    return res.status(500).json({ message: 'Erro ao buscar status.' });
  }
});

module.exports = router;
