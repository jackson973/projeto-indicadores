const Firebird = require('node-firebird');
const db = require('../db/connection');
const ordersRepo = require('../db/ordersRepository');
const sisplanRepo = require('../db/sisplanRepository');
const { getFirebirdOptions, resolveRowBlobs } = require('./sisplanSyncService');

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
  const fatura = order.price_table === 'SN' ? '100' : order.price_table === 'MN' ? '50' : null;
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
    status:      escapeFirebird('23'),
    operacao:    '1',
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
    log.push(`Tabela de preço: ${order.price_table} | Fatura: ${order.price_table === 'SN' ? '100' : order.price_table === 'MN' ? '50' : 'NULL'}`);
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

  const { rows: [currentUser] } = await db.query('SELECT rep_code FROM users WHERE id = $1', [userId]);
  if (!currentUser) throw new Error(`Usuário ${userId} não encontrado`);

  let creatorRepCode = null;
  if (order.created_by) {
    const { rows: [creator] } = await db.query('SELECT rep_code FROM users WHERE id = $1', [order.created_by]);
    creatorRepCode = creator?.rep_code || null;
  }

  const repCode = creatorRepCode || currentUser.rep_code || null;
  if (!repCode) {
    throw new Error('Nenhum rep_code disponível: configure o código de representante no usuário que criou o pedido ou no usuário atual (cadastro de usuários)');
  }

  const user = { rep_code: repCode };
  return { order, items, customer, user };
}

// ─── Sync reversa: ERP → App (itens + header + detecção de deletados) ───────

function toStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'function') return ''; // unresolved Firebird BLOB callback
  if (typeof val === 'string') return val.trim();
  if (Buffer.isBuffer(val)) return val.toString('utf-8').trim();
  return String(val).trim();
}

function buildErpOrderItemsQuery(numeros) {
  const inList = numeros.map(n => `'${n}'`).join(',');
  return `
    SELECT
      itens.COR AS "idColor",
      itens.TAM AS "tam",
      cor.DESCRICAO AS "colorName",
      itens.NUMERO AS "order_id",
      pedidos.HR_EMISSAO AS "date",
      produto.descricao AS "product",
      (itens.QTDE + itens.QTDE_F) - itens.QTDE_CANC AS "quantity",
      itens.PRECO AS "unit_price",
      CAST(UDF_NVL((itens.QTDE + itens.QTDE_F) * CAST(itens.PRECO AS NUMERIC(14,2))) AS NUMERIC(7,2)) AS "total",
      produto.codigo AS "sku",
      produto.codigo||'-'||cor.DESCRICAO||'-'||itens.tam AS "variation",
      (SELECT scid.COD_UF FROM CADCEP_001 scep INNER JOIN CIDADE scid ON scid.CODIGO = scep.CODMUN WHERE cliente.CEP = scep.CEP) AS "state",
      '--' AS "status",
      produto.descricao AS "ad_name",
      '' AS "image",
      cliente.FANTASIA AS "nome_fantasia",
      cliente.nome AS "clientName",
      cliente.codcli AS "codcli",
      cliente.cnpj AS "cnpj",
      (SELECT p2.OBS FROM PEDIDO_001 p2 WHERE p2.NUMERO = pedidos.NUMERO) AS "obs",
      pedidos.PGTO AS "pgto",
      pedidos.CODREP AS "codrep"
    FROM PED_ITEN_001 itens
    INNER JOIN PEDIDO_001 pedidos ON pedidos.NUMERO = itens.NUMERO
    INNER JOIN PA_ITEN_001 pi ON pi.CODIGO = itens.CODIGO AND pi.COR = itens.COR AND pi.TAM = itens.TAM
    INNER JOIN PRODUTO_001 produto ON produto.CODIGO = itens.codigo
    INNER JOIN ENTIDADE_001 cliente ON cliente.codcli = pedidos.codcli
    INNER JOIN CADCOR_001 cor ON cor.COR = pi.COR
    WHERE pedidos.NUMERO IN (${inList})
    GROUP BY
      itens.NUMERO, pedidos.NUMERO, pedidos.HR_EMISSAO,
      produto.codigo, produto.DESCRICAO, cliente.cep,
      pi.cor, cor.DESCRICAO, itens.CODIGO, itens.TAM,
      itens.PRECO_ORIG, itens.PRECO, itens.COR,
      pedidos.DESC_ITEN_TOTAL, pedidos.PER_DESC, pedidos.COM1,
      itens.QTDE, itens.QTDE_F, itens.QTDE_CANC,
      cliente.FANTASIA, cliente.nome, cliente.codcli, cliente.cnpj,
      pedidos.PGTO, pedidos.CODREP
  `;
}

async function syncOrdersFromERP() {
  let fbDb = null;

  try {
    const settings = await sisplanRepo.getSettings();
    if (!settings || !settings.active) return;
    const fbOptions = getFirebirdOptions(settings);

    // 1. Buscar pedidos integrados no app (exceto deletado_erp e cancelado)
    const { rows: integrated } = await db.query(
      `SELECT id, sisplan_order_id, customer_id, notes, payment_condition_erp
       FROM orders
       WHERE sisplan_order_id IS NOT NULL
         AND status NOT IN ('deletado_erp', 'cancelado')`
    );

    if (integrated.length === 0) {
      console.log('[Sisplan Order Sync] Nenhum pedido integrado para sincronizar.');
      return;
    }

    const orderMap = {};
    for (const o of integrated) {
      orderMap[o.sisplan_order_id.trim()] = o;
    }
    const numeros = Object.keys(orderMap);

    console.log(`[Sisplan Order Sync] Sincronizando ${numeros.length} pedido(s)...`);

    // 2. Conectar ao Firebird e buscar dados
    fbDb = await firebirdAttach(fbOptions);
    const transaction = await firebirdTransaction(fbDb);

    // 2a. Buscar quais números existem no Sisplan (pra detectar deletados)
    const existRows = await firebirdQuery(
      transaction,
      `SELECT NUMERO FROM PEDIDO_001`
    );
    const sisplanNumeros = new Set(existRows.map(r => (r.NUMERO || '').trim()));

    // 2b. Buscar itens dos pedidos que existem
    const numerosExistentes = numeros.filter(n => sisplanNumeros.has(n));
    let erpItems = [];
    if (numerosExistentes.length > 0) {
      const rawItems = await firebirdQuery(
        transaction,
        buildErpOrderItemsQuery(numerosExistentes)
      );
      // Resolver BLOBs (ex: OBS) antes de fechar transação
      for (const row of rawItems) {
        erpItems.push(await resolveRowBlobs(row, transaction));
      }
    }

    await firebirdCommit(transaction);

    // Fechar Firebird antes de processar PostgreSQL
    await firebirdDetach(fbDb);
    fbDb = null;

    // 3. Agrupar itens por número do pedido
    const itemsByOrder = {};
    for (const row of erpItems) {
      const numero = toStr(row.order_id);
      if (!itemsByOrder[numero]) itemsByOrder[numero] = { items: [], header: null };
      itemsByOrder[numero].items.push(row);
      // Header é o mesmo pra todos os itens do pedido
      if (!itemsByOrder[numero].header) {
        itemsByOrder[numero].header = {
          nome_fantasia: toStr(row.nome_fantasia),
          clientName: toStr(row.clientName),
          codcli: toStr(row.codcli),
          cnpj: toStr(row.cnpj),
          state: toStr(row.state),
          obs: toStr(row.obs),
          pgto: toStr(row.pgto),
          codrep: toStr(row.codrep),
        };
      }
    }

    let synced = 0;
    let deleted = 0;

    // 4. Processar cada pedido
    for (const numero of numeros) {
      const order = orderMap[numero];

      // 4a. Pedido deletado no ERP
      if (!sisplanNumeros.has(numero)) {
        await db.query(
          `UPDATE orders SET status = 'deletado_erp', updated_at = NOW() WHERE id = $1`,
          [order.id]
        );
        deleted++;
        console.log(`[Sisplan Order Sync] Pedido #${order.id} (${numero}) deletado no ERP → status=deletado_erp`);
        continue;
      }

      // 4b. Pedido existe no ERP → regravar itens + atualizar header
      const erpData = itemsByOrder[numero];
      if (!erpData || erpData.items.length === 0) {
        // Pedido existe mas sem itens (todos cancelados?)
        const client = await db.getClient();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM order_items WHERE order_id = $1', [order.id]);
          await client.query('UPDATE orders SET total = 0, updated_at = NOW() WHERE id = $1', [order.id]);
          await client.query('COMMIT');
          synced++;
          console.log(`[Sisplan Order Sync] Pedido #${order.id} (${numero}) → 0 itens (todos removidos/cancelados)`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[Sisplan Order Sync] Erro no pedido #${order.id}:`, err.message);
        } finally {
          client.release();
        }
        continue;
      }

      // Regravar itens em transaction
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Delete itens antigos
        await client.query('DELETE FROM order_items WHERE order_id = $1', [order.id]);

        // Insert novos itens do ERP
        let total = 0;
        for (const item of erpData.items) {
          const qty = Number(item.quantity) || 0;
          const unitPrice = Number(item.unit_price) || 0;
          total += qty * unitPrice;

          await client.query(
            `INSERT INTO order_items (order_id, product_name, size_name, sisplan_sku, sisplan_color_code, sisplan_color_name, qty, unit_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              order.id,
              toStr(item.product),
              toStr(item.tam),
              toStr(item.sku),
              toStr(item.idColor),
              toStr(item.colorName),
              qty,
              unitPrice,
            ]
          );
        }

        // Atualizar header do pedido (notes, payment_condition_erp, customer_snapshot parcial, total)
        const header = erpData.header;
        const updateFields = ['total = $2', 'updated_at = NOW()'];
        const updateParams = [order.id, Math.round(total * 100) / 100];

        // Atualizar notes do ERP (sempre sobrescrever, inclusive para limpar lixo)
        updateParams.push(header.obs || '');
        updateFields.push(`notes = $${updateParams.length}`);

        // Atualizar payment_condition_erp
        if (header.pgto) {
          updateParams.push(header.pgto);
          updateFields.push(`payment_condition_erp = $${updateParams.length}`);
        }

        // Atualizar customer_snapshot com dados atualizados do ERP
        const snapshot = {
          sisplan_id: header.codcli,
          fantasy_name: header.nome_fantasia,
          company_name: header.clientName,
          cnpj: header.cnpj,
          uf: header.state,
        };
        updateParams.push(JSON.stringify(snapshot));
        updateFields.push(`customer_snapshot = $${updateParams.length}`);

        // Atualizar representante (created_by) se mudou no ERP
        if (header.codrep) {
          const { rows: [repUser] } = await client.query(
            `SELECT id FROM users WHERE rep_code = $1 LIMIT 1`,
            [header.codrep]
          );
          if (repUser) {
            updateParams.push(repUser.id);
            updateFields.push(`created_by = $${updateParams.length}`);
          }
        }

        await client.query(
          `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $1`,
          updateParams
        );

        await client.query('COMMIT');
        synced++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Sisplan Order Sync] Erro no pedido #${order.id} (${numero}):`, err.message);
      } finally {
        client.release();
      }
    }

    // 5. Limpar vendas órfãs na tabela sales (mesmo comportamento anterior)
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
        console.log(`[Sisplan Order Sync] ${orphanIds.length} venda(s) Fabrica órfã(s) removida(s) (${rowCount} linhas)`);
      }
    }

    console.log(`[Sisplan Order Sync] Concluído: ${synced} sincronizado(s), ${deleted} deletado(s) no ERP.`);
  } catch (err) {
    console.error('[Sisplan Order Sync] Erro:', err.message);
  } finally {
    if (fbDb) await firebirdDetach(fbDb);
  }
}

module.exports = {
  integrateOrderDryRun,
  integrateOrderExecute,
  syncOrdersFromERP,
};
