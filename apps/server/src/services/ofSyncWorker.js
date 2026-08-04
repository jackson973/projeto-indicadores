// Worker isolado da sync de OFs (Sisplan → Postgres).
// Roda como processo filho para que a memória das 200k+ linhas seja devolvida
// integralmente ao sistema quando ele termina — o RSS da API não cresce.
const { runOfSyncInProcess } = require('./sisplanSyncService');
const db = require('../db/connection');

(async () => {
  let result;
  try {
    result = await runOfSyncInProcess();
  } catch (err) {
    result = { success: false, message: err.message || 'Erro desconhecido' };
  }

  try {
    if (process.send) process.send(result);
  } catch (_) { /* pai já saiu */ }

  try {
    await db.pool.end();
  } catch (_) { /* pool já fechado */ }

  process.exit(result && result.success ? 0 : 1);
})();
