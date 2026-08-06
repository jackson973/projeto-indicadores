// Worker genérico de sincronização — roda a tarefa recebida em argv[2] e morre,
// devolvendo toda a memória ao sistema. Disparado por syncWorkerRunner.runInWorker.
const db = require('../db/connection');

const TASKS = {
  'sisplan-sales':    () => require('./sisplanSyncService').runSyncInProcess(),
  'sisplan-nf':       () => require('./sisplanSyncService').runNfSyncInProcess(),
  'sisplan-of':       () => require('./sisplanSyncService').runOfSyncInProcess(),
  'sisplan-products': () => require('./sisplanSyncService').runProductSyncInProcess(),
  'sisplan-cycle': async () => {
    const sisplan = require('./sisplanSyncService');
    console.log('[Sisplan Sync] Iniciando ciclo de sincronização...');
    await sisplan.runSyncInProcess();
    await sisplan.runNfSyncInProcess();
    await sisplan.runOfSyncInProcess();
    await sisplan.runProductSyncInProcess();
    try {
      await require('./sisplanOrderIntegrationService').syncOrdersFromERP();
    } catch (err) {
      console.error('[Sisplan Order Sync] Erro no ciclo:', err.message);
    }
    console.log('[Sisplan Sync] Ciclo de sincronização finalizado.');
    return { success: true, message: 'Ciclo de sincronização concluído.' };
  },
  'upseller-sync': () => require('./upsellerSyncService').runSyncInProcess(),
};

const task = process.argv[2];

(async () => {
  let result;
  try {
    const fn = TASKS[task];
    if (!fn) throw new Error(`Tarefa desconhecida: "${task}"`);
    result = await fn();
  } catch (err) {
    result = { success: false, message: err.message || 'Erro desconhecido' };
  }

  try {
    if (process.send) process.send(result || { success: true });
  } catch (_) { /* pai já saiu */ }

  try {
    await db.pool.end();
  } catch (_) { /* pool já fechado */ }

  process.exit(0);
})();
