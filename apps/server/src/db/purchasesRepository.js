const db = require('./connection');

// Listagem com agregados de parcelas (status vem do fluxo de caixa)
async function list() {
  const { rows } = await db.query(
    `SELECT p.id, p.order_number AS "orderNumber", p.supplier_name AS "supplierName",
            p.order_date AS "orderDate", p.total_amount AS "totalAmount", p.total_pieces AS "totalPieces",
            p.payment_terms AS "paymentTerms", p.obs, p.box_id AS "boxId", b.name AS "boxName",
            p.category_id AS "categoryId", c.name AS "categoryName",
            (p.file_path IS NOT NULL) AS "hasFile", p.created_at AS "createdAt",
            COALESCE(inst.total, 0)::int AS "installmentsCount",
            COALESCE(inst.paid, 0)::int AS "installmentsPaid",
            inst.items AS "installments"
       FROM purchases p
       LEFT JOIN cashflow_boxes b ON b.id = p.box_id
       LEFT JOIN cashflow_categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE e.status = 'ok') AS paid,
                COALESCE(json_agg(json_build_object(
                  'dueDate', i.due_date, 'amount', i.amount, 'status', COALESCE(e.status, 'pending')
                ) ORDER BY i.seq) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
           FROM purchase_installments i
           LEFT JOIN cashflow_entries e ON e.id = i.cashflow_entry_id
          WHERE i.purchase_id = p.id
       ) inst ON true
      ORDER BY p.order_date DESC, p.id DESC`
  );
  return rows.map(r => ({ ...r, totalAmount: parseFloat(r.totalAmount) }));
}

async function get(id) {
  const { rows } = await db.query('SELECT * FROM purchases WHERE id = $1', [id]);
  const p = rows[0];
  if (!p) return null;
  const { rows: items } = await db.query(
    `SELECT id, description, size, size_grid AS "sizeGrid", qty, unit_price AS "unitPrice", total, obs
       FROM purchase_items WHERE purchase_id = $1 ORDER BY id`, [id]
  );
  const { rows: installments } = await db.query(
    `SELECT i.id, i.seq, i.due_date AS "dueDate", i.amount, i.cashflow_entry_id AS "entryId",
            e.status AS "entryStatus", e.description AS "entryDescription"
       FROM purchase_installments i
       LEFT JOIN cashflow_entries e ON e.id = i.cashflow_entry_id
      WHERE i.purchase_id = $1 ORDER BY i.seq`, [id]
  );
  return {
    ...p,
    total_amount: parseFloat(p.total_amount),
    items: items.map(it => ({ ...it, unitPrice: parseFloat(it.unitPrice), total: parseFloat(it.total) })),
    installments: installments.map(i => ({ ...i, amount: parseFloat(i.amount) })),
  };
}

async function existsOrderNumber(orderNumber) {
  const { rows } = await db.query(
    'SELECT id FROM purchases WHERE order_number = $1 LIMIT 1', [String(orderNumber).trim()]
  );
  return rows[0]?.id || null;
}

// Categoria do último lançamento de compra (sugestão); fallback: MATÉRIA PRIMA
async function lastCategoryId() {
  const { rows } = await db.query(
    'SELECT category_id FROM purchases WHERE category_id IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1'
  );
  if (rows[0]?.category_id) return rows[0].category_id;
  const { rows: mat } = await db.query(
    "SELECT id FROM cashflow_categories WHERE UPPER(name) = 'MATÉRIA PRIMA' AND active = true LIMIT 1"
  );
  return mat[0]?.id || null;
}

// Fornecedor por nome (case-insensitive); cria se não existir (cadastro do Custo & Preço)
async function findOrCreateSupplier(client, name) {
  if (!name || !name.trim()) return null;
  const n = name.trim();
  const { rows } = await client.query(
    'SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1', [n]
  );
  if (rows[0]) return rows[0].id;
  const { rows: created } = await client.query(
    'INSERT INTO suppliers (name) VALUES ($1) RETURNING id', [n]
  );
  return created[0].id;
}

const fmtDDMM = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };

/**
 * Cria a compra completa em transação: fornecedor (find-or-create), itens,
 * parcelas e — quando createEntries — os lançamentos pendentes no fluxo de caixa.
 */
async function create({ orderNumber, supplierName, orderDate, totalAmount, totalPieces, paymentTerms, obs,
                        items = [], installments = [], createEntries = false, boxId = null, categoryId = null,
                        filePath = null, fileName = null, createdBy = null }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const supplierId = await findOrCreateSupplier(client, supplierName);

    const { rows: pRows } = await client.query(
      `INSERT INTO purchases (order_number, supplier_id, supplier_name, order_date, total_amount, total_pieces,
                              payment_terms, obs, box_id, category_id, file_path, file_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [String(orderNumber).trim(), supplierId, supplierName.trim(), orderDate, totalAmount, totalPieces || null,
       paymentTerms || null, obs || null, boxId, categoryId, filePath, fileName, createdBy]
    );
    const purchaseId = pRows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO purchase_items (purchase_id, description, size, size_grid, qty, unit_price, total, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [purchaseId, it.description || '(item)', it.size || null, it.sizeGrid || null, it.qty || 0, it.unitPrice || 0, it.total || 0, it.obs || null]
      );
    }

    const n = installments.length;
    for (let idx = 0; idx < n; idx++) {
      const inst = installments[idx];
      let entryId = null;
      if (createEntries && boxId && categoryId) {
        const desc = `PEDIDO ${String(orderNumber).trim()} EM ${fmtDDMM(orderDate)} - ${supplierName.trim().toUpperCase()} PARC ${idx + 1}/${n}`;
        const { rows: eRows } = await client.query(
          `INSERT INTO cashflow_entries (date, category_id, description, type, amount, status, created_by, box_id)
           VALUES ($1,$2,$3,'expense',$4,'pending',$5,$6) RETURNING id`,
          [inst.dueDate, categoryId, desc, inst.amount, createdBy, boxId]
        );
        entryId = eRows[0].id;
      }
      await client.query(
        `INSERT INTO purchase_installments (purchase_id, seq, due_date, amount, cashflow_entry_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [purchaseId, idx + 1, inst.dueDate, inst.amount, entryId]
      );
    }

    await client.query('COMMIT');
    return { id: purchaseId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Exclui a compra. BLOQUEADA se alguma parcela ligada ao fluxo estiver paga (status ok).
 * Sem parcelas pagas: remove a compra e os lançamentos pendentes que ela criou.
 */
async function remove(id) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows: paid } = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM purchase_installments i
         JOIN cashflow_entries e ON e.id = i.cashflow_entry_id
        WHERE i.purchase_id = $1 AND e.status = 'ok'`, [id]
    );
    if (paid[0].n > 0) {
      await client.query('ROLLBACK');
      return { blocked: true, paidCount: paid[0].n };
    }
    const { rows: entries } = await client.query(
      'SELECT cashflow_entry_id AS id FROM purchase_installments WHERE purchase_id = $1 AND cashflow_entry_id IS NOT NULL', [id]
    );
    const { rows: del } = await client.query('DELETE FROM purchases WHERE id = $1 RETURNING file_path AS "filePath"', [id]);
    if (!del[0]) { await client.query('ROLLBACK'); return null; }
    if (entries.length) {
      await client.query('DELETE FROM cashflow_entries WHERE id = ANY($1::bigint[])', [entries.map(e => e.id)]);
    }
    await client.query('COMMIT');
    return { deleted: true, filePath: del[0].filePath };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, get, create, remove, existsOrderNumber, lastCategoryId };
