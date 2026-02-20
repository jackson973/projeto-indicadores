const cron = require('node-cron');
const Firebird = require('node-firebird');
const { XdrReader, BlrReader } = require('node-firebird/lib/wire/serialize');
const sisplanRepo = require('../db/sisplanRepository');
const salesRepo = require('../db/salesRepository');

// node-firebird exporta o objeto de constantes como Object.freeze(), então não é
// possível alterar DEFAULT_ENCODING. A solução é sobrescrever os métodos de leitura
// nos protótipos (que NÃO são frozen) para forçar encoding latin1.
// Isso corrige a leitura de bancos Firebird com charset WIN1252/ISO8859_1/NONE.
const originalXdrReadText = XdrReader.prototype.readText;
XdrReader.prototype.readText = function(len, _encoding) {
  return originalXdrReadText.call(this, len, 'latin1');
};

const originalXdrReadString = XdrReader.prototype.readString;
XdrReader.prototype.readString = function(_encoding) {
  return originalXdrReadString.call(this, 'latin1');
};

const originalBlrReadString = BlrReader.prototype.readString;
BlrReader.prototype.readString = function(_encoding) {
  return originalBlrReadString.call(this, 'latin1');
};

let currentJob = null;

function queryFirebird(options, sql) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) return reject(err);

      db.query(sql, (err, result) => {
        db.detach();
        if (err) return reject(err);
        resolve(result || []);
      });
    });
  });
}

function testFirebirdConnection(options) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) return reject(err);

      db.query('SELECT 1 FROM RDB$DATABASE', (err, result) => {
        db.detach();
        if (err) return reject(err);
        resolve(true);
      });
    });
  });
}

function mapRow(row, columnMapping) {
  const fieldKeys = Object.keys(row);

  const getValue = (systemField) => {
    const sourceColumn = columnMapping[systemField];
    if (!sourceColumn) return '';

    // Firebird retorna colunas em uppercase, tentar match case-insensitive
    const key = fieldKeys.find(k => k.toUpperCase() === sourceColumn.toUpperCase());
    if (key === undefined) return '';

    const val = row[key];
    return val !== null && val !== undefined ? val : '';
  };

  const total = parseFloat(getValue('total')) || 0;
  const quantity = parseFloat(getValue('quantity')) || 1;
  const unitPrice = parseFloat(getValue('unit_price')) || (total > 0 && quantity ? total / quantity : 0);

  return {
    orderId: String(getValue('order_id') || '').trim(),
    date: getValue('date') || new Date(),
    store: 'Fabrica',
    product: String(getValue('product') || 'Geral').trim(),
    adName: String(getValue('ad_name') || getValue('product') || 'Geral').trim(),
    variation: String(getValue('variation') || '').trim(),
    sku: String(getValue('sku') || '').trim(),
    quantity,
    total,
    unitPrice,
    state: String(getValue('state') || '').trim() || 'Não informado',
    platform: 'Sisplan',
    status: String(getValue('status') || '').trim(),
    cancelBy: String(getValue('cancel_by') || '').trim(),
    cancelReason: String(getValue('cancel_reason') || '').trim(),
    image: String(getValue('image') || '').trim(),
    clientName: String(getValue('client_name') || '').trim(),
    codcli: String(getValue('codcli') || '').trim(),
    nomeFantasia: String(getValue('nome_fantasia') || '').trim(),
    cnpjCpf: String(getValue('cnpj_cpf') || '').trim()
  };
}

async function runSync() {
  console.log('[Sisplan Sync] Starting sync...');

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.active) {
      console.log('[Sisplan Sync] Integration not active, skipping.');
      return { success: false, message: 'Integração não ativa.' };
    }

    if (!settings.host || !settings.databasePath || !settings.fbUser || !settings.fbPassword || !settings.sqlQuery) {
      console.log('[Sisplan Sync] Incomplete configuration, skipping.');
      await sisplanRepo.updateSyncStatus('error', 'Configuração incompleta.', 0);
      return { success: false, message: 'Configuração incompleta.' };
    }

    const fbOptions = {
      host: settings.host,
      port: settings.port || 3050,
      database: settings.databasePath,
      user: settings.fbUser,
      password: settings.fbPassword
    };

    console.log('[Sisplan Sync] Connecting to Firebird...');
    const rows = await queryFirebird(fbOptions, settings.sqlQuery);

    console.log(`[Sisplan Sync] Query returned ${rows.length} rows`);

    if (!rows.length) {
      await sisplanRepo.updateSyncStatus('success', 'Nenhum registro encontrado.', 0);
      return { success: true, message: 'Nenhum registro encontrado.', rows: 0 };
    }

    const columnMapping = settings.columnMapping || {};
    const mappedRows = rows.map(row => mapRow(row, columnMapping));

    // Filtrar linhas sem data ou total válido
    const validRows = mappedRows.filter(r => r.date && r.total > 0);
    console.log(`[Sisplan Sync] ${validRows.length} valid rows after mapping`);

    const { inserted, updated } = await salesRepo.batchUpsertSales(validRows, 'atacado');

    const message = `Sincronizado: ${inserted} inseridos, ${updated} atualizados.`;
    console.log(`[Sisplan Sync] ${message}`);
    await sisplanRepo.updateSyncStatus('success', message, validRows.length);

    return { success: true, message, rows: validRows.length, inserted, updated };
  } catch (error) {
    const message = error.message || 'Erro desconhecido';
    console.error('[Sisplan Sync] Error:', message);
    await sisplanRepo.updateSyncStatus('error', message, 0);
    return { success: false, message };
  }
}

async function startSisplanSyncScheduler() {
  console.log('[Sisplan Sync] Initializing scheduler...');

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.active) {
      console.log('[Sisplan Sync] Integration not active, scheduler not started.');
      return;
    }

    const interval = settings.syncIntervalMinutes || 5;
    const schedule = `*/${interval} * * * *`;

    currentJob = cron.schedule(schedule, async () => {
      await runSync();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    console.log(`[Sisplan Sync] Scheduler started (every ${interval} minutes)`);
  } catch (error) {
    console.error('[Sisplan Sync] Failed to start scheduler:', error.message);
  }
}

function stopSisplanSyncScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    console.log('[Sisplan Sync] Scheduler stopped');
  }
}

async function restartSisplanSyncScheduler() {
  stopSisplanSyncScheduler();
  await startSisplanSyncScheduler();
}

function getFirebirdOptions(settings) {
  return {
    host: settings.host,
    port: settings.port || 3050,
    database: settings.databasePath,
    user: settings.fbUser,
    password: settings.fbPassword
  };
}

module.exports = {
  startSisplanSyncScheduler,
  stopSisplanSyncScheduler,
  restartSisplanSyncScheduler,
  runSync,
  testFirebirdConnection,
  queryFirebird,
  getFirebirdOptions
};
