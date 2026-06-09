const db = require('./connection');
const { getSaoPauloDate } = require('../lib/timezone');
// Wrap to match pool API used throughout the repositories
const pool = {
  query: db.query,
  connect: db.getClient,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Monta o código da variante a partir do código base + tamanho (ex: 010 + P → 010-P)
function buildVariantCodigo(baseCodigo, tamanho) {
  return `${String(baseCodigo).trim()}-${String(tamanho).trim()}`;
}

// SELECT padrão de produto com suas variantes (cada uma com seus códigos de barras)
const PRODUCT_SELECT = `
  SELECT p.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id', v.id,
          'tamanho', v.tamanho,
          'codigo', v.codigo,
          'min_stock', v.min_stock,
          'balance', v.balance,
          'sort_order', v.sort_order,
          'active', v.active,
          'barcodes', COALESCE((
            SELECT json_agg(json_build_object('id', b.id, 'barcode', b.barcode) ORDER BY b.id)
            FROM stock_barcodes b WHERE b.variant_id = v.id
          ), '[]')
        ) ORDER BY v.sort_order, v.tamanho
      ) FILTER (WHERE v.id IS NOT NULL),
      '[]'
    ) AS variants
  FROM stock_products p
  LEFT JOIN stock_variants v ON v.product_id = p.id AND v.active = true
`;

// ─── Produtos ────────────────────────────────────────────────────────────────

async function getProducts({ search, includeInactive = false } = {}) {
  const params = [];
  const where = [];
  if (!includeInactive) where.push('p.active = true');
  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.codigo ILIKE $${params.length} OR p.descricao ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${PRODUCT_SELECT} ${whereSql} GROUP BY p.id ORDER BY p.codigo`,
    params
  );
  return rows;
}

async function getProductById(id) {
  const { rows } = await pool.query(
    `${PRODUCT_SELECT} WHERE p.id = $1 GROUP BY p.id`,
    [id]
  );
  return rows[0] || null;
}

// Cria produto-base + variantes da grade.
// variants: [{ tamanho, codigo?, min_stock? }]
async function createProduct({ codigo, descricao, familia = null, image_url = null, variants = [] }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO stock_products (codigo, descricao, familia, image_url) VALUES ($1,$2,$3,$4) RETURNING *`,
      [codigo, descricao, familia, image_url]
    );
    const product = rows[0];
    await _upsertVariants(client, product.id, codigo, variants);
    await client.query('COMMIT');
    return getProductById(product.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Atualiza produto e reconcilia a grade: insere novos tamanhos, atualiza existentes,
// desativa os removidos (não apaga — preserva histórico de movimentos/barcodes).
async function updateProduct(id, { codigo, descricao, familia, image_url, variants }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE stock_products
       SET codigo = COALESCE($1, codigo),
           descricao = COALESCE($2, descricao),
           familia = CASE WHEN $3::text IS NULL THEN familia ELSE NULLIF(BTRIM($3), '') END,
           image_url = COALESCE($4, image_url),
           updated_at = NOW()
       WHERE id = $5`,
      [codigo ?? null, descricao ?? null, familia ?? null, image_url ?? null, id]
    );
    if (variants !== undefined) {
      const baseCodigo = codigo ?? (await client.query('SELECT codigo FROM stock_products WHERE id=$1', [id])).rows[0]?.codigo;
      const keepTamanhos = variants.map(v => String(v.tamanho).trim());
      // Desativa variantes que saíram da grade
      await client.query(
        `UPDATE stock_variants SET active=false WHERE product_id=$1 AND NOT (tamanho = ANY($2::text[]))`,
        [id, keepTamanhos]
      );
      await _upsertVariants(client, id, baseCodigo, variants);
    }
    await client.query('COMMIT');
    return getProductById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function _upsertVariants(client, productId, baseCodigo, variants) {
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const tamanho = String(v.tamanho).trim();
    const variantCodigo = v.codigo?.trim() || buildVariantCodigo(baseCodigo, tamanho);
    const minStock = Number.isFinite(+v.min_stock) ? +v.min_stock : 0;
    await client.query(
      `INSERT INTO stock_variants (product_id, tamanho, codigo, min_stock, sort_order, active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (product_id, tamanho)
       DO UPDATE SET codigo=$3, min_stock=$4, sort_order=$5, active=true`,
      [productId, tamanho, variantCodigo, minStock, i]
    );
  }
}

async function updateProductPhoto(id, imageUrl) {
  await pool.query('UPDATE stock_products SET image_url=$1, updated_at=NOW() WHERE id=$2', [imageUrl, id]);
}

async function deleteProduct(id) {
  // Soft delete (preserva histórico de movimentos)
  await pool.query('UPDATE stock_products SET active=false, updated_at=NOW() WHERE id=$1', [id]);
}

// ─── Códigos de barras ───────────────────────────────────────────────────────

async function getBarcodesForVariant(variantId) {
  const { rows } = await pool.query(
    'SELECT id, barcode FROM stock_barcodes WHERE variant_id=$1 ORDER BY id',
    [variantId]
  );
  return rows;
}

async function addBarcode(variantId, barcode) {
  const code = String(barcode).trim();
  if (!code) throw new Error('Código de barras vazio');
  const { rows } = await pool.query(
    `INSERT INTO stock_barcodes (variant_id, barcode) VALUES ($1,$2) RETURNING id, barcode`,
    [variantId, code]
  );
  return rows[0];
}

// Adiciona vários EANs a uma variante; ignora duplicados já existentes.
async function addBarcodesBulk(variantId, barcodes) {
  const client = await pool.connect();
  const added = [];
  const skipped = [];
  try {
    await client.query('BEGIN');
    for (const raw of barcodes) {
      const code = String(raw).trim();
      if (!code) continue;
      const { rows } = await client.query(
        `INSERT INTO stock_barcodes (variant_id, barcode) VALUES ($1,$2)
         ON CONFLICT (barcode) DO NOTHING RETURNING id, barcode`,
        [variantId, code]
      );
      if (rows[0]) added.push(rows[0]); else skipped.push(code);
    }
    await client.query('COMMIT');
    return { added, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function removeBarcode(id) {
  await pool.query('DELETE FROM stock_barcodes WHERE id=$1', [id]);
}

// Resolve um EAN → variante + produto + saldo atual (para a bipagem)
async function lookupBarcode(barcode) {
  const { rows } = await pool.query(
    `SELECT v.id AS variant_id, v.tamanho, v.codigo AS variant_codigo, v.balance, v.min_stock,
            p.id AS product_id, p.codigo AS product_codigo, p.descricao, p.image_url
     FROM stock_barcodes b
     JOIN stock_variants v ON v.id = b.variant_id
     JOIN stock_products p ON p.id = v.product_id
     WHERE b.barcode = $1`,
    [String(barcode).trim()]
  );
  return rows[0] || null;
}

// ─── Motivos de movimentação ─────────────────────────────────────────────────

async function getReasons({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = true';
  const { rows } = await pool.query(
    `SELECT * FROM stock_reasons ${where} ORDER BY direcao, sort_order, nome`
  );
  return rows;
}

async function createReason({ nome, direcao, sort_order = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO stock_reasons (nome, direcao, sort_order) VALUES ($1,$2,$3) RETURNING *`,
    [nome, direcao, sort_order]
  );
  return rows[0];
}

async function updateReason(id, { nome, direcao, sort_order, active }) {
  const { rows } = await pool.query(
    `UPDATE stock_reasons
     SET nome=COALESCE($1,nome), direcao=COALESCE($2,direcao),
         sort_order=COALESCE($3,sort_order), active=COALESCE($4,active)
     WHERE id=$5 RETURNING *`,
    [nome ?? null, direcao ?? null, sort_order ?? null, active ?? null, id]
  );
  return rows[0];
}

async function deleteReason(id) {
  // Soft delete (motivo pode estar referenciado por movimentos)
  await pool.query('UPDATE stock_reasons SET active=false WHERE id=$1', [id]);
}

// ─── Movimentos ──────────────────────────────────────────────────────────────

// Aplica um movimento dentro de uma transação já aberta (client).
// delta = variação COM SINAL no saldo. Retorna o movimento criado.
async function _applyMovementTx(client, { variant_id, tipo, delta, reason_id = null, note = null, inventory_session_id = null, user_id = null }) {
  const { rows: vrows } = await client.query(
    'SELECT balance FROM stock_variants WHERE id=$1 FOR UPDATE',
    [variant_id]
  );
  if (!vrows[0]) throw new Error('Variante não encontrada');
  const newBalance = vrows[0].balance + delta;
  const { rows } = await client.query(
    `INSERT INTO stock_movements (variant_id, tipo, qty, reason_id, resulting_balance, note, inventory_session_id, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [variant_id, tipo, delta, reason_id, newBalance, note, inventory_session_id, user_id]
  );
  await client.query('UPDATE stock_variants SET balance=$1 WHERE id=$2', [newBalance, variant_id]);
  return rows[0];
}

// Movimento avulso (modo rápido entrada/saída). qty é positivo; o sinal vem do tipo.
async function applyMovement({ variant_id, tipo, qty, reason_id = null, note = null, user_id = null }) {
  const q = Math.abs(Number(qty) || 0);
  if (q === 0) throw new Error('Quantidade inválida');
  if (!['entrada', 'saida'].includes(tipo)) throw new Error('Tipo inválido (use entrada/saida)');
  const delta = tipo === 'entrada' ? q : -q;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mov = await _applyMovementTx(client, { variant_id, tipo, delta, reason_id, note, user_id });
    await client.query('COMMIT');
    return mov;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Histórico de movimentos com nomes de produto/variante/motivo/usuário
async function getMovements({ variant_id, from, to, tipo, limit = 100 } = {}) {
  const params = [];
  const where = [];
  if (variant_id) { params.push(variant_id); where.push(`m.variant_id = $${params.length}`); }
  if (tipo) { params.push(tipo); where.push(`m.tipo = $${params.length}`); }
  if (from) { params.push(from); where.push(`m.created_at >= $${params.length}`); }
  if (to) { params.push(to); where.push(`m.created_at < $${params.length}`); }
  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT m.*, v.tamanho, v.codigo AS variant_codigo, p.descricao, p.codigo AS product_codigo,
            r.nome AS reason_nome, u.name AS user_name
     FROM stock_movements m
     JOIN stock_variants v ON v.id = m.variant_id
     JOIN stock_products p ON p.id = v.product_id
     LEFT JOIN stock_reasons r ON r.id = m.reason_id
     LEFT JOIN users u ON u.id = m.user_id
     ${whereSql}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

// Relatório de movimentações (produtos bipados / entradas / saídas / ajustes)
// com filtros por período, código de produto, tamanho e busca por descrição.
// As datas (from/to) são interpretadas no fuso de São Paulo e são inclusivas.
async function getMovementsReport({ from, to, tipo, product_codigo, tamanho, q, limit = 1000 } = {}) {
  const params = [];
  const where = [];
  if (tipo) { params.push(tipo); where.push(`m.tipo = $${params.length}`); }
  if (from) {
    params.push(from);
    where.push(`m.created_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
  }
  if (to) {
    params.push(to);
    where.push(`m.created_at < (($${params.length}::date) + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
  }
  if (product_codigo) { params.push(product_codigo); where.push(`p.codigo = $${params.length}`); }
  if (tamanho) { params.push(tamanho); where.push(`v.tamanho ILIKE $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.descricao ILIKE $${params.length} OR p.codigo ILIKE $${params.length} OR v.codigo ILIKE $${params.length})`);
  }
  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT m.id, m.tipo, m.qty, m.resulting_balance, m.note, m.created_at,
            v.tamanho, v.codigo AS variant_codigo,
            p.codigo AS product_codigo, p.descricao,
            r.nome AS reason_nome, u.name AS user_name
     FROM stock_movements m
     JOIN stock_variants v ON v.id = m.variant_id
     JOIN stock_products p ON p.id = v.product_id
     LEFT JOIN stock_reasons r ON r.id = m.reason_id
     LEFT JOIN users u ON u.id = m.user_id
     ${whereSql}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

// ─── Dashboard de Separação (apenas SAÍDAS) ──────────────────────────────────
// Tudo aqui considera só m.tipo='saida' (= peça separada). qty da saída é
// negativo no banco, então peças = ABS(m.qty). Datas no fuso de São Paulo.

// "Família": usa o campo cadastrado; se vazio, cai no 1º termo da descrição.
const FAMILY_EXPR = `COALESCE(NULLIF(BTRIM(p.familia), ''), INITCAP(SPLIT_PART(BTRIM(p.descricao), ' ', 1)))`;

// Filtro de saída no período (inclusivo no 'to'), no fuso de São Paulo.
// Aceita filtros opcionais por produto (p.codigo) e família (FAMILY_EXPR).
// As consultas que usam família/produto precisam dar JOIN em stock_products (alias p).
function _saidaPeriod(params, { from, to, product_codigo = null, familia = null } = {}) {
  const conds = [`m.tipo = 'saida'`];
  params.push(from);
  conds.push(`m.created_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
  params.push(to);
  conds.push(`m.created_at < (($${params.length}::date) + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`);
  if (product_codigo) { params.push(product_codigo); conds.push(`p.codigo = $${params.length}`); }
  if (familia) { params.push(familia); conds.push(`${FAMILY_EXPR} = $${params.length}`); }
  return conds.join(' AND ');
}

// Helpers de data (ISO YYYY-MM-DD) — usam meio-dia UTC para evitar bordas de DST.
function _d(iso) { return new Date(`${iso}T12:00:00Z`); }
function _iso(d) { return d.toISOString().slice(0, 10); }
function _addDays(iso, n) { const d = _d(iso); d.setUTCDate(d.getUTCDate() + n); return _iso(d); }
function _addMonths(iso, n) { const d = _d(iso); d.setUTCMonth(d.getUTCMonth() + n); return _iso(d); }
function _weekStart(iso) { const d = _d(iso); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return _iso(d); } // segunda
function _monthStart(iso) { return `${iso.slice(0, 8)}01`; }
// Data de hoje (YYYY-MM-DD) no fuso de São Paulo. Usa o helper do projeto, que
// é ICU-build-independent (não depende de 'en-CA', que quebra em small-icu/prod).
function _spToday() { return getSaoPauloDate(); }
function _daysBetween(from, to) { return Math.round((_d(to) - _d(from)) / 86400000); }

// Série diária de peças separadas (saídas) num período (com filtros opcionais).
async function _dailySaidas(opts) {
  const params = [];
  const where = _saidaPeriod(params, opts);
  const { rows } = await pool.query(
    `SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia,
            SUM(ABS(m.qty))::int AS pcs
     FROM stock_movements m
     JOIN stock_variants v ON v.id = m.variant_id
     JOIN stock_products p ON p.id = v.product_id
     WHERE ${where}
     GROUP BY 1 ORDER BY 1`,
    params
  );
  return rows; // [{ dia, pcs }]
}

async function getSeparationDashboard({ from, to, product_codigo = null, familia = null }) {
  const F = { from, to, product_codigo, familia };
  const params1 = []; const w1 = _saidaPeriod(params1, F);
  const params2 = []; const w2 = _saidaPeriod(params2, F);
  const params3 = []; const w3 = _saidaPeriod(params3, F);
  const params4 = []; const w4 = _saidaPeriod(params4, F);
  const params5 = []; const w5 = _saidaPeriod(params5, F);

  // Período selecionado: série diária + agregações
  const [series, bySize, byFamily, byProduct, familySize, productSize] = await Promise.all([
    _dailySaidas(F),
    pool.query(
      `SELECT v.tamanho, SUM(ABS(m.qty))::int AS pcs
       FROM stock_movements m
       JOIN stock_variants v ON v.id = m.variant_id
       JOIN stock_products p ON p.id = v.product_id
       WHERE ${w1}
       GROUP BY v.tamanho ORDER BY pcs DESC`, params1
    ).then(r => r.rows),
    pool.query(
      `SELECT ${FAMILY_EXPR} AS familia, SUM(ABS(m.qty))::int AS pcs
       FROM stock_movements m
       JOIN stock_variants v ON v.id = m.variant_id
       JOIN stock_products p ON p.id = v.product_id
       WHERE ${w2}
       GROUP BY 1 ORDER BY pcs DESC`, params2
    ).then(r => r.rows),
    pool.query(
      `SELECT p.codigo, p.descricao, ${FAMILY_EXPR} AS familia, SUM(ABS(m.qty))::int AS pcs
       FROM stock_movements m
       JOIN stock_variants v ON v.id = m.variant_id
       JOIN stock_products p ON p.id = v.product_id
       WHERE ${w3}
       GROUP BY p.id ORDER BY pcs DESC LIMIT 15`, params3
    ).then(r => r.rows),
    pool.query(
      `SELECT ${FAMILY_EXPR} AS familia, v.tamanho, SUM(ABS(m.qty))::int AS pcs
       FROM stock_movements m
       JOIN stock_variants v ON v.id = m.variant_id
       JOIN stock_products p ON p.id = v.product_id
       WHERE ${w4}
       GROUP BY 1, v.tamanho`, params4
    ).then(r => r.rows),
    pool.query(
      `SELECT p.codigo, p.descricao, v.tamanho, SUM(ABS(m.qty))::int AS pcs
       FROM stock_movements m
       JOIN stock_variants v ON v.id = m.variant_id
       JOIN stock_products p ON p.id = v.product_id
       WHERE ${w5}
       GROUP BY p.codigo, p.descricao, v.tamanho`, params5
    ).then(r => r.rows),
  ]);

  // Período anterior de mesmo tamanho (para sobreposição no gráfico)
  const len = _daysBetween(from, to) + 1;
  const prevTo = _addDays(from, -1);
  const prevFrom = _addDays(prevTo, -(len - 1));
  const prevSeries = await _dailySaidas({ ...F, from: prevFrom, to: prevTo });

  // KPIs (hoje / semana / mês) respeitam os filtros, mas não o período selecionado.
  const today = _spToday();
  const winStart = _addDays(today, -75); // janela suficiente p/ mês anterior parcial
  const dailyMap = {};
  for (const r of await _dailySaidas({ ...F, from: winStart, to: today })) dailyMap[r.dia] = r.pcs;
  const sumRange = (a, b) => { // inclusivo
    let s = 0; let d = a;
    while (d <= b) { s += dailyMap[d] || 0; d = _addDays(d, 1); }
    return s;
  };
  const wkStart = _weekStart(today);
  const moStart = _monthStart(today);
  const prevMoStart = _addMonths(moStart, -1);
  const elapsed = _daysBetween(moStart, today); // dias decorridos no mês (0-based)
  const kpis = {
    today: dailyMap[today] || 0,
    yesterday: dailyMap[_addDays(today, -1)] || 0,
    week: sumRange(wkStart, today),
    prevWeek: sumRange(_addDays(wkStart, -7), _addDays(today, -7)), // mesma janela na semana anterior
    month: sumRange(moStart, today),
    prevMonth: sumRange(prevMoStart, _addDays(prevMoStart, elapsed)), // mês anterior até o mesmo dia
  };

  // Métricas do período selecionado
  const periodTotal = series.reduce((s, r) => s + r.pcs, 0);
  const best = series.reduce((m, r) => (r.pcs > (m?.pcs || 0) ? r : m), null);
  const avgPerActiveDay = series.length ? Math.round(periodTotal / series.length) : 0;

  return {
    period: { from, to, total: periodTotal, avgPerActiveDay, best },
    prevPeriod: { from: prevFrom, to: prevTo },
    series,        // [{ dia, pcs }] período atual
    prevSeries,    // [{ dia, pcs }] período anterior
    bySize,        // [{ tamanho, pcs }]
    byFamily,      // [{ familia, pcs }]
    byProduct,     // [{ codigo, descricao, familia, pcs }]
    familySize,    // [{ familia, tamanho, pcs }] (heatmap)
    productSize,   // [{ codigo, descricao, tamanho, pcs }] (barras empilhadas por tamanho)
    kpis,
  };
}

// Opções para os filtros do dashboard: produtos (codigo+descrição+família)
// e a lista de famílias distintas (mesma regra de agrupamento do dashboard).
async function getSeparationFilters() {
  const { rows } = await pool.query(
    `SELECT p.codigo, p.descricao, ${FAMILY_EXPR} AS familia
     FROM stock_products p
     WHERE p.active = true
     ORDER BY p.codigo`
  );
  const familias = [...new Set(rows.map(r => r.familia).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { products: rows, familias };
}

// ─── Inventário (contagem absoluta) ──────────────────────────────────────────

async function openInventorySession({ modo = 'contagem', note = null, user_id = null }) {
  const { rows } = await pool.query(
    `INSERT INTO stock_inventory_sessions (modo, note, user_id) VALUES ($1,$2,$3) RETURNING *`,
    [modo, note, user_id]
  );
  return rows[0];
}

async function listInventorySessions({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT s.*, u.name AS user_name,
            (SELECT COUNT(*) FROM stock_inventory_counts c WHERE c.session_id = s.id) AS items
     FROM stock_inventory_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getInventorySession(id) {
  const { rows: srows } = await pool.query('SELECT * FROM stock_inventory_sessions WHERE id=$1', [id]);
  const session = srows[0];
  if (!session) return null;
  const { rows: counts } = await pool.query(
    `SELECT c.*, v.tamanho, v.codigo AS variant_codigo, v.balance AS current_balance,
            p.descricao, p.codigo AS product_codigo, p.image_url,
            uc.name AS counted_by_name
     FROM stock_inventory_counts c
     JOIN stock_variants v ON v.id = c.variant_id
     JOIN stock_products p ON p.id = v.product_id
     LEFT JOIN users uc ON uc.id = c.counted_by
     WHERE c.session_id = $1
     ORDER BY p.codigo, v.sort_order, v.tamanho`,
    [id]
  );
  return { ...session, counts };
}

// Define a contagem absoluta de uma variante (lançamento manual)
async function setInventoryCount(sessionId, variantId, countedQty, userId = null) {
  const { rows } = await pool.query(
    `INSERT INTO stock_inventory_counts (session_id, variant_id, counted_qty, counted_by, counted_at, updated_at)
     VALUES ($1,$2,$3,$4, now(), now())
     ON CONFLICT (session_id, variant_id)
       DO UPDATE SET counted_qty=$3, counted_by=$4, updated_at=now()
     RETURNING *`,
    [sessionId, variantId, Math.max(0, Number(countedQty) || 0), userId]
  );
  return rows[0];
}

// Incrementa a contagem de uma variante (bipagem: +by)
async function incrementInventoryCount(sessionId, variantId, by = 1, userId = null) {
  const { rows } = await pool.query(
    `INSERT INTO stock_inventory_counts (session_id, variant_id, counted_qty, counted_by, counted_at, updated_at)
     VALUES ($1,$2,$3,$4, now(), now())
     ON CONFLICT (session_id, variant_id)
       DO UPDATE SET counted_qty = stock_inventory_counts.counted_qty + $3, counted_by=$4, updated_at=now()
     RETURNING *`,
    [sessionId, variantId, Number(by) || 1, userId]
  );
  return rows[0];
}

async function removeInventoryCount(sessionId, variantId) {
  await pool.query('DELETE FROM stock_inventory_counts WHERE session_id=$1 AND variant_id=$2', [sessionId, variantId]);
}

// Finaliza: para cada contagem, saldo passa a ser counted_qty; gera ajuste com a diferença.
async function finalizeInventorySession(id, userId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: srows } = await client.query(
      'SELECT * FROM stock_inventory_sessions WHERE id=$1 FOR UPDATE', [id]
    );
    const session = srows[0];
    if (!session) throw new Error('Sessão não encontrada');
    if (session.status !== 'aberta') throw new Error('Sessão já finalizada/cancelada');

    const { rows: counts } = await client.query(
      'SELECT * FROM stock_inventory_counts WHERE session_id=$1', [id]
    );
    for (const c of counts) {
      const { rows: vrows } = await client.query(
        'SELECT balance FROM stock_variants WHERE id=$1 FOR UPDATE', [c.variant_id]
      );
      const systemQty = vrows[0]?.balance ?? 0;
      const diff = c.counted_qty - systemQty;
      await client.query(
        'UPDATE stock_inventory_counts SET system_qty=$1, diff=$2 WHERE id=$3',
        [systemQty, diff, c.id]
      );
      if (diff !== 0) {
        await _applyMovementTx(client, {
          variant_id: c.variant_id,
          tipo: 'ajuste',
          delta: diff,
          note: `Inventário #${id}`,
          inventory_session_id: id,
          user_id: userId,
        });
      }
    }
    await client.query(
      "UPDATE stock_inventory_sessions SET status='finalizada', finished_at=NOW() WHERE id=$1",
      [id]
    );
    await client.query('COMMIT');
    return getInventorySession(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function cancelInventorySession(id) {
  await pool.query(
    "UPDATE stock_inventory_sessions SET status='cancelada', finished_at=NOW() WHERE id=$1 AND status='aberta'",
    [id]
  );
}

// ─── Relatórios ──────────────────────────────────────────────────────────────

// Consumo médio (apenas saídas) no período + dias de cobertura
async function getConsumptionReport({ from, to } = {}) {
  const { rows } = await pool.query(
    `SELECT v.id AS variant_id, v.codigo AS variant_codigo, v.tamanho, v.balance, v.min_stock,
            p.id AS product_id, p.codigo AS product_codigo, p.descricao,
            COALESCE(SUM(CASE WHEN m.tipo='saida' THEN -m.qty ELSE 0 END), 0) AS total_out
     FROM stock_variants v
     JOIN stock_products p ON p.id = v.product_id
     LEFT JOIN stock_movements m
       ON m.variant_id = v.id AND m.tipo='saida'
       AND m.created_at >= $1 AND m.created_at < $2
     WHERE v.active = true AND p.active = true
     GROUP BY v.id, p.id
     ORDER BY p.codigo, v.sort_order, v.tamanho`,
    [from, to]
  );
  return rows;
}

// Variantes com saldo no nível (ou abaixo) do mínimo
async function getLowStock() {
  const { rows } = await pool.query(
    `SELECT v.id AS variant_id, v.codigo AS variant_codigo, v.tamanho, v.balance, v.min_stock,
            p.id AS product_id, p.codigo AS product_codigo, p.descricao, p.image_url
     FROM stock_variants v
     JOIN stock_products p ON p.id = v.product_id
     WHERE v.active = true AND p.active = true AND v.min_stock > 0 AND v.balance <= v.min_stock
     ORDER BY (v.balance - v.min_stock), p.codigo, v.tamanho`
  );
  return rows;
}

module.exports = {
  buildVariantCodigo,
  // produtos
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductPhoto,
  deleteProduct,
  // barcodes
  getBarcodesForVariant,
  addBarcode,
  addBarcodesBulk,
  removeBarcode,
  lookupBarcode,
  // motivos
  getReasons,
  createReason,
  updateReason,
  deleteReason,
  // movimentos
  applyMovement,
  getMovements,
  getMovementsReport,
  // inventário
  openInventorySession,
  listInventorySessions,
  getInventorySession,
  setInventoryCount,
  incrementInventoryCount,
  removeInventoryCount,
  finalizeInventorySession,
  cancelInventorySession,
  // relatórios
  getConsumptionReport,
  getSeparationDashboard,
  getSeparationFilters,
  getLowStock,
};
