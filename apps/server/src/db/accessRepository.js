const db = require('./connection');

// Registro de módulos (fonte da verdade das telas existentes)
const MODULES = [
  { key: 'dashboard',           label: 'Dashboard Vendas' },
  { key: 'financeiro',          label: 'Financeiro' },
  { key: 'financial-dashboard', label: 'Dashboard Financeiro' },
  { key: 'produtos',            label: 'Produtos' },
  { key: 'pedidos',             label: 'Pedidos' },
  { key: 'estoque',             label: 'Estoque' },
  { key: 'terceiros',           label: 'Terceiros' },
  { key: 'lojas',               label: 'Lojas' },
  { key: 'validador',           label: 'Validador de Pedidos' },
  { key: 'custo-preco',         label: 'Análise de Custo e Preço' },
  { key: 'configuracoes',       label: 'Configurações' },
];

function listModules() { return MODULES; }

async function listProfiles() {
  const { rows } = await db.query(
    `SELECT ap.*, COALESCE(json_agg(m.module_key) FILTER (WHERE m.module_key IS NOT NULL), '[]') AS modules,
            (SELECT COUNT(*) FROM users u WHERE u.profile_id = ap.id) AS user_count
       FROM access_profiles ap
       LEFT JOIN access_profile_modules m ON m.profile_id = ap.id
      GROUP BY ap.id ORDER BY ap.name`
  );
  return rows;
}

async function createProfile({ name, is_admin = false, modules = [] }) {
  if (!name || !name.trim()) throw new Error('Informe o nome do perfil');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO access_profiles (name, is_admin) VALUES ($1,$2) RETURNING *', [name.trim(), !!is_admin]);
    const p = rows[0];
    if (!is_admin) for (const k of modules) await client.query('INSERT INTO access_profile_modules (profile_id, module_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [p.id, k]);
    await client.query('COMMIT');
    return p;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function updateProfile(id, { name, is_admin, modules }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE access_profiles SET name=COALESCE($2,name), is_admin=COALESCE($3,is_admin) WHERE id=$1', [id, name ?? null, is_admin ?? null]);
    if (Array.isArray(modules)) {
      await client.query('DELETE FROM access_profile_modules WHERE profile_id=$1', [id]);
      for (const k of modules) await client.query('INSERT INTO access_profile_modules (profile_id, module_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, k]);
    }
    await client.query('COMMIT');
    return { id };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function deleteProfile(id) {
  await db.query('UPDATE users SET profile_id=NULL WHERE profile_id=$1', [id]);
  await db.query('DELETE FROM access_profiles WHERE id=$1', [id]);
}

async function assignUserProfile(userId, profileId) {
  await db.query('UPDATE users SET profile_id=$2 WHERE id=$1', [userId, profileId || null]);
  return { ok: true };
}

// Módulos permitidos ao usuário — 100% pelo PERFIL. { all:true } = acesso total (perfil is_admin).
// Mantém fallback pro role legado 'admin' para não trancar admins antigos antes do backfill.
async function getUserModules(userId, role) {
  if (role === 'admin') return { all: true };
  const { rows } = await db.query(
    `SELECT u.profile_id, ap.is_admin FROM users u LEFT JOIN access_profiles ap ON ap.id=u.profile_id WHERE u.id=$1`,
    [userId]
  );
  const u = rows[0];
  if (u && u.is_admin) return { all: true };
  if (!u || !u.profile_id) return { all: false, modules: [] };   // sem perfil → sem acesso (defina um perfil)
  const { rows: mods } = await db.query('SELECT module_key FROM access_profile_modules WHERE profile_id=$1', [u.profile_id]);
  return { all: false, modules: mods.map(m => m.module_key) };
}

module.exports = { MODULES, listModules, listProfiles, createProfile, updateProfile, deleteProfile, assignUserProfile, getUserModules };
