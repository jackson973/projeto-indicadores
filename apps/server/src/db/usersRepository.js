const db = require('./connection');

async function findByEmail(email) {
  const result = await db.query(
    `SELECT id, name, email, password_hash AS "passwordHash", role, active, whatsapp,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await db.query(
    `SELECT id, name, email, role, active, whatsapp,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findAll() {
  const result = await db.query(
    `SELECT id, name, email, role, active, whatsapp,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users ORDER BY name`
  );
  return result.rows;
}

async function findByWhatsapp(phone) {
  const result = await db.query(
    `SELECT id, name, email, role, active, whatsapp,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE whatsapp = $1 AND active = true`,
    [phone]
  );
  return result.rows[0] || null;
}

async function create({ name, email, passwordHash, role = 'user', whatsapp }) {
  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role, whatsapp)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, active, whatsapp,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, email, passwordHash, role, whatsapp || null]
  );
  return result.rows[0];
}

async function update(id, { name, email, role, active, whatsapp }) {
  const result = await db.query(
    `UPDATE users SET name = $1, email = $2, role = $3, active = $4, whatsapp = $5
     WHERE id = $6
     RETURNING id, name, email, role, active, whatsapp,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, email, role, active, whatsapp || null, id]
  );
  return result.rows[0] || null;
}

async function updatePassword(id, passwordHash) {
  await db.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, id]
  );
}

async function setResetToken(id, tokenHash, expires) {
  await db.query(
    'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
    [tokenHash, expires, id]
  );
}

async function findByResetToken(tokenHash) {
  const result = await db.query(
    `SELECT id, name, email, role, active
     FROM users
     WHERE reset_token = $1 AND reset_token_expires > NOW()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function clearResetToken(id) {
  await db.query(
    'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1',
    [id]
  );
}

async function remove(id) {
  const result = await db.query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount > 0;
}

module.exports = {
  findByEmail,
  findById,
  findByWhatsapp,
  findAll,
  create,
  update,
  updatePassword,
  setResetToken,
  findByResetToken,
  clearResetToken,
  remove
};
