const Firebird = require('node-firebird');
const db = require('../db/connection');
const ordersRepo = require('../db/ordersRepository');
const sisplanRepo = require('../db/sisplanRepository');
const { getFirebirdOptions } = require('./sisplanSyncService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowBR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function buildPeriodo(date) {
  const yy = String(date.getFullYear()).slice(-2);
  const wk = String(getWeekNumber(date)).padStart(2, '0');
  return `${yy}${wk}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const br = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const yyyy = br.getFullYear();
  const mm = String(br.getMonth() + 1).padStart(2, '0');
  const dd = String(br.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const br = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const yyyy = br.getFullYear();
  const mm = String(br.getMonth() + 1).padStart(2, '0');
  const dd = String(br.getDate()).padStart(2, '0');
  const hh = String(br.getHours()).padStart(2, '0');
  const mi = String(br.getMinutes()).padStart(2, '0');
  const ss = String(br.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function escapeFirebird(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function formatPgto(paymentConditionErp) {
  if (!paymentConditionErp) return '';
  return paymentConditionErp.replace(/\//g, ' ').trim();
}

// ─── Firebird transaction helpers ─────────────────────────────────────────────

function firebirdAttach(options) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, fbDb) => {
      if (err) return reject(err);
      resolve(fbDb);
    });
  });
}

function firebirdTransaction(fbDb) {
  return new Promise((resolve, reject) => {
    fbDb.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, transaction) => {
      if (err) return reject(err);
      resolve(transaction);
    });
  });
}

function firebirdQuery(transaction, sql) {
  return new Promise((resolve, reject) => {
    transaction.query(sql, (err, result) => {
      if (err) return reject(err);
      resolve(result || []);
    });
  });
}

function firebirdCommit(transaction) {
  return new Promise((resolve, reject) => {
    transaction.commit((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function firebirdRollback(transaction) {
  return new Promise((resolve) => {
    transaction.rollback(() => resolve());
  });
}

function firebirdDetach(fbDb) {
  return new Promise((resolve) => {
    fbDb.detach(() => resolve());
  });
}

// ─── Build SQL statements ────────────────────────────────────────────────────

function buildGetProximo() {
  return `SELECT PROXIMO FROM CODIGOS_001 WHERE TABELA = 'PEDIDO' AND CAMPO = 'NUMERO'`;
}

function buildCheckCodigosValor(valorNum) {
  return `SELECT VALOR, LIVRE FROM CODIGOSVALOR_001 WHERE TABELA = 'PEDIDO' AND VALOR = ${valorNum}`;
}

function buildGetMaxIdCodigosValor() {
  return `SELECT MAX(ID) AS "max_id" FROM CODIGOSVALOR_001`;
}

function buildInsertCodigosValor(id, valorNum) {
  const now = formatDateTime(nowBR());
  return `INSERT INTO CODIGOSVALOR_001 (CAMPO, LIVRE, TABELA, TEMPO, VALOR, EMP_ID, ID) VALUES ('NUMERO', 1, 'PEDIDO', '${now}', ${valorNum}, 0, ${id})`;
}

function buildUpdateCodigosValorLivre(valorNum) {
  return `UPDATE CODIGOSVALOR_001 SET LIVRE = 1 WHERE TABELA = 'PEDIDO' AND VALOR = ${valorNum}`;
}

function buildUpdateCodSeq(proximoNum) {
  return `UPDATE CODIGOS_001 SET PROXIMO = ${proximoNum} WHERE TABELA = 'PEDIDO' AND CAMPO = 'NUMERO'`;
}

function formatNumero(num) {
  return String(num).padStart(5, '0');
}

// Busca número livre: CODIGOS_001.PROXIMO é o número a usar, verifica CODIGOSVALOR_001 em loop
async function findNextFreeNumber(transaction, log) {
  // Pegar PROXIMO da CODIGOS_001 (este É o número candidato, não soma 1)
  const rows = await firebirdQuery(transaction, buildGetProximo());
  if (!rows.length) throw new Error('Registro PEDIDO/NUMERO não encontrado em CODIGOS_001');
  let candidato = parseInt(rows[0].PROXIMO, 10);
  log.push(`[OK] CODIGOS_001.PROXIMO = ${candidato}`);

  // Buscar MAX(ID) da CODIGOSVALOR_001 para possível INSERT
  const maxRows = await firebirdQuery(transaction, buildGetMaxIdCodigosValor());
  let nextId = (maxRows[0]?.max_id || 0) + 1;

  // Loop: verificar se o número está livre na CODIGOSVALOR_001
  const MAX_ATTEMPTS = 50;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const check = await firebirdQuery(transaction, buildCheckCodigosValor(candidato));

    if (check.length === 0) {
      // Não existe → disponível, INSERT com LIVRE=1
      log.push(`[OK] Número ${candidato} disponível (não existe em CODIGOSVALOR_001)`);
      await firebirdQuery(transaction, buildInsertCodigosValor(nextId, candidato));
      log.push(`[OK] Número ${candidato} reservado em CODIGOSVALOR_001 (ID=${nextId}, LIVRE=1)`);
      return candidato;
    }

    if (check[0].LIVRE === 0 || check[0].LIVRE === '0') {
      // Existe com LIVRE=0 → disponível, UPDATE para LIVRE=1
      log.push(`[OK] Número ${candidato} disponível (LIVRE=0 em CODIGOSVALOR_001)`);
      await firebirdQuery(transaction, buildUpdateCodigosValorLivre(candidato));
      log.push(`[OK] Número ${candidato} reservado em CODIGOSVALOR_001 (LIVRE=1)`);
      return candidato;
    }

    // LIVRE=1 → em uso por outro usuário, incrementar
    log.push(`[--] Número ${candidato} em uso (LIVRE=1), tentando próximo...`);
    candidato++;
    nextId++;
  }

  throw new Error(`Não foi possível encontrar número livre após ${MAX_ATTEMPTS} tentativas`);
}

function buildInsertPedido(numero, order, user) {
  const now = nowBR();
  const entrega = addDays(now, 2);
  const periodo = buildPeriodo(now);
  const fatura = order.price_table === 'MN' ? '50' : '100';
  const pgto = formatPgto(order.payment_condition_erp || order.payment_condition || '');

  const fields = {
    numero:      escapeFirebird(numero),
    moeda:       escapeFirebird('0'),
    emp_fat:     escapeFirebird('001'),
    tela:        escapeFirebird('VenPedidoGrade'),
    tipo_venda:  escapeFirebird('A'),
    bonificacao: escapeFirebird('N'),
    bonif:       escapeFirebird('0'),
    tipo:        escapeFirebird('P'),
    bloqueio:    escapeFirebird('1'),
    financeiro:  escapeFirebird('1'),
    aba_itens:   escapeFirebird('1'),
    id_tipo:     '2',
    historico:   escapeFirebird(''),
    status:      escapeFirebird('20'),
    fatura:      escapeFirebird(fatura),
    comprador:   escapeFirebird('TUCKROBOT'),
    cif:         escapeFirebird('0'),
    redesp_cif:  escapeFirebird('1'),
    deposito:    escapeFirebird('0000'),
    frete:       escapeFirebird('0'),
    especie:     escapeFirebird(''),
    sit_dup:     escapeFirebird('00'),
    colecao:     escapeFirebird('00'),
    com1:        '0',
    com2:        '0',
    per_desc:    'NULL',
    desconto:    'NULL',
    ped_cli:     escapeFirebird(''),
    codcli:      escapeFirebird(order.customer_sisplan_id),
    codrep:      escapeFirebird(user.rep_code || ''),
    tab_pre:     escapeFirebird('999'),
    pgto:        escapeFirebird(pgto),
    obs:         escapeFirebird(order.notes || ''),
    dtdigita:    escapeFirebird(formatDate(order.created_at)),
    dt_emissao:  escapeFirebird(formatDate(order.created_at)),
    hr_emissao:  escapeFirebird(formatDateTime(order.updated_at || now)),
    entrega:     escapeFirebird(formatDate(entrega)),
    dt_fatura:   escapeFirebird(formatDate(entrega)),
    dt_saida:    escapeFirebird(formatDate(entrega)),
    periodo:     escapeFirebird(periodo),
    periodoprod: escapeFirebird(periodo),
  };

  const columns = Object.keys(fields).join(', ');
  const values = Object.values(fields).join(', ');
  return `INSERT INTO PEDIDO_001 (${columns}) VALUES (${values})`;
}

function buildInsertItem(numero, item, ordem) {
  const fields = {
    numero:    escapeFirebird(numero),
    codigo:    escapeFirebird(item.reference_codigo || ''),
    cor:       escapeFirebird('9'),
    tam:       escapeFirebird(item.size_name || ''),
    tipo:      escapeFirebird('P'),
    bonif:     escapeFirebird('0'),
    preco_orig: item.unit_price,
    preco:     item.unit_price,
    qtde_orig: item.qty,
    qtde:      item.qty,
    qtde_canc: '0',
    qtde_f:    '0',
    qualidade: '1',
    ordem:     ordem,
    ordem_dig: ordem,
  };

  const columns = Object.keys(fields).join(', ');
  const values = Object.values(fields).join(', ');
  return `INSERT INTO PED_ITEN_001 (${columns}) VALUES (${values})`;
}

// ─── Dry-run (log only) ──────────────────────────────────────────────────────

async function integrateOrderDryRun(orderId, userId) {
  const log = [];

  try {
    const { order, items, customer, user } = await loadOrderData(orderId, userId);

    log.push('='.repeat(60));
    log.push(`INTEGRAÇÃO PEDIDO #${orderId} → SISPLAN (DRY-RUN)`);
    log.push(`Data: ${formatDateTime(nowBR())}`);
    log.push(`Cliente: ${order.customer_snapshot?.fantasy_name || order.customer_snapshot?.company_name} (Sisplan: ${customer.sisplan_id})`);
    log.push(`Tabela de preço: ${order.price_table} | Fatura: ${order.price_table === 'MN' ? '50' : '100'}`);
    log.push('='.repeat(60));

    const numero = 'XXXXX';

    log.push('\n-- STEP 1: Buscar PROXIMO da CODIGOS_001');
    log.push(buildGetProximo() + ';');
    log.push('-- PROXIMO = N (este é o número candidato)');

    log.push('\n-- STEP 2: Verificar CODIGOSVALOR_001 (loop até achar livre)');
    log.push(`SELECT VALOR, LIVRE FROM CODIGOSVALOR_001 WHERE TABELA = 'PEDIDO' AND VALOR = N;`);
    log.push('-- Se não existe → INSERT com LIVRE=1');
    log.push('-- Se LIVRE=0 → UPDATE LIVRE=1');
    log.push('-- Se LIVRE=1 → N++ e verifica novamente');

    log.push('\n-- STEP 3: Reservar número em CODIGOSVALOR_001');
    log.push(`-- INSERT: INSERT INTO CODIGOSVALOR_001 (CAMPO, LIVRE, TABELA, TEMPO, VALOR, EMP_ID, ID) VALUES ('NUMERO', 1, 'PEDIDO', '{timestamp}', N, 0, {max_id+1});`);
    log.push(`-- OU UPDATE: UPDATE CODIGOSVALOR_001 SET LIVRE = 1 WHERE TABELA = 'PEDIDO' AND VALOR = N;`);

    log.push('\n-- STEP 4: Atualizar CODIGOS_001 (PROXIMO = N + 1)');
    log.push(`UPDATE CODIGOS_001 SET PROXIMO = N+1 WHERE TABELA = 'PEDIDO' AND CAMPO = 'NUMERO';`);

    log.push('\n-- STEP 5: Inserir cabeçalho do pedido');
    log.push(buildInsertPedido(numero, order, user) + ';');

    log.push(`\n-- STEP 6: Inserir itens do pedido (${items.length} itens)`);
    items.forEach((item, idx) => {
      const ordem = idx + 1;
      log.push(`-- Item ${ordem}: ${item.product_name} | Tam: ${item.size_name} | Qtd: ${item.qty} | Preço: ${item.unit_price}`);
      log.push(buildInsertItem(numero, item, ordem) + ';');
    });

    log.push('\n' + '='.repeat(60));
    log.push('FIM DA INTEGRAÇÃO (DRY-RUN)');
    log.push('='.repeat(60));

    const fullLog = log.join('\n');
    console.log(fullLog);
    return { success: true, dryRun: true, log: fullLog, orderId, itemCount: items.length };

  } catch (err) {
    console.error('[Sisplan Integration DryRun] Erro:', err.message);
    return { success: false, errors: [err.message], log: log.join('\n') };
  }
}

// ─── Execução real (Firebird transaction) ─────────────────────────────────────

async function integrateOrderExecute(orderId, userId) {
  const log = [];
  let fbDb = null;
  let transaction = null;

  try {
    const { order, items, customer, user } = await loadOrderData(orderId, userId);

    // Conectar ao Firebird
    const settings = await sisplanRepo.getSettings();
    if (!settings) throw new Error('Configurações do Sisplan não encontradas');
    const fbOptions = getFirebirdOptions(settings);

    log.push('='.repeat(60));
    log.push(`INTEGRAÇÃO PEDIDO #${orderId} → SISPLAN`);
    log.push(`Data: ${formatDateTime(nowBR())}`);
    log.push(`Cliente: ${order.customer_snapshot?.fantasy_name || order.customer_snapshot?.company_name} (Sisplan: ${customer.sisplan_id})`);
    log.push('='.repeat(60));

    fbDb = await firebirdAttach(fbOptions);
    transaction = await firebirdTransaction(fbDb);
    log.push('[OK] Conexão Firebird estabelecida, transaction iniciada');

    // Step 1-3: Buscar número livre (CODIGOS_001 + CODIGOSVALOR_001)
    const numeroInt = await findNextFreeNumber(transaction, log);
    const numero = formatNumero(numeroInt);

    // Step 4: UPDATE CODIGOS_001 — PROXIMO = numero usado + 1 (para o próximo)
    const proximoNovo = numeroInt + 1;
    await firebirdQuery(transaction, buildUpdateCodSeq(proximoNovo));
    log.push(`[OK] CODIGOS_001 atualizado (PROXIMO = ${proximoNovo})`);

    // Step 5: INSERT cabeçalho pedido
    const sqlInsert = buildInsertPedido(numero, order, user);
    await firebirdQuery(transaction, sqlInsert);
    log.push(`[OK] Cabeçalho do pedido ${numero} inserido em PEDIDO_001`);

    // Step 6: INSERT itens
    for (let idx = 0; idx < items.length; idx++) {
      const ordem = idx + 1;
      const sqlItem = buildInsertItem(numero, items[idx], ordem);
      await firebirdQuery(transaction, sqlItem);
      log.push(`[OK] Item ${ordem}: ${items[idx].product_name} | Tam: ${items[idx].size_name} | Qtd: ${items[idx].qty}`);
    }

    // COMMIT — tudo ok, grava no Firebird
    await firebirdCommit(transaction);
    transaction = null; // evita rollback no finally
    log.push(`[OK] COMMIT realizado com sucesso`);

    // Atualizar pedido no PostgreSQL com o número do Sisplan
    await ordersRepo.updateOrder(orderId, { sisplan_order_id: numero });
    log.push(`[OK] Pedido #${orderId} atualizado no PostgreSQL (sisplan_order_id: ${numero})`);

    log.push('\n' + '='.repeat(60));
    log.push('INTEGRAÇÃO CONCLUÍDA COM SUCESSO');
    log.push('='.repeat(60));

    const fullLog = log.join('\n');
    console.log(fullLog);
    return { success: true, dryRun: false, log: fullLog, orderId, numero, itemCount: items.length };

  } catch (err) {
    // ROLLBACK — algo falhou, desfaz tudo
    if (transaction) {
      await firebirdRollback(transaction);
      log.push(`[ROLLBACK] Transaction desfeita — nada foi gravado no Firebird`);
    }
    log.push(`[ERRO] ${err.message}`);

    const fullLog = log.join('\n');
    console.error(fullLog);
    return { success: false, errors: [err.message], log: fullLog };

  } finally {
    if (fbDb) await firebirdDetach(fbDb);
  }
}

// ─── Dados do pedido (compartilhado entre dry-run e execução) ────────────────

async function loadOrderData(orderId, userId) {
  const order = await ordersRepo.getOrderById(orderId);
  if (!order) throw new Error(`Pedido ${orderId} não encontrado`);
  if (order.status !== 'enviado' && order.status !== 'concluido') {
    throw new Error(`Pedido ${orderId} não está enviado/concluído (status: ${order.status})`);
  }
  if (order.sisplan_order_id) {
    throw new Error(`Pedido ${orderId} já foi integrado (Sisplan: ${order.sisplan_order_id})`);
  }

  const { rows: [customer] } = await db.query('SELECT sisplan_id FROM order_customers WHERE id = $1', [order.customer_id]);
  if (!customer) throw new Error(`Cliente do pedido não encontrado (customer_id: ${order.customer_id})`);
  order.customer_sisplan_id = customer.sisplan_id;

  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    if (item.catalog_product_id) {
      const { rows: [prod] } = await db.query('SELECT reference_codigo FROM order_catalog_products WHERE id = $1', [item.catalog_product_id]);
      item.reference_codigo = prod ? prod.reference_codigo : '';
    }
  }

  const { rows: [user] } = await db.query('SELECT rep_code FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error(`Usuário ${userId} não encontrado`);

  return { order, items, customer, user };
}

// ─── Verificação de vendas/pedidos deletados no Sisplan ──────────────────────

async function checkDeletedOrders() {
  let fbDb = null;

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.active) return;
    const fbOptions = getFirebirdOptions(settings);

    fbDb = await firebirdAttach(fbOptions);
    const transaction = await firebirdTransaction(fbDb);

    // Buscar todos os números de pedido que existem no Sisplan (Fabrica)
    const rows = await firebirdQuery(
      transaction,
      `SELECT NUMERO FROM PEDIDO_001`
    );
    await firebirdCommit(transaction);

    const sisplanNumeros = new Set(rows.map(r => (r.NUMERO || '').trim()));
    console.log(`[Sisplan Order Check] ${sisplanNumeros.size} pedidos encontrados no Sisplan`);

    let salesDeleted = 0;
    let ordersDeleted = 0;

    // 1. Verificar tabela sales (vendas Fabrica) — deletar registros órfãos
    const { rows: fabricaSales } = await db.query(
      `SELECT DISTINCT order_id FROM sales WHERE store = 'Fabrica'`
    );

    if (fabricaSales.length > 0) {
      const orphanSales = fabricaSales.filter(s => !sisplanNumeros.has(s.order_id.trim()));
      if (orphanSales.length > 0) {
        const orphanIds = orphanSales.map(s => s.order_id);
        const placeholders = orphanIds.map((_, i) => `$${i + 1}`).join(',');
        const { rowCount } = await db.query(
          `DELETE FROM sales WHERE store = 'Fabrica' AND order_id IN (${placeholders})`,
          orphanIds
        );
        salesDeleted = rowCount;
        console.log(`[Sisplan Order Check] ${rowCount} venda(s) Fabrica removida(s): ${orphanIds.join(', ')}`);
      }
    }

    // 2. Verificar tabela orders (pedidos B2B) — limpar sisplan_order_id
    const { rows: integrated } = await db.query(
      `SELECT id, sisplan_order_id FROM orders WHERE sisplan_order_id IS NOT NULL`
    );

    if (integrated.length > 0) {
      const orphanOrders = integrated.filter(o => !sisplanNumeros.has(o.sisplan_order_id.trim()));
      if (orphanOrders.length > 0) {
        for (const order of orphanOrders) {
          await db.query(
            `UPDATE orders SET sisplan_order_id = NULL, updated_at = NOW() WHERE id = $1`,
            [order.id]
          );
        }
        ordersDeleted = orphanOrders.length;
        console.log(`[Sisplan Order Check] ${orphanOrders.length} pedido(s) B2B desvinculado(s): ${orphanOrders.map(o => `#${o.id} (${o.sisplan_order_id})`).join(', ')}`);
      }
    }

    if (salesDeleted === 0 && ordersDeleted === 0) {
      console.log(`[Sisplan Order Check] ${fabricaSales.length} vendas Fabrica + ${integrated.length} pedidos B2B verificados, todos ok.`);
    }
  } catch (err) {
    console.error('[Sisplan Order Check] Erro:', err.message);
  } finally {
    if (fbDb) await firebirdDetach(fbDb);
  }
}

module.exports = {
  integrateOrderDryRun,
  integrateOrderExecute,
  checkDeletedOrders,
};
