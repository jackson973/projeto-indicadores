const db = require('./connection');
const { encrypt, decrypt } = require('../lib/encryption');

async function getSettings() {
  const result = await db.query(
    `SELECT id, active,
            llm_provider AS "llmProvider",
            llm_api_key_encrypted AS "llmApiKeyEncrypted",
            llm_model AS "llmModel",
            llm_base_url AS "llmBaseUrl",
            system_prompt AS "systemPrompt",
            feature_sales AS "featureSales",
            feature_cashflow AS "featureCashflow",
            feature_boleto AS "featureBoleto",
            feature_nf AS "featureNf",
            boleto_path AS "boletoPath",
            nf_path AS "nfPath",
            connected,
            connected_phone AS "connectedPhone",
            last_message_at AS "lastMessageAt",
            total_interactions AS "totalInteractions",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM whatsapp_settings WHERE id = 1`
  );

  const row = result.rows[0];
  if (!row) return null;

  let llmApiKey = '';
  if (row.llmApiKeyEncrypted) {
    try {
      llmApiKey = decrypt(row.llmApiKeyEncrypted);
    } catch {
      llmApiKey = '';
    }
  }

  return {
    ...row,
    llmApiKey,
    llmApiKeyEncrypted: undefined
  };
}

async function updateSettings({
  active, llmProvider, llmApiKey, llmModel, llmBaseUrl,
  systemPrompt, featureSales, featureCashflow, featureBoleto, featureNf,
  boletoPath, nfPath
}) {
  let apiKeyClause = '';
  const params = [
    active,
    llmProvider || 'groq',
    llmModel || 'llama-3.1-70b-versatile',
    llmBaseUrl || null,
    systemPrompt || '',
    featureSales !== false,
    featureCashflow !== false,
    featureBoleto || false,
    featureNf || false,
    boletoPath || null,
    nfPath || null
  ];
  let paramIndex = 12;

  if (llmApiKey && llmApiKey !== '********') {
    const encrypted = encrypt(llmApiKey);
    apiKeyClause = `, llm_api_key_encrypted = $${paramIndex}`;
    params.push(encrypted);
    paramIndex++;
  }

  const result = await db.query(
    `UPDATE whatsapp_settings SET
       active = $1,
       llm_provider = $2,
       llm_model = $3,
       llm_base_url = $4,
       system_prompt = $5,
       feature_sales = $6,
       feature_cashflow = $7,
       feature_boleto = $8,
       feature_nf = $9,
       boleto_path = $10,
       nf_path = $11,
       updated_at = NOW()
       ${apiKeyClause}
     WHERE id = 1
     RETURNING id, active,
               llm_provider AS "llmProvider",
               llm_model AS "llmModel",
               llm_base_url AS "llmBaseUrl",
               system_prompt AS "systemPrompt",
               feature_sales AS "featureSales",
               feature_cashflow AS "featureCashflow",
               feature_boleto AS "featureBoleto",
               feature_nf AS "featureNf",
               boleto_path AS "boletoPath",
               nf_path AS "nfPath",
               connected,
               connected_phone AS "connectedPhone",
               last_message_at AS "lastMessageAt",
               total_interactions AS "totalInteractions"`,
    params
  );

  return result.rows[0] || null;
}

async function updateConnectionStatus(connected, phone) {
  await db.query(
    `UPDATE whatsapp_settings SET
       connected = $1,
       connected_phone = $2,
       updated_at = NOW()
     WHERE id = 1`,
    [connected, phone || null]
  );
}

async function incrementInteractions() {
  await db.query(
    `UPDATE whatsapp_settings SET
       total_interactions = total_interactions + 1,
       last_message_at = NOW()
     WHERE id = 1`
  );
}

// --- Saved phones history ---

async function getSavedPhones() {
  const result = await db.query(
    `SELECT id, phone, label, connected_at AS "connectedAt", last_connected_at AS "lastConnectedAt"
     FROM whatsapp_phones
     ORDER BY last_connected_at DESC`
  );
  return result.rows;
}

async function savePhone(phone) {
  if (!phone) return;
  await db.query(
    `INSERT INTO whatsapp_phones (phone, last_connected_at)
     VALUES ($1, NOW())
     ON CONFLICT (phone)
     DO UPDATE SET last_connected_at = NOW()`,
    [phone]
  );
}

async function updatePhoneLabel(id, label) {
  await db.query(
    `UPDATE whatsapp_phones SET label = $1 WHERE id = $2`,
    [label || null, id]
  );
}

async function deletePhone(id) {
  await db.query(`DELETE FROM whatsapp_phones WHERE id = $1`, [id]);
}

module.exports = {
  getSettings,
  updateSettings,
  updateConnectionStatus,
  incrementInteractions,
  getSavedPhones,
  savePhone,
  updatePhoneLabel,
  deletePhone
};
