const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upsellerRepo = require('../db/upsellerRepository');
const {
  runSync,
  restartUpsellerSyncScheduler,
} = require('../services/upsellerSyncService');

const router = express.Router();

router.use(authenticate, requireAdmin);

// GET /api/upseller - Retorna configurações (senhas mascaradas)
router.get('/', async (req, res) => {
  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      ...settings,
      upsellerPassword: settings.upsellerPassword ? '********' : '',
      anticaptchaKey: settings.anticaptchaKey ? '********' : '',
      imapPass: settings.imapPass ? '********' : '',
      sessionCookies: undefined,
      sessionSavedAt: undefined,
    });
  } catch (error) {
    console.error('Get upseller settings error:', error);
    return res.status(500).json({ message: 'Erro ao buscar configurações.' });
  }
});

// PUT /api/upseller - Salvar configurações
router.put('/', async (req, res) => {
  try {
    const {
      active, upsellerEmail, upsellerPassword, upsellerUrl,
      anticaptchaKey, imapHost, imapPort, imapUser, imapPass,
      syncIntervalMinutes, defaultDays
    } = req.body;

    const result = await upsellerRepo.updateSettings({
      active: active || false,
      upsellerEmail: (upsellerEmail || '').trim(),
      upsellerPassword: upsellerPassword === '********' ? '' : (upsellerPassword || ''),
      upsellerUrl: (upsellerUrl || '').trim(),
      anticaptchaKey: anticaptchaKey === '********' ? '' : (anticaptchaKey || ''),
      imapHost: (imapHost || '').trim(),
      imapPort: imapPort || 993,
      imapUser: (imapUser || '').trim(),
      imapPass: imapPass === '********' ? '' : (imapPass || ''),
      syncIntervalMinutes: syncIntervalMinutes || 60,
      defaultDays: defaultDays || 90,
    });

    await restartUpsellerSyncScheduler();

    return res.json(result);
  } catch (error) {
    console.error('Update upseller settings error:', error);
    return res.status(500).json({ message: 'Erro ao salvar configurações.' });
  }
});

// POST /api/upseller/sync - Sync manual
router.post('/sync', async (req, res) => {
  try {
    const result = await runSync();
    if (result.success) {
      return res.json(result);
    }
    return res.status(400).json(result);
  } catch (error) {
    console.error('Manual upseller sync error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/upseller/status - Status do último sync
router.get('/status', async (req, res) => {
  try {
    const settings = await upsellerRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      active: settings.active,
      lastSyncAt: settings.lastSyncAt,
      lastSyncStatus: settings.lastSyncStatus,
      lastSyncMessage: settings.lastSyncMessage,
      lastSyncRows: settings.lastSyncRows,
    });
  } catch (error) {
    console.error('Upseller status error:', error);
    return res.status(500).json({ message: 'Erro ao buscar status.' });
  }
});

module.exports = router;
