const jwt = require('jsonwebtoken');
const db = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token não fornecido.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
};

// Acesso total agora vem do PERFIL (access_profiles.is_admin). Mantém fallback pro
// role legado 'admin' para não trancar usuários antigos antes do backfill de perfis.
const requireAdmin = async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') return next();
    const { rows } = await db.query(
      `SELECT ap.is_admin FROM users u LEFT JOIN access_profiles ap ON ap.id = u.profile_id WHERE u.id = $1`,
      [req.user.id]
    );
    if (rows[0]?.is_admin) return next();
    return res.status(403).json({ message: 'Acesso restrito.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// Exige acesso a um MÓDULO específico (via perfil). Acesso total (is_admin) ou role legado 'admin' passam.
const requireModule = (moduleKey) => async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') return next(); // fallback legado
    const { rows } = await db.query(
      `SELECT ap.is_admin,
              EXISTS(SELECT 1 FROM access_profile_modules m WHERE m.profile_id = u.profile_id AND m.module_key = $2) AS has_mod
         FROM users u LEFT JOIN access_profiles ap ON ap.id = u.profile_id
        WHERE u.id = $1`,
      [req.user.id, moduleKey]
    );
    if (rows[0]?.is_admin || rows[0]?.has_mod) return next();
    return res.status(403).json({ message: 'Sem acesso a este módulo.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

module.exports = { authenticate, requireAdmin, requireModule, generateToken };
