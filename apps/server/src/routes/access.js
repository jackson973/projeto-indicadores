const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const repo = require('../db/accessRepository');

const router = express.Router();
router.use(authenticate);

// Módulos permitidos ao usuário logado (para filtrar o menu no client)
router.get('/my-modules', async (req, res) => {
  try { res.json(await repo.getUserModules(req.user.id, req.user.role)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Registro de módulos existentes
router.get('/modules', requireAdmin, (req, res) => res.json(repo.listModules()));

// Perfis
router.get('/profiles', requireAdmin, async (req, res) => {
  try { res.json(await repo.listProfiles()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/profiles', requireAdmin, async (req, res) => {
  try { res.json(await repo.createProfile(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.put('/profiles/:id', requireAdmin, async (req, res) => {
  try { res.json(await repo.updateProfile(req.params.id, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/profiles/:id', requireAdmin, async (req, res) => {
  try { await repo.deleteProfile(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Atribuir perfil a usuário
router.put('/users/:id/profile', requireAdmin, async (req, res) => {
  try { res.json(await repo.assignUserProfile(req.params.id, req.body.profile_id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
