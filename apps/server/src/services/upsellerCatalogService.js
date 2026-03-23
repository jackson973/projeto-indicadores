/**
 * upsellerCatalogService.js
 *
 * Sincroniza o catálogo de produtos do Upseller (Export API) com as tabelas
 * upseller_products e upseller_product_variations.
 *
 * Fluxo:
 *   1. POST get-online-count   → total de produtos NORMAL
 *   2. POST Export (JSON)      → dispara job, retorna job key
 *   3. GET  check-process      → polling até code=1, retorna URL do xlsx
 *   4. GET  CDN URL            → download do xlsx (sem auth)
 *   5. Parse xlsx              → upsert em upseller_products + upseller_product_variations
 */

const axios = require('axios');
const XLSX  = require('xlsx');
const db    = require('../db/connection');
const { getOrCreateSession } = require('./upsellerSyncService');
const upsellerRepo = require('../db/upsellerRepository');

const UPSELLER_BASE = 'https://app.upseller.com';
const PARENT_ID     = 77815;
const DEVICE_ID     = 'fa885399-8c86-421e-b110-cd39192088ca';

// ─── Configuração por plataforma ─────────────────────────────────────────────

const SHOPEE_HEADS = 'Nome da sua loja,ID de Anúncio,Nome do Anúncio,SKU Principal,Descrição,Categoria ID,Nome Variante1,Opção por Variante1,Imagem por Variante,Nome Variante2,Opção por Variante2,SKU,ID da Variante,Preço,Preço com Desconto,Quantidade,Qtd. de Promoção,GTIN,Guia de Tamanhos,Imagem de Capa,Imagem de Anúncio1,Imagem de Anúncio2,Imagem de Anúncio3,Imagem de Anúncio4,Imagem de Anúncio5,Imagem de Anúncio6,Imagem de Anúncio7,Imagem de Anúncio8,Imagem de Anúncio9,Peso (kg),Comprimento (cm),Largura (cm),Altura (cm),O prazo de entrega da Pré-venda （Dias),Link do Fornecedor,Data de Criação,Horário Atualizado';

const ML_HEADS = 'Nome da Loja,Vendas,Visitas,Qualidade,ID do Anúncios,Link do Anúncio,Título,Canais de Vendas,Categoria ID,Nome da Categoria,Condição,Descrição,Moeda,ML Preço,ML Preço com Desconto,ML Preço com Desconto Exclusivo,MS Preço,Tipo de Anúncio,Tipo de Garantia,Imagem de Anúncio1,Imagem de Anúncio2,Imagem de Anúncio3,Imagem de Anúncio4,Imagem de Anúncio5,Imagem de Anúncio6,Imagem de Anúncio7,Imagem de Anúncio8,Imagem de Anúncio9,Imagem de Anúncio10,Imagem de Anúncio11,Imagem de Anúncio12,Nome Variante1,Opção por Variante1,Nome Variante2,Opção por Variante2,Nome Variante3,Opção por Variante3,Nome Variante4,Opção por Variante4,Nome Variante5,Opção por Variante5,Imagem da Variante1,Imagem da Variante2,Imagem da Variante3,Imagem da Variante4,Imagem da Variante5,Imagem da Variante6,Imagem da Variante7,Imagem da Variante8,Imagem da Variante9,Imagem da Variante10,SKU,ID da Variante,Quantidade,Full Quantidade,Código de Barras,Forma de entrega,Logísticas,Full ML Code,Serviço de entrega,Retirar pessoalmente,Link do YouTube,Link do Fornecedor,Data de Criação,Horário Atualizado';

const ML_TRANSLATION_KEY = '{"2230279":"Garantia de Fábrica","2230280":"Garantia do Vendedor","6150835":"Sem Garantia","free":"Gratuito","gold_special":"Clássico","gold_pro":"Premium","días":"dias","meses":"meses","años":"anos","dias":"dias","anos":"anos","new":"Novo","used":"Usado","standard":"Padrão","basic":"Básico","professional":"Profissional","not_specified":"Recondicionado","Offer_free_shipping":"Oferecer frete grátis","Not_free_shipping":"Não oferecer frete grátis","Mercado_Products_Export":"Mercado_Anúncios_Exportação"}';

const PLATFORM_CFG = {
  shopee: {
    countUrl:       `${UPSELLER_BASE}/api/shopee/product/get-online-count`,
    exportUrl:      `${UPSELLER_BASE}/api/shopee/product/Export`,
    productState:   'NORMAL',
    state:          'online',
    heads:          SHOPEE_HEADS,
    translationKey: '{"Shopee_Products_Export":"Shopee_Anúncios_Exportação"}',
    colShop:        0,   // "Nome da sua loja"
    colAdId:        1,   // "ID de Anúncio"
    colAdName:      2,   // "Nome do Anúncio"
    colVarOpt1:     7,   // "Opção por Variante1"
    colVarImg:      8,   // "Imagem por Variante"
    colVarOpt2:     10,  // "Opção por Variante2"
  },
  shein: {
    countUrl:       `${UPSELLER_BASE}/api/shein/product/get-online-count`,
    exportUrl:      `${UPSELLER_BASE}/api/shein/product/export`,
    productState:   'active',
    state:          'online',
    heads:          'Nome da Loja,ID do Anúncios,Nome do Anúncio,Descrição,SKU Principal,Categoria ID,Categoria,ID da Variante,SKC,Especificação Principal,Valor de Especificação Principal,Subespecificação1,Valor de Subespecificação 1,Subespecificação2,Valor de Subespecificação 2,SKU,Qualidade,Moeda,Preço,Preço especial,Preço de Custo,Quantidade,Peso,Tamanho da Embalagem(C x L x A),Primeira Imagem,Imagem Quadrada,Imagem de Cores,Imagem Detalhada 1,Imagem Detalhada 2,Imagem Detalhada 3,Imagem Detalhada 4,Imagem Detalhada 5,Imagem Detalhada 6,Imagem Detalhada 7,Imagem Detalhada 8,Imagem Detalhada 9,Imagem Detalhada 10,Horário Atualizado,Horário Publicado',
    translationKey: '{"Shein_Products_Export":"Shein_Anúncios _Exportação"}',
    extraBody:      { isDelete: 0 },
    colShop:        0,   // "Nome da Loja"
    colAdId:        1,   // "ID do Anúncios"
    colAdName:      2,   // "Nome do Anúncio"
    colVarOpt1:     10,  // "Valor de Especificação Principal"
    colVarImg:      26,  // "Imagem de Cores"
    colVarOpt2:     12,  // "Valor de Subespecificação 1"
  },
  mercadolivre: {
    countUrl:       `${UPSELLER_BASE}/api/mercado/product/get-online-count`,
    exportUrl:      `${UPSELLER_BASE}/api/mercado/product/export`,
    productState:   'active',
    state:          'online',
    heads:          ML_HEADS,
    translationKey: ML_TRANSLATION_KEY,
    extraBody:      { hasCatalogProduct: 0 },
    colShop:        0,   // "Nome da Loja"
    colAdId:        4,   // "ID do Anúncios"
    colAdName:      6,   // "Título"
    colVarOpt1:     32,  // "Opção por Variante1"
    colVarImg:      41,  // "Imagem da Variante1"
    colVarOpt2:     34,  // "Opção por Variante2"
  },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function axiosHeaders(cookies) {
  return {
    Cookie:         cookies,
    'Content-Type': 'application/json',
    deviceid:       DEVICE_ID,
    'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
}

// ─── Etapa 1: obter total ────────────────────────────────────────────────────

async function getTotal(cfg, cookies) {
  const { data } = await axios.post(cfg.countUrl, {}, {
    headers: axiosHeaders(cookies),
    timeout: 15000,
  });
  const payload = data?.data ?? data;
  console.log(`[Catalog] count response:`, JSON.stringify(payload));
  // Diferentes plataformas usam chaves diferentes: NORMAL, ACTIVE, active, etc.
  // Tenta chaves conhecidas, senão soma todos os valores numéricos do objeto
  if (typeof payload === 'number') return payload;
  const knownKeys = ['NORMAL', 'ACTIVE', 'active', 'online', 'ONLINE'];
  for (const k of knownKeys) {
    if (payload?.[k]) return payload[k];
  }
  // Fallback: pega o maior valor numérico do objeto
  if (typeof payload === 'object' && payload !== null) {
    const nums = Object.values(payload).filter(v => typeof v === 'number' && v > 0);
    if (nums.length > 0) return Math.max(...nums);
  }
  return 0;
}

// ─── Etapa 2: disparar exportação ────────────────────────────────────────────

async function triggerExport(cfg, cookies, total) {
  const pageSize  = 50;
  const totalPage = Math.ceil(total / pageSize);

  const body = {
    ...(cfg.extraBody || {}),
    sortName:       '3',
    sortValue:      '0',
    productState:   cfg.productState,
    state:          cfg.state,
    total,
    firstPage:      1,
    endPage:        totalPage,
    totalPage,
    pageNum:        1,
    pageSize,
    heads:          cfg.heads,
    translationKey: cfg.translationKey,
  };

  const { data } = await axios.post(cfg.exportUrl, body, {
    headers: axiosHeaders(cookies),
    timeout: 30000,
  });

  if (data?.code !== 0 || !data?.data) {
    throw new Error(`Export falhou: ${JSON.stringify(data)}`);
  }
  return data.data; // job key: "SHOPEE:PRODUCT_EXPORT:xxxx:77815"
}

// ─── Etapa 3: polling check-process ─────────────────────────────────────────

async function pollForFile(cookies, jobKey, maxAttempts = 40) {
  for (let i = 1; i <= maxAttempts; i++) {
    await sleep(3000);
    const { data } = await axios.get(`${UPSELLER_BASE}/api/check-process`, {
      params:  { uuid: jobKey },
      headers: axiosHeaders(cookies),
      timeout: 15000,
    });

    const pm = data?.data?.processMsg;
    if (pm?.code === 1 && pm?.msg?.startsWith('http')) {
      return pm.msg; // URL completa do xlsx no CDN
    }
  }
  throw new Error('Timeout: arquivo não gerado após polling');
}

// ─── Etapa 4: download + parse xlsx ─────────────────────────────────────────

async function downloadAndParse(cdnUrl, cfg) {
  const { data: buf } = await axios.get(cdnUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const wb   = XLSX.read(buf, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Agrupa por (shop, adId, adName) → coleta variações
  // O xlsx tem células mescladas: shop/adId/adName só aparecem na 1ª linha do produto.
  // Carry-forward: mantém último valor não-vazio para essas colunas.
  const productMap = new Map(); // key = `${shop}|||${adId}|||${adName}`
  let lastShop  = '';
  let lastAdId  = '';
  let lastAdName = '';

  for (let i = 1; i < rows.length; i++) {
    const row     = rows[i];
    const rawShop   = String(row[cfg.colShop]   || '').trim();
    const rawAdId   = String(row[cfg.colAdId]   || '').trim();
    const rawAdName = String(row[cfg.colAdName] || '').trim();
    const varOpt1   = String(row[cfg.colVarOpt1] || '').trim();
    const varImg    = String(row[cfg.colVarImg]  || '').trim();
    const varOpt2   = String(row[cfg.colVarOpt2] || '').trim();

    // Atualiza carry-forward quando a célula tem valor
    if (rawShop)   lastShop   = rawShop;
    if (rawAdId)   lastAdId   = rawAdId;
    if (rawAdName) lastAdName = rawAdName;

    const shop   = lastShop;
    const adId   = lastAdId;
    const adName = lastAdName;

    if (!adName) continue;

    const key = `${shop}|||${adId}|||${adName}`;
    if (!productMap.has(key)) {
      productMap.set(key, { shop, adId, adName, variations: [] });
    }
    if (varOpt1) {
      productMap.get(key).variations.push({
        option1: varOpt1,
        option2: varOpt2 || null,
        image:   varImg  || null,
      });
    }
  }

  return [...productMap.values()];
}

// ─── Etapa 5: upsert no banco ────────────────────────────────────────────────

async function resolveStoreId(shopName) {
  const { rows } = await db.query(
    `SELECT id FROM stores
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        OR (platform_seller_name IS NOT NULL AND LOWER(TRIM(platform_seller_name)) = LOWER(TRIM($1)))
     LIMIT 1`,
    [shopName]
  );
  return rows[0]?.id ?? null;
}

async function upsertProducts(platform, products) {
  let inserted = 0;
  let updated  = 0;
  let varUpserted = 0;

  // Cache store_id por shop_name
  const storeCache = new Map();

  for (const p of products) {
    // Resolve store_id (com cache)
    if (!storeCache.has(p.shop)) {
      storeCache.set(p.shop, await resolveStoreId(p.shop));
    }
    const storeId = storeCache.get(p.shop);

    // Upsert produto
    const { rows } = await db.query(`
      INSERT INTO upseller_products (platform, shop_name, store_id, ad_id, ad_name, active, synced_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      ON CONFLICT (platform, shop_name, ad_name) DO UPDATE SET
        ad_id     = EXCLUDED.ad_id,
        store_id  = EXCLUDED.store_id,
        active    = true,
        synced_at = NOW()
      RETURNING id, (xmax = 0) AS is_insert
    `, [platform, p.shop, storeId, p.adId || null, p.adName]);

    const productId = rows[0].id;
    if (rows[0].is_insert) inserted++; else updated++;

    // Upsert variações
    for (const v of p.variations) {
      await db.query(`
        INSERT INTO upseller_product_variations
          (product_id, variation_option, variation_option2, variation_image, synced_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (product_id, COALESCE(variation_option,''), COALESCE(variation_option2,''))
        DO UPDATE SET
          variation_image = EXCLUDED.variation_image,
          synced_at       = NOW()
      `, [productId, v.option1, v.option2, v.image]);
      varUpserted++;
    }
  }

  return { inserted, updated, varUpserted };
}

// ─── Marca como inativo produtos que não vieram no sync ──────────────────────

async function deactivateMissing(platform, activeAdNames) {
  if (activeAdNames.length === 0) return 0;
  const { rowCount } = await db.query(`
    UPDATE upseller_products
    SET active = false, synced_at = NOW()
    WHERE platform = $1
      AND active   = true
      AND ad_name  NOT IN (SELECT UNNEST($2::text[]))
  `, [platform, activeAdNames]);
  return rowCount;
}

// ─── Função principal de sync ────────────────────────────────────────────────

async function syncCatalog(platform) {
  if (!PLATFORM_CFG[platform]) {
    throw new Error(`Plataforma inválida: ${platform}. Use: ${Object.keys(PLATFORM_CFG).join(', ')}`);
  }
  const cfg = PLATFORM_CFG[platform];

  console.log(`[Catalog] Iniciando sync ${platform}...`);

  const settings = await upsellerRepo.getSettings();
  if (!settings) throw new Error('Configurações Upseller não encontradas');
  const cookies = await getOrCreateSession(settings);
  if (!cookies) throw new Error('Sessão Upseller não disponível');

  // 1. Total
  const total = await getTotal(cfg, cookies);
  if (!total) throw new Error('Nenhum produto encontrado no catálogo');
  console.log(`[Catalog] ${total} produtos NORMAL`);

  // 2. Export
  const jobKey = await triggerExport(cfg, cookies, total);
  console.log(`[Catalog] Job: ${jobKey}`);

  // 3. Poll
  const cdnUrl = await pollForFile(cookies, jobKey);
  console.log(`[Catalog] Arquivo: ${cdnUrl}`);

  // 4. Download + parse
  const products = await downloadAndParse(cdnUrl, cfg);
  console.log(`[Catalog] Parsed: ${products.length} produtos`);

  // 5. Upsert
  const { inserted, updated, varUpserted } = await upsertProducts(platform, products);

  // 6. Desativa encerrados
  const activeNames = products.map(p => p.adName);
  const deactivated = await deactivateMissing(platform, activeNames);

  console.log(`[Catalog] Sync ${platform} concluído: +${inserted} novos, ~${updated} atualizados, ${varUpserted} variações, ${deactivated} desativados`);
  return { platform, total, products: products.length, inserted, updated, varUpserted, deactivated };
}

module.exports = { syncCatalog, PLATFORM_CFG };
