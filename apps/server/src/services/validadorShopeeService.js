const xlsx = require('xlsx');
const db = require('../db/connection');

// ─── Constantes ─────────────────────────────────────────────────────────────

const TOL = 0.02;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\s+/g, '').replace(/R\$/gi, '');
  const neg = /^-/.test(s);
  if (neg) s = s.slice(1);
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Ambos presentes: o último separador é o decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // BR: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // EN: 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Apenas vírgula → decimal (BR)
    s = s.replace(',', '.');
  }
  // Apenas ponto ou nenhum: deixa como está (ponto é decimal em EN)
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

function parseDateBR(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    const parsed = xlsx.SSF.parse_date_code(v);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const d = parseInt(m[1]);
    const mo = parseInt(m[2]) - 1;
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    return new Date(y, mo, d, parseInt(m[4] || 0), parseInt(m[5] || 0), parseInt(m[6] || 0));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Casamento de colunas por alias ─────────────────────────────────────────

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function buildColumnIndex(row) {
  const idx = {};
  for (const key of Object.keys(row || {})) {
    idx[norm(key)] = key;
  }
  return idx;
}

function pickColumn(idx, aliases) {
  for (const alias of aliases) {
    const n = norm(alias);
    if (idx[n]) return idx[n];
    for (const k of Object.keys(idx)) {
      if (k.includes(n)) return idx[k];
    }
  }
  return null;
}

// ─── Parser do Income Report ────────────────────────────────────────────────

// Converte a planilha em objetos, detectando automaticamente a linha de cabeçalho.
// A Shopee às vezes insere linhas de título/metadata antes do header real.
// `requiredAliases`: lista de aliases (já normalizados) que devem existir numa
// linha para ser considerada o cabeçalho.
function sheetToRows(sheet, requiredAliases) {
  // raw: true preserva números como Number (evita inflação por formatação de
  // célula em locale divergente — ex.: "38.90" string seria parseado errado).
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!matrix.length) return { headers: [], rows: [] };

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] || [];
    const normalized = row.map((c) => norm(c));
    const hasAll = requiredAliases.every((alias) => {
      const a = norm(alias);
      return normalized.some((c) => c === a || (c && c.includes(a)));
    });
    if (hasAll) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (matrix[headerRowIdx] || []).map((h) => String(h || '').trim());
  const rows = [];
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    if (raw.every((c) => c === '' || c == null)) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = raw[c] ?? '';
    }
    rows.push(obj);
  }
  return { headers, rows };
}

function parseIncomeReport(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });

  const findSheet = (candidates) => {
    for (const name of workbook.SheetNames) {
      const n = norm(name);
      for (const c of candidates) {
        if (n === norm(c) || n.includes(norm(c))) return name;
      }
    }
    return null;
  };

  const rendaSheet = findSheet(['renda', 'income', 'orders']);
  const sfdSheet = findSheet(['service fee details', 'service fee', 'detalhe taxa servico', 'taxa de servico']);
  const shippingSheet = findSheet(['shipping fee discrepancy', 'shipping', 'frete']);

  if (!rendaSheet) {
    throw new Error('Aba "Renda" (Income) não encontrada. Abas no arquivo: ' + workbook.SheetNames.join(', '));
  }

  const { headers: rendaHeaders, rows: rendaRows } =
    sheetToRows(workbook.Sheets[rendaSheet], ['id do pedido']);
  const { rows: sfdRows } = sfdSheet
    ? sheetToRows(workbook.Sheets[sfdSheet], ['id do pedido'])
    : { rows: [] };
  const { rows: shippingRows } = shippingSheet
    ? sheetToRows(workbook.Sheets[shippingSheet], ['id do pedido'])
    : { rows: [] };

  const income = parseRenda(rendaRows, rendaHeaders);
  const sfd = parseServiceFee(sfdRows);
  const shipping = parseShipping(shippingRows);

  return { income, sfd, shipping };
}

function parseRenda(rows, headers) {
  if (!rows.length) return new Map();
  const idx = buildColumnIndex(rows[0]);

  const col = {
    orderId: pickColumn(idx, ['id do pedido', 'order id', 'nº do pedido']),
    nomeProduto: pickColumn(idx, ['nome do produto', 'product name']),
    dataCriacao: pickColumn(idx, ['data de criacao do pedido', 'data de criação do pedido', 'data de criacao']),
    dataPagamento: pickColumn(idx, ['data de conclusao do pagamento', 'data de conclusão do pagamento', 'data pagamento']),
    precoProduto: pickColumn(idx, ['preco do produto', 'preço do produto', 'product price']),
    voucherSeller: pickColumn(idx, ['voucher subsidiado pelo seller', 'voucher seller', 'voucher subsidiado']),
    comissaoLiquida: pickColumn(idx, ['taxa de comissao liquida', 'taxa de comissão líquida']),
    servicoLiquida: pickColumn(idx, ['taxa de servico liquida', 'taxa de serviço líquida']),
    taxaAfiliados: pickColumn(idx, ['taxa de comissao afiliados do vendedor', 'taxa de comissão afiliados', 'afiliados']),
    quantiaLiberada: pickColumn(idx, ['quantia total lancada', 'quantia total lançada', 'quantia liberada']),
    cupom: pickColumn(idx, ['codigo do cupom', 'código do cupom']),
    metodoPagamento: pickColumn(idx, ['metodo de pagamento do comprador', 'método de pagamento']),
  };

  if (!col.orderId) {
    const available = (headers || Object.keys(rows[0] || {})).filter(Boolean);
    throw new Error(
      'Coluna "ID do pedido" não encontrada na aba Renda. ' +
      'Colunas detectadas: ' + (available.length ? available.join(', ') : '(nenhuma)')
    );
  }

  const grouped = new Map();

  for (const r of rows) {
    const orderId = String(r[col.orderId] || '').trim();
    if (!orderId) continue;

    const nome = String(r[col.nomeProduto] || '').trim();
    const isTotal = nome === '-' || nome === '' || nome.toLowerCase() === 'total';

    if (!grouped.has(orderId)) {
      grouped.set(orderId, {
        orderId,
        items: [],
        totalRow: null,
        voucherSeller: 0,
        afiliados: 0,
        comissaoReal: 0,
        servicoReal: 0,
        quantiaLiberada: 0,
        precoTotal: 0,
        dataCriacao: null,
        dataPagamento: null,
        cupom: '',
        metodoPagamento: '',
      });
    }

    const g = grouped.get(orderId);

    const preco = parseNumber(r[col.precoProduto]);
    const voucher = Math.abs(parseNumber(r[col.voucherSeller]));
    const comissao = Math.abs(parseNumber(r[col.comissaoLiquida]));
    const servico = Math.abs(parseNumber(r[col.servicoLiquida]));
    const afiliado = Math.abs(parseNumber(r[col.taxaAfiliados]));
    const liberado = parseNumber(r[col.quantiaLiberada]);

    if (isTotal) {
      g.totalRow = r;
      g.voucherSeller = voucher || g.voucherSeller;
      g.afiliados = afiliado || g.afiliados;
      g.comissaoReal = comissao || g.comissaoReal;
      g.servicoReal = servico || g.servicoReal;
      g.quantiaLiberada = liberado || g.quantiaLiberada;
      if (col.dataCriacao && r[col.dataCriacao]) g.dataCriacao = parseDateBR(r[col.dataCriacao]);
      if (col.dataPagamento && r[col.dataPagamento]) g.dataPagamento = parseDateBR(r[col.dataPagamento]);
      if (col.cupom) g.cupom = String(r[col.cupom] || '').trim();
      if (col.metodoPagamento) g.metodoPagamento = String(r[col.metodoPagamento] || '').trim();
    } else {
      g.items.push({ nome, preco, voucher, comissao, servico, afiliado, liberado });
      g.precoTotal += preco;
      if (!g.dataCriacao && col.dataCriacao && r[col.dataCriacao]) g.dataCriacao = parseDateBR(r[col.dataCriacao]);
      if (!g.dataPagamento && col.dataPagamento && r[col.dataPagamento]) g.dataPagamento = parseDateBR(r[col.dataPagamento]);
      if (!g.cupom && col.cupom) g.cupom = String(r[col.cupom] || '').trim();
      if (!g.metodoPagamento && col.metodoPagamento) g.metodoPagamento = String(r[col.metodoPagamento] || '').trim();
    }
  }

  // Se não houver linha totalizadora, somar pelos itens
  for (const g of grouped.values()) {
    if (!g.totalRow) {
      g.voucherSeller = g.items.reduce((s, i) => s + i.voucher, 0);
      g.afiliados = g.items.reduce((s, i) => s + i.afiliado, 0);
      g.comissaoReal = g.items.reduce((s, i) => s + i.comissao, 0);
      g.servicoReal = g.items.reduce((s, i) => s + i.servico, 0);
      g.quantiaLiberada = g.items.reduce((s, i) => s + i.liberado, 0);
    }
    g.nItens = g.items.length;
  }

  return grouped;
}

function parseServiceFee(rows) {
  const map = new Map();
  if (!rows.length) return map;
  const idx = buildColumnIndex(rows[0]);

  const col = {
    orderId: pickColumn(idx, ['id do pedido', 'order id']),
    taxaTransacao: pickColumn(idx, ['taxa de transacao', 'taxa de transação']),
    taxaAdicional: pickColumn(idx, ['taxa de servico adicional', 'taxa de serviço adicional', 'taxa adicional']),
    taxaItem: pickColumn(idx, ['taxa por item vendido', 'taxa por item']),
  };

  if (!col.orderId) return map;

  for (const r of rows) {
    const oid = String(r[col.orderId] || '').trim();
    if (!oid) continue;
    const taxaAdicional = Math.abs(parseNumber(r[col.taxaAdicional]));
    const taxaTransacao = Math.abs(parseNumber(r[col.taxaTransacao]));
    const taxaItem = Math.abs(parseNumber(r[col.taxaItem]));
    if (!map.has(oid)) {
      map.set(oid, { taxaAdicional: 0, taxaTransacao: 0, taxaItem: 0 });
    }
    const acc = map.get(oid);
    acc.taxaAdicional += taxaAdicional;
    acc.taxaTransacao += taxaTransacao;
    acc.taxaItem += taxaItem;
  }
  return map;
}

function parseShipping(rows) {
  const map = new Map();
  if (!rows.length) return map;
  const idx = buildColumnIndex(rows[0]);

  const col = {
    orderId: pickColumn(idx, ['id do pedido', 'order id']),
    freteEsperado: pickColumn(idx, ['taxa de frete esperada', 'frete esperado']),
    freteReal: pickColumn(idx, ['taxa de frete real cobrada pelo parceiro logistico', 'taxa de frete real', 'frete real']),
    motivo: pickColumn(idx, ['motivo da discrepancia', 'motivo da discrepância', 'motivo']),
  };

  if (!col.orderId) return map;

  for (const r of rows) {
    const oid = String(r[col.orderId] || '').trim();
    if (!oid) continue;
    const freteEsperado = parseNumber(r[col.freteEsperado]);
    const freteReal = parseNumber(r[col.freteReal]);
    const motivo = String(r[col.motivo] || '').trim();
    map.set(oid, { freteEsperado, freteReal, motivo, diff: round2(freteReal - freteEsperado) });
  }
  return map;
}

// ─── Fórmula de cálculo ─────────────────────────────────────────────────────

function faixaComissao(precoMedioItem) {
  if (precoMedioItem <= 79.99) return { pct: 0.20, fixoUnit: 4.00, label: 'Até R$ 79,99' };
  if (precoMedioItem <= 99.99) return { pct: 0.14, fixoUnit: 16.00, label: 'R$ 80,00–99,99' };
  if (precoMedioItem <= 199.99) return { pct: 0.14, fixoUnit: 20.00, label: 'R$ 100,00–199,99' };
  return { pct: 0.14, fixoUnit: 26.00, label: 'R$ 200,00+' };
}

function calcularLiberadoEsperado(precoIncome, voucher, nItens, afiliado) {
  const n = Math.max(1, nItens || 1);
  const precoMedioItem = precoIncome / n;
  const { pct, fixoUnit, label } = faixaComissao(precoMedioItem);
  const base = round2(precoIncome - voucher);
  const comissao = round2(base * pct);
  const totalFixo = round2(fixoUnit * n);
  const liberado = round2(base - comissao - totalFixo - afiliado);
  return { base, pct, fixoUnit, totalFixo, comissao, liberado, faixaLabel: label };
}

// ─── Buscar pedidos do analítico (sales table) ──────────────────────────────

async function fetchShopeeOrders({ start, end, store }) {
  const params = [];
  const conditions = [`platform = 'Shopee'`];
  let idx = 1;

  if (start) {
    conditions.push(`date::date >= $${idx++}::date`);
    params.push(start);
  }
  if (end) {
    conditions.push(`date::date <= $${idx++}::date`);
    params.push(end);
  }
  if (store) {
    conditions.push(`store = $${idx++}`);
    params.push(store);
  }

  const result = await db.query(
    `SELECT
       order_id           AS "orderId",
       platform_order_id  AS "platformOrderId",
       date,
       store,
       product,
       variation,
       sku,
       quantity,
       total,
       unit_price         AS "unitPrice",
       discount,
       status,
       client_name        AS "clientName"
     FROM sales
     WHERE ${conditions.join(' AND ')}
     ORDER BY date DESC`,
    params
  );

  return result.rows.map(r => ({
    ...r,
    quantity: parseFloat(r.quantity) || 0,
    total: parseFloat(r.total) || 0,
    unitPrice: parseFloat(r.unitPrice) || 0,
    discount: parseFloat(r.discount) || 0,
  }));
}

async function fetchShopeeStores() {
  const result = await db.query(
    `SELECT DISTINCT store
     FROM sales
     WHERE platform = 'Shopee'
       AND store IS NOT NULL AND store <> ''
     ORDER BY store`
  );
  return result.rows.map(r => r.store);
}

// ─── Agregação e cruzamento ─────────────────────────────────────────────────

function aggregateOrdersByPlatformId(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const pid = String(row.platformOrderId || '').trim();
    const key = pid || `__no_pid__:${row.orderId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        platformOrderId: pid,
        internalOrderId: row.orderId,
        date: row.date,
        store: row.store,
        status: row.status || '',
        clientName: row.clientName || '',
        items: [],
        precoTabela: 0,
        descontoSeller: 0,
        subsidioShopee: 0,
        totalPago: 0,
        qtd: 0,
      });
    }
    const g = grouped.get(key);
    const qty = row.quantity || 1;
    const unit = row.unitPrice || 0;
    const discount = row.discount || 0;

    const precoBruto = unit * qty;
    // Spec 2.4: desconto positivo = voucher seller (reduz total); negativo = subsidio shopee (aumenta)
    if (discount >= 0) g.descontoSeller += discount;
    else g.subsidioShopee += Math.abs(discount);

    g.precoTabela += precoBruto;
    g.totalPago += row.total || 0;
    g.qtd += qty;
    g.items.push({
      product: row.product,
      variation: row.variation,
      sku: row.sku,
      qty,
      unitPrice: unit,
      total: row.total,
      discount,
    });
    // Mantém a data mais antiga
    if (!g.date || (row.date && new Date(row.date) < new Date(g.date))) g.date = row.date;
    // Se alguma linha estiver cancelada, marca o pedido como cancelado
    if ((row.status || '').toLowerCase().includes('cancel')) g.status = 'Cancelado';
  }

  for (const g of grouped.values()) {
    g.precoTabela = round2(g.precoTabela);
    g.descontoSeller = round2(g.descontoSeller);
    g.subsidioShopee = round2(g.subsidioShopee);
    g.totalPago = round2(g.totalPago);
  }

  return grouped;
}

function categorizar({ pedido, incomeData, sfd, shipping, diff }) {
  if ((pedido.status || '').toLowerCase() === 'cancelado') return { key: 'cancelado', label: 'Cancelado', causas: [] };
  if (!incomeData) return { key: 'em_aberto', label: 'Sem income (em aberto)', causas: [] };

  const causas = [];
  if (sfd && sfd.taxaAdicional > 0.01) causas.push('Taxa adicional 2,5%');
  if (shipping) causas.push('Peso divergente');
  if (incomeData.afiliados > 0.01) causas.push('Afiliado');
  if (incomeData.nItens > 1) causas.push(`Multi-item (${incomeData.nItens})`);

  if (Math.abs(diff) < TOL) {
    return { key: 'ok', label: 'OK', causas };
  }

  if (causas.length > 0) {
    const primary =
      (sfd && sfd.taxaAdicional > 0.01) ? 'taxa_adicional' :
      shipping ? 'peso_divergente' :
      incomeData.afiliados > 0.01 ? 'afiliado' :
      'multi_item';
    return { key: primary, label: causas.join(' + '), causas };
  }

  return { key: 'investigar', label: 'Sem causa identificada', causas: [] };
}

// ─── Processamento principal ────────────────────────────────────────────────

async function processReconciliation({ start, end, store }, incomeBuffer) {
  const orders = await fetchShopeeOrders({ start, end, store });
  const groupedOrders = aggregateOrdersByPlatformId(orders);

  const { income, sfd, shipping } = parseIncomeReport(incomeBuffer);

  const results = [];
  const matchedIncomeIds = new Set();

  for (const pedido of groupedOrders.values()) {
    const pid = pedido.platformOrderId;
    const incomeData = pid ? income.get(pid) : null;
    if (pid && incomeData) matchedIncomeIds.add(pid);

    const sfdData = pid ? sfd.get(pid) : null;
    const shippingData = pid ? shipping.get(pid) : null;

    let calc = null;
    let diff = null;
    let statusPagamento = 'Em aberto';

    if ((pedido.status || '').toLowerCase() === 'cancelado') {
      statusPagamento = 'Cancelado';
    } else if (incomeData) {
      calc = calcularLiberadoEsperado(
        incomeData.precoTotal,
        incomeData.voucherSeller,
        incomeData.nItens,
        incomeData.afiliados
      );
      diff = round2(incomeData.quantiaLiberada - calc.liberado);
      statusPagamento = incomeData.dataPagamento ? 'Pago' : 'Em aberto';
    }

    const cat = categorizar({
      pedido,
      incomeData,
      sfd: sfdData,
      shipping: shippingData,
      diff: diff == null ? 0 : diff,
    });

    results.push({
      orderId: pid || pedido.internalOrderId,
      internalOrderId: pedido.internalOrderId,
      platformOrderId: pid,
      date: pedido.date,
      store: pedido.store,
      produto: pedido.items[0]?.product || '-',
      qtd: pedido.qtd,
      statusPagamento,
      dataLiberacao: incomeData?.dataPagamento || null,
      cupom: incomeData?.cupom || '',
      metodoPagamento: incomeData?.metodoPagamento || '',

      // Analítico
      precoTabela: pedido.precoTabela,
      descontoSeller: pedido.descontoSeller,
      subsidioShopee: pedido.subsidioShopee,
      totalPago: pedido.totalPago,

      // Income (apenas se houver match)
      precoIncome: incomeData?.precoTotal ?? null,
      voucher: incomeData?.voucherSeller ?? null,
      afiliado: incomeData?.afiliados ?? null,
      comissaoReal: incomeData?.comissaoReal ?? null,
      taxaServicoReal: incomeData?.servicoReal ?? null,
      valorLiberado: incomeData?.quantiaLiberada ?? null,

      // Cálculo
      baseCalculo: calc?.base ?? null,
      comissaoPct: calc?.pct ?? null,
      comissaoEsperada: calc?.comissao ?? null,
      taxaFixaUnit: calc?.fixoUnit ?? null,
      faixaLabel: calc?.faixaLabel ?? null,
      nItens: incomeData?.nItens ?? pedido.items.length,
      totalFixoEsperado: calc?.totalFixo ?? null,
      liberadoEsperado: calc?.liberado ?? null,

      // Resultado
      diff,
      causaKey: cat.key,
      causaLabel: cat.label,
      causas: cat.causas,

      // Extras
      taxaAdicional: sfdData?.taxaAdicional ?? null,
      taxaTransacao: sfdData?.taxaTransacao ?? null,
      taxaItem: sfdData?.taxaItem ?? null,
      freteEsperado: shippingData?.freteEsperado ?? null,
      freteReal: shippingData?.freteReal ?? null,
      diffFrete: shippingData?.diff ?? null,
      motivoFrete: shippingData?.motivo ?? null,
    });
  }

  // Pedidos que aparecem no income mas não no analítico (ex: mês anterior) — informativo
  const incomeWithoutAnalitico = [];
  for (const [pid, g] of income.entries()) {
    if (!matchedIncomeIds.has(pid)) {
      incomeWithoutAnalitico.push({
        platformOrderId: pid,
        precoIncome: round2(g.precoTotal),
        valorLiberado: round2(g.quantiaLiberada),
        dataCriacao: g.dataCriacao,
        dataPagamento: g.dataPagamento,
      });
    }
  }

  // Resumo
  const summary = {
    totalPedidos: results.length,
    ok: results.filter(r => r.causaKey === 'ok').length,
    cancelado: results.filter(r => r.causaKey === 'cancelado').length,
    emAberto: results.filter(r => r.causaKey === 'em_aberto').length,
    taxaAdicional: results.filter(r => r.causaKey === 'taxa_adicional').length,
    pesoDivergente: results.filter(r => r.causaKey === 'peso_divergente').length,
    afiliado: results.filter(r => r.causaKey === 'afiliado').length,
    multiItem: results.filter(r => r.causaKey === 'multi_item').length,
    investigar: results.filter(r => r.causaKey === 'investigar').length,
    impactoFinanceiro: round2(
      results
        .filter(r => r.diff != null && r.causaKey !== 'ok' && r.causaKey !== 'em_aberto' && r.causaKey !== 'cancelado')
        .reduce((s, r) => s + r.diff, 0)
    ),
    totalLiberado: round2(
      results.filter(r => r.valorLiberado != null).reduce((s, r) => s + r.valorLiberado, 0)
    ),
    totalLiberadoEsperado: round2(
      results.filter(r => r.liberadoEsperado != null).reduce((s, r) => s + r.liberadoEsperado, 0)
    ),
    incomeOrphanCount: incomeWithoutAnalitico.length,
  };

  return {
    summary,
    orders: results,
    incomeWithoutAnalitico,
  };
}

module.exports = {
  processReconciliation,
  fetchShopeeStores,
  // exports para teste
  _internals: { parseIncomeReport, calcularLiberadoEsperado, faixaComissao, categorizar, aggregateOrdersByPlatformId },
};
