const db = require('./connection');

const BATCH_SIZE = 500;

async function batchUpsertNotas(notasData) {
  if (!notasData || notasData.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // Deduplicate by (numero_nf, serie) - keep last occurrence
  const deduped = new Map();
  notasData.forEach((nf) => {
    const key = `${nf.numeroNf}|${nf.serie || 1}`;
    deduped.set(key, nf);
  });

  const uniqueData = Array.from(deduped.values());
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < uniqueData.length; i += BATCH_SIZE) {
    const batch = uniqueData.slice(i, i + BATCH_SIZE);
    const result = await upsertBatch(batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
  }

  return { inserted: totalInserted, updated: totalUpdated };
}

async function upsertBatch(batch) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const values = [];
    const params = [];
    let paramIndex = 1;

    batch.forEach((nf) => {
      const rowParams = [
        nf.numeroNf,
        nf.serie || 1,
        nf.ordemId || null,
        nf.codcli || null,
        nf.nomeCliente || null,
        nf.nomeFantasia || null,
        nf.valor || null,
        nf.dataEmissao,
        nf.chaveAcesso || null,
        nf.cnpj || null
      ];

      values.push(
        `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, ` +
        `$${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, ` +
        `$${paramIndex+8}, $${paramIndex+9})`
      );
      params.push(...rowParams);
      paramIndex += 10;
    });

    const query = `
      INSERT INTO notas_fiscais (
        numero_nf, serie, ordem_id, codcli, nome_cliente,
        nome_fantasia, valor, data_emissao, chave_acesso, cnpj
      ) VALUES ${values.join(', ')}
      ON CONFLICT (numero_nf, serie)
      DO UPDATE SET
        ordem_id = EXCLUDED.ordem_id,
        codcli = EXCLUDED.codcli,
        nome_cliente = EXCLUDED.nome_cliente,
        nome_fantasia = EXCLUDED.nome_fantasia,
        valor = EXCLUDED.valor,
        data_emissao = EXCLUDED.data_emissao,
        chave_acesso = EXCLUDED.chave_acesso,
        cnpj = EXCLUDED.cnpj,
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

async function findByNumero(numeroNf, serie) {
  const params = [numeroNf];
  let sql = 'SELECT numero_nf, serie, ordem_id, codcli, nome_cliente, nome_fantasia, valor, data_emissao, chave_acesso, cnpj FROM notas_fiscais WHERE numero_nf = $1';
  if (serie !== undefined && serie !== null) {
    sql += ' AND serie = $2';
    params.push(serie);
  }
  sql += ' ORDER BY serie ASC';
  const result = await db.query(sql, params);
  return result.rows;
}

module.exports = {
  batchUpsertNotas,
  findByNumero
};
