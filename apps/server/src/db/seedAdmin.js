const bcrypt = require('bcrypt');
const db = require('./connection');

const SALT_ROUNDS = 10;

async function seedAdmin() {
  try {
    const result = await db.query('SELECT EXISTS(SELECT 1 FROM users LIMIT 1) AS exists');
    if (result.rows[0].exists) {
      return;
    }

    const passwordHash = await bcrypt.hash('admin', SALT_ROUNDS);
    await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ['Administrador', 'admin@admin.com', passwordHash, 'admin']
    );
    console.log('Admin user seeded: admin@admin.com / admin');
  } catch (error) {
    console.error('Admin seed skipped:', error.message);
  }
}

seedAdmin();

module.exports = seedAdmin;
