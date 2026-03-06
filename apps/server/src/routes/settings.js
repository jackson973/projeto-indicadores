const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const db = require('../db/connection');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../../uploads');

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagem nao suportado. Use PNG, JPG, SVG ou WEBP.'));
    }
  }
});

// GET /api/settings - Get system settings (any authenticated user)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT logo_path AS "logoPath", company_name AS "companyName"
       FROM system_settings WHERE id = 1`
    );
    const settings = result.rows[0] || { logoPath: null, companyName: null };

    // Check if logo file exists
    if (settings.logoPath) {
      const fullPath = path.join(uploadsDir, settings.logoPath);
      if (!fs.existsSync(fullPath)) {
        settings.logoPath = null;
      }
    }

    return res.json(settings);
  } catch (error) {
    console.error('Get system settings error:', error);
    return res.status(500).json({ message: 'Erro ao buscar configuracoes.' });
  }
});

// PUT /api/settings - Update system settings (admin only)
router.put('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyName } = req.body;
    const result = await db.query(
      `UPDATE system_settings SET company_name = $1
       WHERE id = 1
       RETURNING logo_path AS "logoPath", company_name AS "companyName"`,
      [companyName || null]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Update system settings error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar configuracoes.' });
  }
});

// POST /api/settings/logo - Upload logo (admin only)
router.post('/logo', authenticate, requireAdmin, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo de logo nao enviado.' });
    }

    // Remove old logo files (different extension)
    const extensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    extensions.forEach(ext => {
      const oldFile = path.join(uploadsDir, `logo${ext}`);
      if (oldFile !== req.file.path && fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
      }
    });

    const logoFilename = req.file.filename;
    await db.query(
      'UPDATE system_settings SET logo_path = $1 WHERE id = 1',
      [logoFilename]
    );

    return res.json({ logoPath: logoFilename });
  } catch (error) {
    console.error('Upload logo error:', error);
    return res.status(500).json({ message: 'Erro ao enviar logo.' });
  }
});

// DELETE /api/settings/logo - Remove logo (admin only)
router.delete('/logo', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT logo_path FROM system_settings WHERE id = 1');
    const logoPath = result.rows[0]?.logo_path;

    if (logoPath) {
      const fullPath = path.join(uploadsDir, logoPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await db.query('UPDATE system_settings SET logo_path = NULL WHERE id = 1');
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete logo error:', error);
    return res.status(500).json({ message: 'Erro ao remover logo.' });
  }
});

module.exports = router;
