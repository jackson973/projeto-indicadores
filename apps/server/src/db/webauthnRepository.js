const db = require('./connection');

async function findByUserId(userId) {
  const { rows } = await db.query(
    'SELECT * FROM webauthn_credentials WHERE user_id = $1',
    [userId]
  );
  return rows;
}

async function findById(credentialId) {
  const { rows } = await db.query(
    'SELECT * FROM webauthn_credentials WHERE id = $1',
    [credentialId]
  );
  return rows[0] || null;
}

async function create({ id, userId, publicKey, counter, deviceType, backedUp, transports }) {
  await db.query(
    `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, device_type, backed_up, transports)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, publicKey, counter, deviceType, backedUp, transports || []]
  );
}

async function updateCounter(id, newCounter) {
  await db.query(
    'UPDATE webauthn_credentials SET counter = $1 WHERE id = $2',
    [newCounter, id]
  );
}

async function remove(id, userId) {
  const { rowCount } = await db.query(
    'DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rowCount > 0;
}

async function setChallenge(userId, challenge) {
  await db.query(
    'UPDATE users SET webauthn_challenge = $1 WHERE id = $2',
    [challenge, userId]
  );
}

async function getChallenge(userId) {
  const { rows } = await db.query(
    'UPDATE users SET webauthn_challenge = NULL WHERE id = $1 RETURNING webauthn_challenge',
    [userId]
  );
  return rows[0]?.webauthn_challenge || null;
}

module.exports = {
  findByUserId,
  findById,
  create,
  updateCounter,
  remove,
  setChallenge,
  getChallenge,
};
