const cron = require('node-cron');
const Firebird = require('node-firebird');
const { XdrReader, BlrReader } = require('node-firebird/lib/wire/serialize');
const db = require('../db/connection');
const sisplanRepo = require('../db/sisplanRepository');
const salesRepo = require('../db/salesRepository');
const notasFiscaisRepo = require('../db/notasFiscaisRepository');
const terceirosRepo = require('../db/terceirosRepository');

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
const SISPLAN_LOG = false; // set true to enable Sisplan sync logs
const slog = (...args) => SISPLAN_LOG && console.log(...args);
const serr = (...args) => SISPLAN_LOG && console.error(...args);

function resolveBlobValue(blobFn, transaction) {
  return new Promise((resolve, reject) => {
    const cb = (err, _name, eventEmitter) => {
      if (err) return reject(err);
      const chunks = [];
      eventEmitter.on('data', (chunk) => chunks.push(chunk));
      eventEmitter.on('end', () => {
        const buf = Buffer.concat(chunks);
        // Try UTF-8 first; if invalid sequences appear, fall back to latin1
        const utf8 = buf.toString('utf-8');
        resolve(utf8.includes('\uFFFD') ? buf.toString('latin1') : utf8);
      });
      eventEmitter.on('error', (e) => reject(e));
    };
    // Pass transaction to keep BLOB ID valid
    if (transaction) {
      blobFn(transaction, cb);
    } else {
      blobFn(cb);
    }
  });
}

async function resolveRowBlobs(row, transaction) {
  // Sem BLOBs na linha, devolve o próprio objeto — evita duplicar em memória
  // resultados grandes (a sync de OFs passa de 200 mil linhas).
  let hasBlob = false;
  for (const key in row) {
    if (typeof row[key] === 'function') { hasBlob = true; break; }
  }
  if (!hasBlob) return row;

  const resolved = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'function') {
      try {
        resolved[key] = await resolveBlobValue(value, transaction);
      } catch (err) {
        console.error(`[Firebird BLOB] Failed to read column "${key}":`, err.message);
        resolved[key] = null;
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function queryFirebird(options, sql) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) return reject(err);

      // Use explicit transaction to keep BLOB references valid during read
      db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, transaction) => {
        if (err) {
          db.detach();
          return reject(err);
        }

        transaction.query(sql, async (err, result) => {
          if (err) {
            transaction.rollback(() => db.detach());
            return reject(err);
          }

          try {
            const rows = result || [];
            for (let i = 0; i < rows.length; i++) {
              rows[i] = await resolveRowBlobs(rows[i], transaction);
            }
            transaction.commit(() => db.detach());
            resolve(rows);
          } catch (blobErr) {
            console.error('[Firebird BLOB] Error resolving blobs:', blobErr.message);
            transaction.rollback(() => db.detach());
            reject(blobErr);
          }
        });
      });
    });
  });
}

// Lê o resultado em streaming (linha a linha), sem materializar o array completo.
// Uso obrigatório para resultados grandes (ex.: OFs, 200k+ linhas). Campos BLOB
// não são suportados neste modo e chegam como null.
function queryFirebirdSequential(options, sql, onRow) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) return reject(err);

      let count = 0;
      let hookError = null;

      db.sequentially(sql, [], (row) => {
        if (hookError) return;
        count++;
        // BLOBs viriam como funções — anula para não vazar para o processamento
        for (const key in row) {
          if (typeof row[key] === 'function') row[key] = null;
        }
        try {
          onRow(row);
        } catch (e) {
          hookError = e;
        }
      }, (err) => {
        db.detach();
        if (err) return reject(err);
        if (hookError) return reject(hookError);
        resolve(count);
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
  slog('[Sisplan Sync] Starting sync...');

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.active) {
      slog('[Sisplan Sync] Integration not active, skipping.');
      return { success: false, message: 'Integração não ativa.' };
    }

    if (!settings.host || !settings.databasePath || !settings.fbUser || !settings.fbPassword || !settings.sqlQuery) {
      slog('[Sisplan Sync] Incomplete configuration, skipping.');
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

    slog('[Sisplan Sync] Connecting to Firebird...');
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
    serr('[Sisplan Sync] Error:', message);
    await sisplanRepo.updateSyncStatus('error', message, 0);
    return { success: false, message };
  }
}

function mapNfRow(row, columnMapping) {
  const fieldKeys = Object.keys(row);

  const getValue = (systemField) => {
    const sourceColumn = columnMapping[systemField];
    if (!sourceColumn) return null;
    const key = fieldKeys.find(k => k.toUpperCase() === sourceColumn.toUpperCase());
    if (key === undefined) return null;
    const val = row[key];
    return val !== null && val !== undefined ? val : null;
  };

  return {
    numeroNf: parseInt(getValue('numero_nf')) || 0,
    serie: parseInt(getValue('serie')) || 1,
    ordemId: getValue('ordem_id') ? String(getValue('ordem_id')).trim() : null,
    codcli: getValue('codcli') ? String(getValue('codcli')).trim() : null,
    nomeCliente: getValue('nome_cliente') ? String(getValue('nome_cliente')).trim() : null,
    nomeFantasia: getValue('nome_fantasia') ? String(getValue('nome_fantasia')).trim() : null,
    valor: parseFloat(getValue('valor')) || null,
    dataEmissao: getValue('data_emissao') || null,
    chaveAcesso: getValue('chave_acesso') ? String(getValue('chave_acesso')).trim() : null,
    cnpj: getValue('cnpj') ? String(getValue('cnpj')).trim() : null
  };
}

async function runNfSync() {
  slog('[Sisplan NF Sync] Starting NF sync...');

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.nfActive) {
      slog('[Sisplan NF Sync] NF integration not active, skipping.');
      return { success: false, message: 'Sincronizacao de NF nao ativa.' };
    }

    if (!settings.host || !settings.databasePath || !settings.fbUser || !settings.fbPassword || !settings.nfSqlQuery) {
      slog('[Sisplan NF Sync] Incomplete NF configuration, skipping.');
      await sisplanRepo.updateNfSyncStatus('error', 'Configuracao NF incompleta.', 0);
      return { success: false, message: 'Configuracao NF incompleta.' };
    }

    const fbOptions = {
      host: settings.host,
      port: settings.port || 3050,
      database: settings.databasePath,
      user: settings.fbUser,
      password: settings.fbPassword
    };

    slog('[Sisplan NF Sync] Connecting to Firebird...');
    const rows = await queryFirebird(fbOptions, settings.nfSqlQuery);

    console.log(`[Sisplan NF Sync] Query returned ${rows.length} rows`);

    if (!rows.length) {
      await sisplanRepo.updateNfSyncStatus('success', 'Nenhum registro encontrado.', 0);
      return { success: true, message: 'Nenhum registro encontrado.', rows: 0 };
    }

    const columnMapping = settings.nfColumnMapping || {};
    const mappedRows = rows.map(row => mapNfRow(row, columnMapping));

    const validRows = mappedRows.filter(r => r.numeroNf > 0 && r.dataEmissao);
    console.log(`[Sisplan NF Sync] ${validRows.length} valid rows after mapping`);

    const { inserted, updated } = await notasFiscaisRepo.batchUpsertNotas(validRows);

    const message = `Sincronizado: ${inserted} inseridos, ${updated} atualizados.`;
    console.log(`[Sisplan NF Sync] ${message}`);
    await sisplanRepo.updateNfSyncStatus('success', message, validRows.length);

    return { success: true, message, rows: validRows.length, inserted, updated };
  } catch (error) {
    const message = error.message || 'Erro desconhecido';
    serr('[Sisplan NF Sync] Error:', message);
    await sisplanRepo.updateNfSyncStatus('error', message, 0);
    return { success: false, message };
  }
}

function mapOfRow(row, columnMapping) {
  const fieldKeys = Object.keys(row);

  const getValue = (systemField) => {
    const sourceColumn = columnMapping[systemField];
    if (!sourceColumn) return null;
    const key = fieldKeys.find(k => k.toUpperCase() === sourceColumn.toUpperCase());
    if (key === undefined) return null;
    const val = row[key];
    return val !== null && val !== undefined ? val : null;
  };

  return {
    facNumero: getValue('fac_numero') ? String(getValue('fac_numero')).trim() : null,
    facLancto: getValue('fac_lancto') ? String(getValue('fac_lancto')).trim() : null,
    facDtS: getValue('fac_dt_s') || null,
    facDtLan: getValue('fac_dt_lan') || null,
    facDtPrevRet: getValue('fac_dt_prev_ret') || null,
    facCodsetor: getValue('fac_codsetor') ? String(getValue('fac_codsetor')).trim() : null,
    facDescsetor: getValue('fac_descsetor') ? String(getValue('fac_descsetor')).trim() : null,
    facQtOrig: parseFloat(getValue('fac_qt_orig')) || 0,
    facQuant: parseFloat(getValue('fac_quant')) || 0,
    facTam: getValue('fac_tam') ? String(getValue('fac_tam')).trim() : null,
    facCor: getValue('fac_cor') ? String(getValue('fac_cor')).trim() : null,
    facDesccor: getValue('fac_desccor') ? String(getValue('fac_desccor')).trim() : null,
    facParte: getValue('fac_parte') ? String(getValue('fac_parte')).trim() : null,
    facDescparte: getValue('fac_descparte') ? String(getValue('fac_descparte')).trim() : null,
    facCodigoProduto: getValue('fac_codigo_produto') ? String(getValue('fac_codigo_produto')).trim() : null,
    facDescProduto: getValue('fac_desc_produto') ? String(getValue('fac_desc_produto')).trim() : null,
    produtoUnidade: getValue('produto_unidade') ? String(getValue('produto_unidade')).trim() : null,
    facCodcli: getValue('fac_codcli') ? String(getValue('fac_codcli')).trim() : null,
    clienteNome: getValue('cliente_nome') ? String(getValue('cliente_nome')).trim() : null,
    dddFone: getValue('ddd_fone') ? String(getValue('ddd_fone')).trim() : null,
    clienteFone: getValue('cliente_fone') ? String(getValue('cliente_fone')).trim() : null,
    foneCompl: getValue('fone_compl') ? String(getValue('fone_compl')).trim() : null,
    clienteEndereco: getValue('cliente_endereco') ? String(getValue('cliente_endereco')).trim() : null,
    numEnd: getValue('num_end') ? String(getValue('num_end')).trim() : null,
    clienteBairro: getValue('cliente_bairro') ? String(getValue('cliente_bairro')).trim() : null,
    clienteCep: getValue('cliente_cep') ? String(getValue('cliente_cep')).trim() : null,
    clienteUf: getValue('cliente_uf') ? String(getValue('cliente_uf')).trim() : null,
    clienteCidade: getValue('cliente_cidade') ? String(getValue('cliente_cidade')).trim() : null,
    clienteComplemento: getValue('cliente_complemento') ? String(getValue('cliente_complemento')).trim() : null,
    clienteCnpj: getValue('cliente_cnpj') ? String(getValue('cliente_cnpj')).trim() : null,
    clienteInscricao: getValue('cliente_inscricao') ? String(getValue('cliente_inscricao')).trim() : null,
    clienteFantasia: getValue('cliente_fantasia') ? String(getValue('cliente_fantasia')).trim() : null,
    clienteFax: getValue('cliente_fax') ? String(getValue('cliente_fax')).trim() : null,
    facPeriodoOf: getValue('fac_periodo_of') ? String(getValue('fac_periodo_of')).trim() : null,
  };
}

let ofSyncRunning = false;

async function runOfSync() {
  slog('[Sisplan OF Sync] Starting OF sync...');

  // Trava: uma sync de OF por vez. Execuções em sequência (ciclo de 5 min +
  // botão manual) somam picos de memória antes de o V8 devolver ao sistema.
  if (ofSyncRunning) {
    console.log('[Sisplan OF Sync] Sync já em andamento — ignorando nova execução.');
    return { success: false, message: 'Sync de OFs já em andamento.' };
  }
  ofSyncRunning = true;

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.ofActive) {
      slog('[Sisplan OF Sync] OF integration not active, skipping.');
      return { success: false, message: 'Sincronizacao de OFs nao ativa.' };
    }

    if (!settings.host || !settings.databasePath || !settings.fbUser || !settings.fbPassword || !settings.ofSqlQuery) {
      slog('[Sisplan OF Sync] Incomplete OF configuration, skipping.');
      await sisplanRepo.updateOfSyncStatus('error', 'Configuracao OF incompleta.', 0);
      return { success: false, message: 'Configuracao OF incompleta.' };
    }

    const fbOptions = {
      host: settings.host,
      port: settings.port || 3050,
      database: settings.databasePath,
      user: settings.fbUser,
      password: settings.fbPassword
    };

    slog('[Sisplan OF Sync] Connecting to Firebird...');

    // Streaming: cada linha é mapeada e agregada no Map de itens únicos na hora,
    // sem nunca materializar as 200k+ linhas — memória proporcional só aos itens
    // únicos de OF, não ao total de movimentos.
    const columnMapping = settings.ofColumnMapping || {};
    const deduped = new Map();
    let validCount = 0;

    // Interning: campos como cliente, setor, cor e descrição repetem o mesmo texto
    // em milhares de linhas; guardar uma única referência por valor reduz muito a
    // memória do Map (quase todos os 200k+ movimentos viram itens únicos).
    const internCache = new Map();
    const intern = (v) => {
      if (typeof v !== 'string' || !v) return v;
      const cached = internCache.get(v);
      if (cached !== undefined) return cached;
      internCache.set(v, v);
      return v;
    };

    const totalRows = await queryFirebirdSequential(fbOptions, settings.ofSqlQuery, (row) => {
      const mapped = mapOfRow(row, columnMapping);
      if (!mapped.facNumero) return;
      for (const k in mapped) mapped[k] = intern(mapped[k]);
      validCount++;
      terceirosRepo.aggregateOfInto(deduped, mapped);
    });
    internCache.clear();

    console.log(`[Sisplan OF Sync] Streamed ${totalRows} rows, ${validCount} valid, ${deduped.size} unique OF items`);

    if (!totalRows) {
      await sisplanRepo.updateOfSyncStatus('success', 'Nenhum registro encontrado.', 0);
      return { success: true, message: 'Nenhum registro encontrado.', rows: 0 };
    }

    const { inserted, updated } = await terceirosRepo.upsertAggregatedOfs(deduped);
    deduped.clear();

    const rssMb = Math.round(process.memoryUsage().rss / 1048576);
    const message = `Sincronizado: ${inserted} inseridos, ${updated} atualizados.`;
    console.log(`[Sisplan OF Sync] ${message} (RSS: ${rssMb}MB)`);
    await sisplanRepo.updateOfSyncStatus('success', message, validCount);

    return { success: true, message, rows: validCount, inserted, updated };
  } catch (error) {
    const message = error.message || 'Erro desconhecido';
    serr('[Sisplan OF Sync] Error:', message);
    await sisplanRepo.updateOfSyncStatus('error', message, 0);
    return { success: false, message };
  } finally {
    ofSyncRunning = false;
  }
}

// ─── Sync de catálogo de produtos ────────────────────────────────────────────

function mapProductRow(row, columnMapping) {
  const fieldKeys = Object.keys(row);
  const getValue = (field) => {
    const col = columnMapping[field];
    if (!col) return '';
    const key = fieldKeys.find(k => k.toUpperCase() === col.toUpperCase());
    if (key === undefined) return '';
    const val = row[key];
    return val !== null && val !== undefined ? String(val).trim() : '';
  };

  const codigo  = getValue('codigo');
  const codCor  = getValue('cod_cor');
  const tamanho = getValue('tamanho');

  // SKU composto: codigo-codcor-tamanho (omite partes vazias)
  const sku = [codigo, codCor, tamanho].filter(Boolean).join('-');

  return {
    codigo,
    descricao: getValue('descricao'),
    codCor,
    descCor:  getValue('desc_cor'),
    tamanho,
    sku,
    ean: getValue('ean') || null,
  };
}

async function batchUpsertSisplanProducts(products) {
  let inserted = 0;
  let updated  = 0;

  for (const p of products) {
    if (!p.codigo || !p.sku) continue;
    const { rows } = await db.query(`
      INSERT INTO sisplan_products (codigo, descricao, cod_cor, desc_cor, tamanho, sku, ean, active, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      ON CONFLICT (sku) DO UPDATE SET
        codigo    = EXCLUDED.codigo,
        descricao = EXCLUDED.descricao,
        cod_cor   = EXCLUDED.cod_cor,
        desc_cor  = EXCLUDED.desc_cor,
        tamanho   = EXCLUDED.tamanho,
        ean       = EXCLUDED.ean,
        active    = true,
        synced_at = NOW()
      RETURNING (xmax = 0) AS is_insert
    `, [p.codigo, p.descricao || p.codigo, p.codCor || null, p.descCor || null, p.tamanho || null, p.sku, p.ean || null]);
    if (rows[0]?.is_insert) inserted++; else updated++;
  }
  return { inserted, updated };
}

async function runProductSync() {
  slog('[Sisplan Product Sync] Starting...');

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.productActive) {
      slog('[Sisplan Product Sync] Not active, skipping.');
      return { success: false, message: 'Sync de produtos não ativo.' };
    }

    if (!settings.host || !settings.databasePath || !settings.fbUser || !settings.fbPassword || !settings.productSqlQuery) {
      await sisplanRepo.updateProductSyncStatus('error', 'Configuração incompleta.', 0);
      return { success: false, message: 'Configuração incompleta.' };
    }

    const fbOptions = {
      host: settings.host,
      port: settings.port || 3050,
      database: settings.databasePath,
      user: settings.fbUser,
      password: settings.fbPassword
    };

    const rows = await queryFirebird(fbOptions, settings.productSqlQuery);
    console.log(`[Sisplan Product Sync] Query returned ${rows.length} rows`);

    if (!rows.length) {
      await sisplanRepo.updateProductSyncStatus('success', 'Nenhum produto encontrado.', 0);
      return { success: true, message: 'Nenhum produto encontrado.', rows: 0 };
    }

    const columnMapping = settings.productColumnMapping || {};
    const mapped  = rows.map(row => mapProductRow(row, columnMapping));
    const valid   = mapped.filter(r => r.codigo && r.sku);
    console.log(`[Sisplan Product Sync] ${valid.length} valid rows`);

    const { inserted, updated } = await batchUpsertSisplanProducts(valid);

    // Desativa SKUs que não vieram no sync (produto encerrado)
    const activeSKUs = valid.map(r => r.sku);
    if (activeSKUs.length > 0) {
      const { rowCount } = await db.query(`
        UPDATE sisplan_products SET active = false, synced_at = NOW()
        WHERE active = true AND sku NOT IN (SELECT UNNEST($1::text[]))
      `, [activeSKUs]);
      if (rowCount > 0) console.log(`[Sisplan Product Sync] ${rowCount} produtos desativados`);
    }

    const message = `Sincronizado: ${inserted} inseridos, ${updated} atualizados.`;
    console.log(`[Sisplan Product Sync] ${message}`);
    await sisplanRepo.updateProductSyncStatus('success', message, valid.length);

    return { success: true, message, rows: valid.length, inserted, updated };
  } catch (error) {
    const message = error.message || 'Erro desconhecido';
    serr('[Sisplan Product Sync] Error:', message);
    await sisplanRepo.updateProductSyncStatus('error', message, 0);
    return { success: false, message };
  }
}

async function startSisplanSyncScheduler() {
  slog('[Sisplan Sync] Initializing scheduler...');

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.active) {
      slog('[Sisplan Sync] Integration not active, scheduler not started.');
      return;
    }

    const interval = settings.syncIntervalMinutes || 5;
    const schedule = `*/${interval} * * * *`;

    const { syncOrdersFromERP } = require('./sisplanOrderIntegrationService');

    currentJob = cron.schedule(schedule, async () => {
      console.log('[Sisplan Sync] Iniciando ciclo de sincronização...');
      await runSync();
      await runNfSync();
      await runOfSync();
      await runProductSync();
      try {
        await syncOrdersFromERP();
      } catch (err) {
        console.error('[Sisplan Order Sync] Erro no scheduler:', err.message);
      }
      console.log('[Sisplan Sync] Ciclo de sincronização finalizado.');
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo',
    });

    console.log(`[Sisplan Sync] Scheduler started (every ${interval} minutes)`);
  } catch (error) {
    serr('[Sisplan Sync] Failed to start scheduler:', error.message);
  }
}

function stopSisplanSyncScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    slog('[Sisplan Sync] Scheduler stopped');
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
  runNfSync,
  runOfSync,
  runProductSync,
  testFirebirdConnection,
  queryFirebird,
  getFirebirdOptions,
  resolveRowBlobs
};
