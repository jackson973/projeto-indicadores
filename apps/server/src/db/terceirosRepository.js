const db = require('./connection');

const BATCH_SIZE = 500;

// ── OFs ─────────────────────────────────────────────────────────────────────

async function batchUpsertOfs(ofsData) {
  if (!ofsData || ofsData.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // Deduplicate by composite key
  const deduped = new Map();
  ofsData.forEach((of) => {
    const key = `${of.facNumero}|${of.facCodsetor || ''}|${of.facCodigoProduto || ''}|${of.facCor || ''}|${of.facParte || ''}|${of.facTam || ''}`;
    deduped.set(key, of);
  });

  const uniqueData = Array.from(deduped.values());
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < uniqueData.length; i += BATCH_SIZE) {
    const batch = uniqueData.slice(i, i + BATCH_SIZE);
    const result = await upsertOfBatch(batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
  }

  return { inserted: totalInserted, updated: totalUpdated };
}

async function upsertOfBatch(batch) {
  const client = await db.getClient();
  const COLS = 34;

  try {
    await client.query('BEGIN');

    const values = [];
    const params = [];
    let paramIndex = 1;

    batch.forEach((of) => {
      const rowParams = [
        of.facNumero,
        of.facLancto || null,
        of.facDtS || null,
        of.facDtLan || null,
        of.facDtPrevRet || null,
        of.facCodsetor || null,
        of.facDescsetor || null,
        of.facQtOrig || 0,
        of.facQuant || 0,
        of.facTam || null,
        of.facCor || null,
        of.facDesccor || null,
        of.facParte || null,
        of.facDescparte || null,
        of.facCodigoProduto || null,
        of.facDescProduto || null,
        of.produtoUnidade || null,
        of.facCodcli || null,
        of.clienteNome || null,
        of.dddFone || null,
        of.clienteFone || null,
        of.foneCompl || null,
        of.clienteEndereco || null,
        of.numEnd || null,
        of.clienteBairro || null,
        of.clienteCep || null,
        of.clienteUf || null,
        of.clienteCidade || null,
        of.clienteComplemento || null,
        of.clienteCnpj || null,
        of.clienteInscricao || null,
        of.clienteFantasia || null,
        of.clienteFax || null,
        of.facPeriodoOf || null,
        // settlement_id is NOT set during sync
      ];

      const placeholders = rowParams.map((_, idx) => `$${paramIndex + idx}`).join(', ');
      values.push(`(${placeholders})`);
      params.push(...rowParams);
      paramIndex += COLS;
    });

    const query = `
      INSERT INTO terceiros_ofs (
        fac_numero, fac_lancto, fac_dt_s, fac_dt_lan, fac_dt_prev_ret,
        fac_codsetor, fac_descsetor, fac_qt_orig, fac_quant,
        fac_tam, fac_cor, fac_desccor, fac_parte, fac_descparte,
        fac_codigo_produto, fac_desc_produto, produto_unidade,
        fac_codcli, cliente_nome, ddd_fone, cliente_fone, fone_compl,
        cliente_endereco, num_end, cliente_bairro, cliente_cep,
        cliente_uf, cliente_cidade, cliente_complemento,
        cliente_cnpj, cliente_inscricao, cliente_fantasia, cliente_fax,
        fac_periodo_of
      ) VALUES ${values.join(', ')}
      ON CONFLICT (
        fac_numero,
        COALESCE(fac_codsetor, ''),
        COALESCE(fac_codigo_produto, ''),
        COALESCE(fac_cor, ''),
        COALESCE(fac_parte, ''),
        COALESCE(fac_tam, '')
      )
      DO UPDATE SET
        fac_lancto = EXCLUDED.fac_lancto,
        fac_dt_s = EXCLUDED.fac_dt_s,
        fac_dt_lan = EXCLUDED.fac_dt_lan,
        fac_dt_prev_ret = EXCLUDED.fac_dt_prev_ret,
        fac_descsetor = EXCLUDED.fac_descsetor,
        fac_qt_orig = EXCLUDED.fac_qt_orig,
        fac_quant = EXCLUDED.fac_quant,
        fac_desccor = EXCLUDED.fac_desccor,
        fac_descparte = EXCLUDED.fac_descparte,
        fac_desc_produto = EXCLUDED.fac_desc_produto,
        produto_unidade = EXCLUDED.produto_unidade,
        fac_codcli = EXCLUDED.fac_codcli,
        cliente_nome = EXCLUDED.cliente_nome,
        ddd_fone = EXCLUDED.ddd_fone,
        cliente_fone = EXCLUDED.cliente_fone,
        fone_compl = EXCLUDED.fone_compl,
        cliente_endereco = EXCLUDED.cliente_endereco,
        num_end = EXCLUDED.num_end,
        cliente_bairro = EXCLUDED.cliente_bairro,
        cliente_cep = EXCLUDED.cliente_cep,
        cliente_uf = EXCLUDED.cliente_uf,
        cliente_cidade = EXCLUDED.cliente_cidade,
        cliente_complemento = EXCLUDED.cliente_complemento,
        cliente_cnpj = EXCLUDED.cliente_cnpj,
        cliente_inscricao = EXCLUDED.cliente_inscricao,
        cliente_fantasia = EXCLUDED.cliente_fantasia,
        cliente_fax = EXCLUDED.cliente_fax,
        fac_periodo_of = EXCLUDED.fac_periodo_of,
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted
    `;

    const result = await client.query(query, params);
    await client.query('COMMIT');

    const inserted = result.rows.filter(r => r.inserted).length;
    const updated = result.rows.length - inserted;
    return { inserted, updated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getOfs({ codcli, month, year, dateFrom, dateTo, facNumero, ids, unsettledOnly, limit, offset }) {
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (ids) {
    const idList = String(ids).split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
    if (idList.length === 0) {
      return { rows: [], total: 0 };
    }
    const placeholders = idList.map(() => `$${idx++}`);
    conditions.push(`o.id IN (${placeholders.join(', ')})`);
    params.push(...idList);
  }

  if (codcli) {
    conditions.push(`o.fac_codcli = $${idx++}`);
    params.push(codcli);
  }
  if (dateFrom && dateTo) {
    conditions.push(`o.fac_dt_prev_ret >= $${idx++}`);
    params.push(dateFrom);
    conditions.push(`o.fac_dt_prev_ret <= $${idx++}`);
    params.push(dateTo);
  } else if (dateFrom) {
    conditions.push(`o.fac_dt_prev_ret >= $${idx++}`);
    params.push(dateFrom);
  } else if (dateTo) {
    conditions.push(`o.fac_dt_prev_ret <= $${idx++}`);
    params.push(dateTo);
  } else if (month && year) {
    conditions.push(`EXTRACT(MONTH FROM o.fac_dt_prev_ret) = $${idx++}`);
    params.push(month);
    conditions.push(`EXTRACT(YEAR FROM o.fac_dt_prev_ret) = $${idx++}`);
    params.push(year);
  }
  if (facNumero) {
    // Support multiple OF numbers separated by comma
    const ofNumbers = facNumero.split(',').map(n => n.trim()).filter(Boolean);
    if (ofNumbers.length === 1) {
      conditions.push(`o.fac_numero ILIKE $${idx++}`);
      params.push(`%${ofNumbers[0]}%`);
    } else if (ofNumbers.length > 1) {
      const placeholders = ofNumbers.map((n) => `$${idx++}`);
      conditions.push(`o.fac_numero IN (${placeholders.join(', ')})`);
      params.push(...ofNumbers);
    }
  }
  // When unsettledOnly, still return settled OFs but mark them so UI can show a warning
  const settledJoin = (unsettledOnly === true || unsettledOnly === 'true')
    ? `LEFT JOIN terceiros_settlements s ON s.id = o.settlement_id`
    : '';
  const settledColumns = (unsettledOnly === true || unsettledOnly === 'true')
    ? `, s.reference_month AS "settlementMonth", s.reference_year AS "settlementYear", s.id AS "settlementId"`
    : '';

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM terceiros_ofs o WHERE ${conditions.join(' AND ')}`,
    params
  );

  const orderBy = (unsettledOnly === true || unsettledOnly === 'true')
    ? 'ORDER BY (o.settlement_id IS NOT NULL), o.fac_numero, o.fac_codigo_produto'
    : 'ORDER BY o.fac_numero, o.fac_codigo_produto';
  let limitClause = '';
  if (limit) {
    limitClause = ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset || 0);
  }

  const result = await db.query(
    `SELECT o.*,
            gp.group_id AS "groupId",
            pg.name AS "groupName"
            ${settledColumns}
     FROM terceiros_ofs o
     LEFT JOIN terceiros_group_products gp ON gp.product_code = o.fac_codigo_produto
     LEFT JOIN terceiros_product_groups pg ON pg.id = gp.group_id AND pg.active = true
     ${settledJoin}
     WHERE ${conditions.join(' AND ')}
     ${orderBy}${limitClause}`,
    params
  );

  return { rows: result.rows, total: countResult.rows[0].total };
}

async function getDistinctSuppliers() {
  const result = await db.query(
    `SELECT fac_codcli AS "codcli",
            MAX(COALESCE(NULLIF(TRIM(cliente_fantasia), ''), NULLIF(TRIM(cliente_nome), ''), fac_codcli)) AS "nome"
     FROM terceiros_ofs
     WHERE fac_codcli IS NOT NULL
     GROUP BY fac_codcli
     ORDER BY 2`
  );
  return result.rows;
}

async function getDistinctProducts() {
  const result = await db.query(
    `SELECT DISTINCT o.fac_codigo_produto AS "code", o.fac_desc_produto AS "name",
            gp.group_id AS "groupId", pg.name AS "groupName"
     FROM terceiros_ofs o
     LEFT JOIN terceiros_group_products gp ON TRIM(gp.product_code) = TRIM(o.fac_codigo_produto)
     LEFT JOIN terceiros_product_groups pg ON pg.id = gp.group_id AND pg.active = true
     WHERE o.fac_codigo_produto IS NOT NULL
     ORDER BY o.fac_desc_produto`
  );
  return result.rows;
}

async function getDistinctParts({ codcli, groupId } = {}) {
  const conditions = ['o.fac_parte IS NOT NULL'];
  const params = [];
  let idx = 1;

  if (codcli) {
    conditions.push(`TRIM(o.fac_codcli::text) = TRIM($${idx++}::text)`);
    params.push(String(codcli).trim());
  }
  if (groupId) {
    conditions.push(`gp.group_id = $${idx++}::integer`);
    params.push(parseInt(groupId));
  }

  const joinClause = groupId
    ? 'INNER JOIN terceiros_group_products gp ON TRIM(gp.product_code) = TRIM(o.fac_codigo_produto)'
    : '';

  const sql = `SELECT DISTINCT o.fac_parte AS "code", o.fac_descparte AS "name"
     FROM terceiros_ofs o
     ${joinClause}
     WHERE ${conditions.join(' AND ')}
     ORDER BY o.fac_descparte`;

  console.log('[getDistinctParts] SQL:', sql, 'Params:', params);

  const result = await db.query(sql, params);
  return result.rows;
}

// ── Product Groups ──────────────────────────────────────────────────────────

async function getProductGroups() {
  const result = await db.query(
    `SELECT pg.id, pg.name, pg.active,
            COUNT(gp.id)::int AS "productCount",
            pg.created_at AS "createdAt", pg.updated_at AS "updatedAt"
     FROM terceiros_product_groups pg
     LEFT JOIN terceiros_group_products gp ON gp.group_id = pg.id
     WHERE pg.active = true
     GROUP BY pg.id
     ORDER BY pg.name`
  );
  return result.rows;
}

async function createProductGroup(name) {
  const result = await db.query(
    `INSERT INTO terceiros_product_groups (name)
     VALUES ($1)
     RETURNING id, name, active, created_at AS "createdAt"`,
    [name]
  );
  return result.rows[0];
}

async function updateProductGroup(id, name) {
  const result = await db.query(
    `UPDATE terceiros_product_groups SET name = $1
     WHERE id = $2 AND active = true
     RETURNING id, name, active`,
    [name, id]
  );
  return result.rows[0] || null;
}

async function deleteProductGroup(id) {
  // Check if group has supplier prices
  const usage = await db.query(
    `SELECT COUNT(*)::int AS count FROM terceiros_supplier_prices WHERE group_id = $1`,
    [id]
  );
  if (usage.rows[0].count > 0) {
    return { inUse: true, count: usage.rows[0].count };
  }
  const result = await db.query(
    `UPDATE terceiros_product_groups SET active = false WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rowCount > 0 ? { deleted: true } : { deleted: false };
}

async function getGroupProducts(groupId) {
  const result = await db.query(
    `SELECT id, group_id AS "groupId", product_code AS "productCode",
            product_name AS "productName", created_at AS "createdAt"
     FROM terceiros_group_products
     WHERE group_id = $1
     ORDER BY product_name`,
    [groupId]
  );
  return result.rows;
}

async function addProductToGroup(groupId, productCode, productName) {
  // Remove from any existing group first (product can only be in 1 group)
  await db.query('DELETE FROM terceiros_group_products WHERE product_code = $1', [productCode]);

  const result = await db.query(
    `INSERT INTO terceiros_group_products (group_id, product_code, product_name)
     VALUES ($1, $2, $3)
     RETURNING id, group_id AS "groupId", product_code AS "productCode", product_name AS "productName"`,
    [groupId, productCode, productName]
  );
  return result.rows[0];
}

async function removeProductFromGroup(groupId, productCode) {
  const result = await db.query(
    'DELETE FROM terceiros_group_products WHERE group_id = $1 AND product_code = $2 RETURNING id',
    [groupId, productCode]
  );
  return result.rowCount > 0;
}

async function addProductsToGroupBatch(groupId, products) {
  const results = [];
  for (const p of products) {
    const row = await addProductToGroup(groupId, p.code, p.name || '');
    results.push(row);
  }
  return results;
}

async function removeProductsFromGroupBatch(groupId, productCodes) {
  const result = await db.query(
    'DELETE FROM terceiros_group_products WHERE group_id = $1 AND product_code = ANY($2::text[]) RETURNING id',
    [groupId, productCodes]
  );
  return result.rowCount;
}

// ── Supplier Prices ─────────────────────────────────────────────────────────

async function getSupplierPrices({ codcli, groupId } = {}) {
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (codcli) {
    conditions.push(`sp.codcli = $${idx++}`);
    params.push(codcli);
  }
  if (groupId) {
    conditions.push(`sp.group_id = $${idx++}`);
    params.push(groupId);
  }

  const result = await db.query(
    `SELECT sp.id, sp.codcli, sp.supplier_name AS "supplierName",
            sp.group_id AS "groupId", pg.name AS "groupName",
            sp.part, sp.etapa, sp.tamanho, sp.price, sp.valid_from AS "validFrom", sp.valid_until AS "validUntil",
            sp.created_at AS "createdAt", sp.updated_at AS "updatedAt",
            (SELECT o.fac_descparte FROM terceiros_ofs o
             WHERE o.fac_parte = sp.part LIMIT 1) AS "partName",
            (SELECT o.fac_descsetor FROM terceiros_ofs o
             WHERE o.fac_codsetor = sp.etapa LIMIT 1) AS "etapaName"
     FROM terceiros_supplier_prices sp
     INNER JOIN terceiros_product_groups pg ON pg.id = sp.group_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sp.codcli, pg.name, sp.part, sp.etapa, sp.tamanho, sp.valid_from DESC`,
    params
  );
  return result.rows;
}

async function checkPriceOverlap(codcli, groupId, part, validFrom, validUntil, excludeId, etapa, tamanho) {
  const partCondition = part
    ? 'sp.part = $4'
    : '(sp.part IS NULL OR sp.part = $4)';
  const etapaCondition = etapa
    ? 'sp.etapa = $6'
    : '(sp.etapa IS NULL OR sp.etapa = $6)';
  const tamanhoCondition = tamanho
    ? 'sp.tamanho = $7'
    : '(sp.tamanho IS NULL OR sp.tamanho = $7)';
  const params = [codcli, groupId, validFrom, part || null, validUntil, etapa || null, tamanho || null];
  let excludeClause = '';
  if (excludeId) {
    excludeClause = ' AND sp.id != $8';
    params.push(excludeId);
  }

  const result = await db.query(
    `SELECT sp.id, sp.valid_from, sp.valid_until
     FROM terceiros_supplier_prices sp
     WHERE sp.codcli = $1 AND sp.group_id = $2 AND ${partCondition} AND ${etapaCondition} AND ${tamanhoCondition}
       AND sp.valid_from <= $5 AND sp.valid_until >= $3
       ${excludeClause}`,
    params
  );
  return result.rows;
}

async function createSupplierPrice({ codcli, supplierName, groupId, part, etapa, tamanho, price, validFrom, validUntil }) {
  const overlaps = await checkPriceOverlap(codcli, groupId, part, validFrom, validUntil, null, etapa, tamanho);
  if (overlaps.length > 0) {
    const o = overlaps[0];
    throw new Error(`Sobreposicao de datas com vigencia existente: ${o.valid_from} a ${o.valid_until}`);
  }

  const result = await db.query(
    `INSERT INTO terceiros_supplier_prices (codcli, supplier_name, group_id, part, etapa, tamanho, price, valid_from, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, codcli, supplier_name AS "supplierName", group_id AS "groupId",
               part, etapa, tamanho, price, valid_from AS "validFrom", valid_until AS "validUntil"`,
    [codcli, supplierName, groupId, part || null, etapa || null, tamanho || null, price, validFrom, validUntil]
  );
  return result.rows[0];
}

async function updateSupplierPrice(id, { codcli, supplierName, groupId, part, etapa, tamanho, price, validFrom, validUntil }) {
  const overlaps = await checkPriceOverlap(codcli, groupId, part, validFrom, validUntil, id, etapa, tamanho);
  if (overlaps.length > 0) {
    const o = overlaps[0];
    throw new Error(`Sobreposicao de datas com vigencia existente: ${o.valid_from} a ${o.valid_until}`);
  }

  const result = await db.query(
    `UPDATE terceiros_supplier_prices
     SET codcli = $1, supplier_name = $2, group_id = $3, part = $4,
         etapa = $5, tamanho = $6, price = $7, valid_from = $8, valid_until = $9
     WHERE id = $10
     RETURNING id, codcli, supplier_name AS "supplierName", group_id AS "groupId",
               part, etapa, tamanho, price, valid_from AS "validFrom", valid_until AS "validUntil"`,
    [codcli, supplierName, groupId, part || null, etapa || null, tamanho || null, price, validFrom, validUntil, id]
  );
  return result.rows[0] || null;
}

async function deleteSupplierPrice(id) {
  const result = await db.query(
    'DELETE FROM terceiros_supplier_prices WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount > 0;
}

async function findPrice(codcli, productCode, part, date, etapa, tamanho) {
  // Find the group for this product
  const groupResult = await db.query(
    `SELECT gp.group_id, pg.name AS group_name FROM terceiros_group_products gp
     INNER JOIN terceiros_product_groups pg ON pg.id = gp.group_id AND pg.active = true
     WHERE TRIM(gp.product_code) = TRIM($1)`,
    [productCode]
  );
  if (groupResult.rows.length === 0) {
    // Log only once per product (caller may invoke per-size)
    if (!findPrice._warned) findPrice._warned = new Set();
    const warnKey = `${codcli}|${productCode}`;
    if (!findPrice._warned.has(warnKey)) {
      findPrice._warned.add(warnKey);
      console.log(`[findPrice] No group found for product "${productCode}" (codcli=${codcli})`);
    }
    return {
      price: null, source: 'no_group',
      error: `Produto ${productCode} nao pertence a nenhum grupo cadastrado`
    };
  }

  const groupId = groupResult.rows[0].group_id;
  const groupName = groupResult.rows[0].group_name;

  // Find price for this supplier + group + part + etapa + tamanho + date
  // Priority: specific tamanho+etapa+part > specific etapa+part > specific etapa > specific part > generic
  // tamanho is stored comma-separated (e.g. "P,M,G"); match if tamanho IS NULL or contains the OF's tamanho
  const priceResult = await db.query(
    `SELECT price FROM terceiros_supplier_prices
     WHERE TRIM(codcli) = TRIM($1) AND group_id = $2
       AND (TRIM(part) = TRIM($3) OR part IS NULL)
       AND (TRIM(etapa) = TRIM($5) OR etapa IS NULL)
       AND (tamanho IS NULL OR $6::text IS NULL OR tamanho ~* ('(^|,)\\s*' || $6::text || '\\s*(,|$)'))
       AND (valid_from IS NULL OR valid_from <= $4)
       AND (valid_until IS NULL OR valid_until >= $4)
     ORDER BY
       CASE WHEN tamanho IS NOT NULL AND $6 IS NOT NULL THEN 0 ELSE 1 END,
       CASE WHEN TRIM(etapa) = TRIM($5) THEN 0 ELSE 1 END,
       CASE WHEN TRIM(part) = TRIM($3) THEN 0 ELSE 1 END,
       valid_from DESC NULLS LAST
     LIMIT 1`,
    [codcli, groupId, part, date, etapa || null, tamanho || null]
  );

  if (priceResult.rows.length === 0) {
    console.log(`[findPrice] No price found for codcli="${codcli}", group="${groupName}"(${groupId}), part="${part}", etapa="${etapa}", tamanho="${tamanho}", date="${date}"`);
    return {
      price: null, source: 'no_price', groupId, groupName,
      error: `Sem preco vigente para grupo "${groupName}", parte "${part || 'todas'}", tamanho "${tamanho || 'todos'}" na data ${date}`
    };
  }

  return { price: parseFloat(priceResult.rows[0].price), source: 'table', groupId, groupName };
}

async function getDistinctSizes(codcli, groupId) {
  // groupId is required to ensure sizes are scoped to products in the group
  if (!groupId) return [];

  const params = [groupId];
  const extraConditions = [];

  if (codcli) {
    extraConditions.push(`o.fac_codcli = $${params.length + 1}`);
    params.push(codcli);
  }

  const whereExtra = extraConditions.length > 0
    ? `AND ${extraConditions.join(' AND ')}`
    : '';

  const result = await db.query(
    `SELECT DISTINCT TRIM(o.fac_tam) AS tamanho
     FROM terceiros_ofs o
     INNER JOIN terceiros_group_products gp
       ON TRIM(gp.product_code) = TRIM(o.fac_codigo_produto)
      AND gp.group_id = $1
     WHERE o.fac_tam IS NOT NULL
       AND TRIM(o.fac_tam) != ''
       ${whereExtra}`,
    params
  );

  const SIZE_ORDER = ['RN','P','M','G','GG','1','2','3','4','6','8','10'];
  const sizes = result.rows.map((r) => r.tamanho);
  return sizes.sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

async function getEtapas(codcli) {
  const conditions = ["o.fac_codsetor IS NOT NULL", "o.fac_codsetor != ''"];
  const params = [];
  if (codcli) {
    conditions.push(`o.fac_codcli = $1`);
    params.push(codcli);
  }
  const result = await db.query(
    `SELECT DISTINCT o.fac_codsetor AS code, o.fac_descsetor AS name
     FROM terceiros_ofs o
     WHERE ${conditions.join(' AND ')}
     ORDER BY o.fac_codsetor`,
    params
  );
  return result.rows;
}

// ── Settlements ─────────────────────────────────────────────────────────────

async function getSettlements({ codcli, month, year, status } = {}) {
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (codcli) {
    conditions.push(`s.codcli = $${idx++}`);
    params.push(codcli);
  }
  if (month) {
    conditions.push(`s.reference_month = $${idx++}`);
    params.push(month);
  }
  if (year) {
    conditions.push(`s.reference_year = $${idx++}`);
    params.push(year);
  }
  if (status && status !== 'all') {
    conditions.push(`s.status = $${idx++}`);
    params.push(status);
  }

  const result = await db.query(
    `SELECT s.id, s.codcli, s.supplier_name AS "supplierName",
            s.reference_month AS "referenceMonth", s.reference_year AS "referenceYear",
            s.total_amount AS "totalAmount", s.total_items AS "totalItems",
            s.status, s.paid_at AS "paidAt", s.notes,
            s.total_discounts AS "totalDiscounts", s.total_payable AS "totalPayable",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            u.name AS "createdByName",
            (
              SELECT COUNT(*)::int FROM terceiros_ofs o
              WHERE o.fac_codcli = s.codcli
                AND o.settlement_id IS NULL
                AND EXISTS (
                  SELECT 1 FROM terceiros_settlement_items si
                  INNER JOIN terceiros_ofs o2 ON o2.id = si.of_id
                  WHERE si.settlement_id = s.id
                    AND COALESCE(o2.fac_numero, '') = COALESCE(o.fac_numero, '')
                    AND COALESCE(o2.fac_codsetor, '') = COALESCE(o.fac_codsetor, '')
                    AND COALESCE(o2.fac_codigo_produto, '') = COALESCE(o.fac_codigo_produto, '')
                    AND COALESCE(o2.fac_cor, '') = COALESCE(o.fac_cor, '')
                    AND COALESCE(o2.fac_parte, '') = COALESCE(o.fac_parte, '')
                )
            ) AS "missingCount",
            (
              SELECT STRING_AGG(DISTINCT COALESCE(o.fac_descsetor, o.fac_codsetor, ''), ', '
                     ORDER BY COALESCE(o.fac_descsetor, o.fac_codsetor, ''))
              FROM terceiros_settlement_items si
              JOIN terceiros_ofs o ON o.id = si.of_id
              WHERE si.settlement_id = s.id
                AND COALESCE(o.fac_descsetor, o.fac_codsetor, '') != ''
            ) AS "etapas"
     FROM terceiros_settlements s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.status = 'draft' DESC, s.reference_year DESC, s.reference_month DESC, s.supplier_name`,
    params
  );
  return result.rows;
}

async function getSettlement(id) {
  const settlement = await db.query(
    `SELECT s.id, s.codcli, s.supplier_name AS "supplierName",
            s.reference_month AS "referenceMonth", s.reference_year AS "referenceYear",
            s.total_amount AS "totalAmount", s.total_items AS "totalItems",
            s.total_discounts AS "totalDiscounts", s.total_payable AS "totalPayable",
            s.status, s.paid_at AS "paidAt", s.notes,
            s.created_at AS "createdAt"
     FROM terceiros_settlements s WHERE s.id = $1`,
    [id]
  );
  if (settlement.rows.length === 0) return null;

  const items = await db.query(
    `SELECT si.id, si.of_id AS "ofId", si.quantity, si.unit_price AS "unitPrice",
            si.total_price AS "totalPrice", si.price_source AS "priceSource",
            si.manually_edited AS "manuallyEdited",
            si.original_quantity AS "originalQuantity",
            si.original_unit_price AS "originalUnitPrice",
            o.fac_numero AS "facNumero", o.fac_codsetor AS "facCodsetor",
            o.fac_descsetor AS "facDescsetor",
            o.fac_codigo_produto AS "facCodigoProduto", o.fac_desc_produto AS "facDescProduto",
            o.fac_cor AS "facCor", o.fac_desccor AS "facDesccor",
            o.fac_parte AS "facParte", o.fac_descparte AS "facDescparte",
            o.fac_tam AS "facTam", o.fac_qt_orig AS "facQtOrig", o.fac_quant AS "facQuant",
            o.fac_dt_lan AS "facDtLan", o.fac_dt_prev_ret AS "facDtPrevRet"
     FROM terceiros_settlement_items si
     INNER JOIN terceiros_ofs o ON o.id = si.of_id
     WHERE si.settlement_id = $1
     ORDER BY o.fac_numero, o.fac_codigo_produto`,
    [id]
  );

  // Get discounts
  const discounts = await db.query(
    `SELECT id, description, amount, created_at AS "createdAt"
     FROM terceiros_settlement_discounts WHERE settlement_id = $1
     ORDER BY created_at`,
    [id]
  );

  // Find missing OFs: same OF/product/color/part/etapa but NOT in this settlement
  const missingOfs = await db.query(
    `SELECT o.id, o.fac_numero AS "facNumero",
            o.fac_codsetor AS "facCodsetor", o.fac_descsetor AS "facDescsetor",
            o.fac_codigo_produto AS "facCodigoProduto", o.fac_desc_produto AS "facDescProduto",
            o.fac_cor AS "facCor", o.fac_desccor AS "facDesccor",
            o.fac_parte AS "facParte", o.fac_descparte AS "facDescparte",
            o.fac_tam AS "facTam", o.fac_quant AS "facQuant"
     FROM terceiros_ofs o
     WHERE o.fac_codcli = $1
       AND o.id NOT IN (SELECT of_id FROM terceiros_settlement_items WHERE settlement_id = $2)
       AND EXISTS (
         SELECT 1 FROM terceiros_settlement_items si
         INNER JOIN terceiros_ofs o2 ON o2.id = si.of_id
         WHERE si.settlement_id = $2
           AND COALESCE(o2.fac_numero, '') = COALESCE(o.fac_numero, '')
           AND COALESCE(o2.fac_codsetor, '') = COALESCE(o.fac_codsetor, '')
           AND COALESCE(o2.fac_codigo_produto, '') = COALESCE(o.fac_codigo_produto, '')
           AND COALESCE(o2.fac_cor, '') = COALESCE(o.fac_cor, '')
           AND COALESCE(o2.fac_parte, '') = COALESCE(o.fac_parte, '')
       )
     ORDER BY o.fac_numero, o.fac_codigo_produto, o.fac_tam`,
    [settlement.rows[0].codcli, id]
  );

  return { ...settlement.rows[0], items: items.rows, missingOfs: missingOfs.rows, discounts: discounts.rows };
}

async function createSettlement({ codcli, supplierName, referenceMonth, referenceYear, notes, createdBy, items, discounts }) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Create settlement
    const settResult = await client.query(
      `INSERT INTO terceiros_settlements (codcli, supplier_name, reference_month, reference_year, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [codcli, supplierName, referenceMonth, referenceYear, notes || null, createdBy]
    );
    const settlementId = settResult.rows[0].id;

    let totalAmount = 0;
    let totalItems = 0;

    // Insert items
    for (const item of items) {
      const totalPrice = parseFloat((item.quantity * item.unitPrice).toFixed(2));
      const manuallyEdited = item.manuallyEdited || false;
      await client.query(
        `INSERT INTO terceiros_settlement_items (settlement_id, of_id, quantity, unit_price, total_price, price_source, original_quantity, original_unit_price, manually_edited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [settlementId, item.ofId, item.quantity, item.unitPrice, totalPrice, item.priceSource || 'table',
         manuallyEdited ? item.originalQuantity : null,
         manuallyEdited ? item.originalUnitPrice : null,
         manuallyEdited]
      );

      // Mark OF as settled
      await client.query(
        'UPDATE terceiros_ofs SET settlement_id = $1 WHERE id = $2',
        [settlementId, item.ofId]
      );

      totalAmount += totalPrice;
      totalItems += parseFloat(item.quantity) || 0;
    }

    // Insert discounts if any
    if (discounts && discounts.length > 0) {
      for (const disc of discounts) {
        if (disc.description && parseFloat(disc.amount) > 0) {
          await client.query(
            `INSERT INTO terceiros_settlement_discounts (settlement_id, description, amount)
             VALUES ($1, $2, $3)`,
            [settlementId, disc.description, parseFloat(disc.amount).toFixed(2)]
          );
        }
      }
    }

    // Recalculate all totals (amount, discounts, payable)
    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);

    await client.query('COMMIT');
    return { id: settlementId, ...totals };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function saveDraft({ id, codcli, supplierName, referenceMonth, referenceYear, notes, createdBy, draftData }) {
  if (id) {
    // Update existing draft
    const result = await db.query(
      `UPDATE terceiros_settlements
       SET codcli = $1, supplier_name = $2, reference_month = $3, reference_year = $4,
           notes = $5, draft_data = $6
       WHERE id = $7 AND status = 'draft'
       RETURNING id`,
      [codcli, supplierName || null, referenceMonth, referenceYear, notes || null, draftData || {}, id]
    );
    if (result.rows.length === 0) throw new Error('Rascunho não encontrado.');
    return result.rows[0];
  }

  // Create new draft
  const result = await db.query(
    `INSERT INTO terceiros_settlements (codcli, supplier_name, reference_month, reference_year, notes, status, created_by, draft_data, total_amount, total_items)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, 0, 0)
     RETURNING id`,
    [codcli, supplierName || null, referenceMonth, referenceYear, notes || null, createdBy, draftData || {}]
  );
  return result.rows[0];
}

async function getDraft(id) {
  const result = await db.query(
    `SELECT s.id, s.codcli, s.supplier_name AS "supplierName",
            s.reference_month AS "referenceMonth", s.reference_year AS "referenceYear",
            s.notes, s.draft_data AS "draftData",
            s.created_by AS "createdBy", u.name AS "createdByName",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt"
     FROM terceiros_settlements s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.id = $1 AND s.status = 'draft'`,
    [id]
  );
  return result.rows[0] || null;
}

async function promoteDraft(id, { items, discounts }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verify it's a draft
    const check = await client.query('SELECT id, codcli FROM terceiros_settlements WHERE id = $1 AND status = $2', [id, 'draft']);
    if (check.rows.length === 0) throw new Error('Rascunho não encontrado.');

    let totalAmount = 0;
    let totalItems = 0;

    for (const item of items) {
      const totalPrice = parseFloat((item.quantity * item.unitPrice).toFixed(2));
      const manuallyEdited = item.manuallyEdited || false;
      await client.query(
        `INSERT INTO terceiros_settlement_items (settlement_id, of_id, quantity, unit_price, total_price, price_source, original_quantity, original_unit_price, manually_edited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, item.ofId, item.quantity, item.unitPrice, totalPrice, item.priceSource || 'table',
         manuallyEdited ? item.originalQuantity : null,
         manuallyEdited ? item.originalUnitPrice : null,
         manuallyEdited]
      );

      await client.query('UPDATE terceiros_ofs SET settlement_id = $1 WHERE id = $2', [id, item.ofId]);
      totalAmount += totalPrice;
      totalItems += parseFloat(item.quantity) || 0;
    }

    if (discounts && discounts.length > 0) {
      for (const disc of discounts) {
        if (disc.description && parseFloat(disc.amount) > 0) {
          await client.query(
            `INSERT INTO terceiros_settlement_discounts (settlement_id, description, amount) VALUES ($1, $2, $3)`,
            [id, disc.description, parseFloat(disc.amount).toFixed(2)]
          );
        }
      }
    }

    // Promote to open and clear draft_data
    await client.query(
      `UPDATE terceiros_settlements SET status = 'open', draft_data = NULL,
              total_amount = $2, total_items = $3
       WHERE id = $1`,
      [id, totalAmount, totalItems]
    );

    const totals = await recalcSettlementTotals(client.query.bind(client), id);
    await client.query('COMMIT');
    return { id, ...totals };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markSettlementPaid(id) {
  const result = await db.query(
    `UPDATE terceiros_settlements SET status = 'paid', paid_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING id, status, paid_at AS "paidAt"`,
    [id]
  );
  return result.rows[0] || null;
}

async function markSettlementUnpaid(id) {
  const result = await db.query(
    `UPDATE terceiros_settlements SET status = 'open', paid_at = NULL
     WHERE id = $1 RETURNING id, status`,
    [id]
  );
  return result.rows[0] || null;
}

async function deleteSettlement(id) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Remove settlement reference from OFs
    await client.query('UPDATE terceiros_ofs SET settlement_id = NULL WHERE settlement_id = $1', [id]);

    // Delete items (cascaded, but explicit for clarity)
    await client.query('DELETE FROM terceiros_settlement_items WHERE settlement_id = $1', [id]);

    // Delete settlement
    await client.query('DELETE FROM terceiros_settlements WHERE id = $1', [id]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateSettlement(id, { notes, referenceMonth, referenceYear } = {}) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (notes !== undefined) {
    fields.push(`notes = $${idx++}`);
    values.push(notes || null);
  }
  if (referenceMonth !== undefined) {
    fields.push(`reference_month = $${idx++}`);
    values.push(referenceMonth);
  }
  if (referenceYear !== undefined) {
    fields.push(`reference_year = $${idx++}`);
    values.push(referenceYear);
  }

  if (fields.length === 0) return null;

  values.push(id);
  const result = await db.query(
    `UPDATE terceiros_settlements SET ${fields.join(', ')}
     WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function removeSettlementItem(settlementId, itemId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Get item to find the OF
    const item = await client.query(
      'SELECT of_id, total_price FROM terceiros_settlement_items WHERE id = $1 AND settlement_id = $2',
      [itemId, settlementId]
    );
    if (item.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const { of_id, total_price } = item.rows[0];

    // Remove settlement reference from OF
    await client.query('UPDATE terceiros_ofs SET settlement_id = NULL WHERE id = $1', [of_id]);

    // Delete item
    await client.query('DELETE FROM terceiros_settlement_items WHERE id = $1', [itemId]);

    // Recalculate totals
    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);

    await client.query('COMMIT');
    return { removed: true, ...totals };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateSettlementItem(settlementId, itemId, { quantity, unitPrice }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Get current item
    const item = await client.query(
      'SELECT id, quantity, unit_price, original_quantity, original_unit_price, manually_edited FROM terceiros_settlement_items WHERE id = $1 AND settlement_id = $2',
      [itemId, settlementId]
    );
    if (item.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = item.rows[0];
    const newQty = quantity != null ? parseFloat(quantity) : parseFloat(current.quantity);
    const newPrice = unitPrice != null ? parseFloat(unitPrice) : parseFloat(current.unit_price);
    const newTotal = parseFloat((newQty * newPrice).toFixed(2));

    // Store original values on first manual edit
    const origQty = current.original_quantity != null ? current.original_quantity : current.quantity;
    const origPrice = current.original_unit_price != null ? current.original_unit_price : current.unit_price;

    await client.query(
      `UPDATE terceiros_settlement_items
       SET quantity = $1, unit_price = $2, total_price = $3,
           manually_edited = true, original_quantity = $4, original_unit_price = $5
       WHERE id = $6`,
      [newQty, newPrice, newTotal, origQty, origPrice, itemId]
    );

    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);

    await client.query('COMMIT');
    return { updated: true, ...totals };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function addSettlementItems(settlementId, items) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const totalPrice = parseFloat((item.quantity * item.unitPrice).toFixed(2));
      const manuallyEdited = item.manuallyEdited || false;
      await client.query(
        `INSERT INTO terceiros_settlement_items (settlement_id, of_id, quantity, unit_price, total_price, price_source, original_quantity, original_unit_price, manually_edited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [settlementId, item.ofId, item.quantity, item.unitPrice, totalPrice, item.priceSource || 'table',
         manuallyEdited ? item.originalQuantity : null,
         manuallyEdited ? item.originalUnitPrice : null,
         manuallyEdited]
      );
      await client.query(
        'UPDATE terceiros_ofs SET settlement_id = $1 WHERE id = $2',
        [settlementId, item.ofId]
      );
    }

    // Recalculate totals
    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);

    await client.query('COMMIT');
    return totals;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Shared: recalculate settlement totals ─────────────────────────────────

async function recalcSettlementTotals(queryFn, settlementId) {
  const items = await queryFn(
    `SELECT COALESCE(SUM(total_price), 0) AS total_amount, COALESCE(SUM(quantity), 0)::numeric AS total_items
     FROM terceiros_settlement_items WHERE settlement_id = $1`,
    [settlementId]
  );
  const discounts = await queryFn(
    `SELECT COALESCE(SUM(amount), 0) AS total_discounts
     FROM terceiros_settlement_discounts WHERE settlement_id = $1`,
    [settlementId]
  );
  const totalAmount = parseFloat(items.rows[0].total_amount) || 0;
  const totalItems = parseFloat(items.rows[0].total_items) || 0;
  const totalDiscounts = parseFloat(discounts.rows[0].total_discounts) || 0;
  const totalPayable = Math.max(0, totalAmount - totalDiscounts);

  await queryFn(
    `UPDATE terceiros_settlements
     SET total_amount = $1, total_items = $2, total_discounts = $3, total_payable = $4
     WHERE id = $5`,
    [totalAmount.toFixed(2), totalItems, totalDiscounts.toFixed(2), totalPayable.toFixed(2), settlementId]
  );
  return { totalAmount, totalItems, totalDiscounts, totalPayable };
}

// ── Settlement Discounts ──────────────────────────────────────────────────

async function getSettlementDiscounts(settlementId) {
  const result = await db.query(
    `SELECT id, description, amount, created_at AS "createdAt"
     FROM terceiros_settlement_discounts WHERE settlement_id = $1
     ORDER BY created_at`,
    [settlementId]
  );
  return result.rows;
}

async function addSettlementDiscount(settlementId, description, amount) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO terceiros_settlement_discounts (settlement_id, description, amount)
       VALUES ($1, $2, $3) RETURNING id, description, amount`,
      [settlementId, description, parseFloat(amount).toFixed(2)]
    );
    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);
    await client.query('COMMIT');
    return { discount: result.rows[0], ...totals };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateSettlementDiscount(discountId, description, amount) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE terceiros_settlement_discounts SET description = $1, amount = $2
       WHERE id = $3 RETURNING id, settlement_id`,
      [description, parseFloat(amount).toFixed(2), discountId]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    const settlementId = result.rows[0].settlement_id;
    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);
    await client.query('COMMIT');
    return totals;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeSettlementDiscount(discountId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'DELETE FROM terceiros_settlement_discounts WHERE id = $1 RETURNING settlement_id',
      [discountId]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    const settlementId = result.rows[0].settlement_id;
    const totals = await recalcSettlementTotals(client.query.bind(client), settlementId);
    await client.query('COMMIT');
    return totals;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getSettlementExportData(id) {
  const settlement = await getSettlement(id);
  if (!settlement) return null;

  // Get supplier details from OFs
  const supplierResult = await db.query(
    `SELECT DISTINCT cliente_nome, cliente_fantasia, cliente_cnpj, cliente_inscricao,
            cliente_endereco, num_end, cliente_bairro, cliente_cep,
            cliente_uf, cliente_cidade, cliente_complemento,
            ddd_fone, cliente_fone
     FROM terceiros_ofs WHERE fac_codcli = $1 LIMIT 1`,
    [settlement.codcli]
  );

  return {
    ...settlement,
    supplier: supplierResult.rows[0] || {}
  };
}

async function getOFRastreio(ofNumero) {
  const result = await db.query(
    `SELECT
       fac_numero,
       fac_codsetor,
       COALESCE(fac_descsetor, fac_codsetor) AS fac_descsetor,
       fac_dt_s,
       fac_dt_lan,
       fac_dt_prev_ret,
       fac_codigo_produto,
       fac_desc_produto,
       fac_parte,
       fac_descparte,
       fac_tam,
       fac_cor,
       fac_desccor,
       fac_qt_orig,
       fac_quant,
       fac_codcli,
       cliente_nome,
       cliente_fantasia
     FROM terceiros_ofs
     WHERE fac_numero = $1
     ORDER BY fac_dt_s ASC NULLS LAST, fac_codsetor ASC`,
    [ofNumero]
  );

  if (result.rows.length === 0) return null;

  let dt_abertura = null;
  let dt_ultimo_lancto = null;
  let ultima_etapa = null;

  // Group rows by etapa (fac_codsetor)
  const etapaMap = new Map();
  for (const row of result.rows) {
    // Summary fields across all rows
    if (row.fac_dt_s && (!dt_abertura || row.fac_dt_s < dt_abertura)) dt_abertura = row.fac_dt_s;
    if (row.fac_dt_lan && (!dt_ultimo_lancto || row.fac_dt_lan > dt_ultimo_lancto)) {
      dt_ultimo_lancto = row.fac_dt_lan;
      ultima_etapa = row.fac_descsetor || row.fac_codsetor;
    }

    const key = row.fac_codsetor || row.fac_descsetor;
    if (!etapaMap.has(key)) {
      etapaMap.set(key, {
        codsetor: row.fac_codsetor,
        descsetor: row.fac_descsetor,
        dt_entrada: row.fac_dt_s,
        dt_lancto: row.fac_dt_lan,
        dt_prev_ret: row.fac_dt_prev_ret,
        produtoMap: new Map()
      });
    }
    const etapa = etapaMap.get(key);
    // Track earliest entry and latest exit across rows in same etapa
    if (row.fac_dt_s && (!etapa.dt_entrada || row.fac_dt_s < etapa.dt_entrada)) {
      etapa.dt_entrada = row.fac_dt_s;
    }
    if (row.fac_dt_prev_ret && (!etapa.dt_prev_ret || row.fac_dt_prev_ret > etapa.dt_prev_ret)) {
      etapa.dt_prev_ret = row.fac_dt_prev_ret;
    }
    // Group products by codigo+parte, summing quantities (ignore cor/tamanho)
    const prodKey = `${row.fac_codigo_produto}|${row.fac_parte || ''}`;
    const existing = etapa.produtoMap.get(prodKey);
    if (existing) {
      existing.qt_orig += parseFloat(row.fac_qt_orig) || 0;
      existing.qt_final += parseFloat(row.fac_quant) || 0;
    } else {
      const prod = {
        codigo: row.fac_codigo_produto,
        descricao: row.fac_desc_produto,
        parte: row.fac_parte,
        desc_parte: row.fac_descparte,
        qt_orig: parseFloat(row.fac_qt_orig) || 0,
        qt_final: parseFloat(row.fac_quant) || 0
      };
      etapa.produtoMap.set(prodKey, prod);
    }
  }

  const first = result.rows[0];
  return {
    fac_numero: first.fac_numero,
    fac_codcli: first.fac_codcli,
    cliente_nome: first.cliente_fantasia || first.cliente_nome || null,
    dt_abertura,
    dt_ultimo_lancto,
    ultima_etapa,
    etapas: Array.from(etapaMap.values()).map(e => ({
      ...e,
      produtos: Array.from(e.produtoMap.values()),
      produtoMap: undefined
    }))
  };
}

module.exports = {
  // OFs
  batchUpsertOfs,
  getOfs,
  getDistinctSuppliers,
  getDistinctProducts,
  getDistinctParts,
  // Product Groups
  getProductGroups,
  createProductGroup,
  updateProductGroup,
  deleteProductGroup,
  getGroupProducts,
  addProductToGroup,
  removeProductFromGroup,
  addProductsToGroupBatch,
  removeProductsFromGroupBatch,
  // Supplier Prices
  getSupplierPrices,
  createSupplierPrice,
  updateSupplierPrice,
  deleteSupplierPrice,
  findPrice,
  getDistinctSizes,
  getEtapas,
  // Settlements
  getSettlements,
  getSettlement,
  createSettlement,
  markSettlementPaid,
  markSettlementUnpaid,
  deleteSettlement,
  updateSettlement,
  removeSettlementItem,
  updateSettlementItem,
  addSettlementItems,
  getSettlementExportData,
  // Drafts
  saveDraft,
  getDraft,
  promoteDraft,
  // Discounts
  getSettlementDiscounts,
  addSettlementDiscount,
  updateSettlementDiscount,
  removeSettlementDiscount,
  // Rastreio
  getOFRastreio
};
