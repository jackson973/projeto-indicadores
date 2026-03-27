/**
 * Análise de cobertura: catálogo Upseller vs vendas no banco
 *
 * Responde:
 *   1. Produtos do catálogo Upseller que NUNCA apareceram em vendas
 *   2. ad_names em vendas que NÃO estão no catálogo Upseller
 *   3. Taxa de cobertura por plataforma
 *
 * Uso: node scripts/analyze-catalog-coverage.js [shopee|shein|tiktok]
 *
 * Fluxo Upseller export:
 *   GET  /api/{platform}/product/get-online-count  → total
 *   POST /api/{platform}/product/Export (JSON)     → job key
 *   GET  /api/check-process?uuid={key}             → polling → filename
 *   GET  https://print-label.upseller.cn/.../{filename}.xlsx  → download
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/server/.env') });

const axios  = require('axios');
const XLSX   = require('xlsx');
const db     = require('../apps/server/src/db/connection');
const { getOrCreateSession } = require('../apps/server/src/services/upsellerSyncService');

// ─── Config ──────────────────────────────────────────────────────────────────

const UPSELLER_BASE = 'https://app.upseller.com';
const PARENT_ID     = 77815;
const DEVICE_ID     = 'fa885399-8c86-421e-b110-cd39192088ca';

// heads = string CSV com nomes das colunas exatamente como o browser envia
const SHOPEE_HEADS = 'Nome da sua loja,ID de Anúncio,Nome do Anúncio,SKU Principal,Descrição,Categoria ID,Nome Variante1,Opção por Variante1,Imagem por Variante,Nome Variante2,Opção por Variante2,SKU,ID da Variante,Preço,Preço com Desconto,Quantidade,Qtd. de Promoção,GTIN,Guia de Tamanhos,Imagem de Capa,Imagem de Anúncio1,Imagem de Anúncio2,Imagem de Anúncio3,Imagem de Anúncio4,Imagem de Anúncio5,Imagem de Anúncio6,Imagem de Anúncio7,Imagem de Anúncio8,Imagem de Anúncio9,Peso (kg),Comprimento (cm),Largura (cm),Altura (cm),O prazo de entrega da Pré-venda （Dias),Link do Fornecedor,Data de Criação,Horário Atualizado';

const PLATFORM_CFG = {
  shopee: {
    countUrl:       `${UPSELLER_BASE}/api/shopee/product/get-online-count`,
    exportUrl:      `${UPSELLER_BASE}/api/shopee/product/Export`,
    cdnBase:        'https://print-label.upseller.cn/shopee_export',
    productState:   'NORMAL',
    state:          'online',
    sortName:       '3',
    sortValue:      '0',
    heads:          SHOPEE_HEADS,
    translationKey: '{"Shopee_Products_Export":"Shopee_Anúncios_Exportação"}',
    salesPlatform:  'Shopee',
    adNameCol:      2,   // "Nome do Anúncio"
    shopCol:        0,   // "Nome da sua loja"
    variantCol:     7,   // "Opção por Variante1"
  },
  shein: {
    countUrl:       `${UPSELLER_BASE}/api/shein/product/get-online-count`,
    exportUrl:      `${UPSELLER_BASE}/api/shein/product/export`,
    cdnBase:        'https://print-label.upseller.cn/shein_export',
    productState:   'NORMAL',
    state:          'online',
    sortName:       '3',
    sortValue:      '0',
    heads:          SHOPEE_HEADS, // ajustar se Shein tiver colunas diferentes
    translationKey: '{"Shein_Products_Export":"Shein_Anúncios_Exportação"}',
    salesPlatform:  'Shein',
    adNameCol:      2,
    shopCol:        0,
    variantCol:     7,
  },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Passo 1: baixar catálogo do Upseller ────────────────────────────────────

async function fetchCatalog(platform, cookies) {
  const cfg = PLATFORM_CFG[platform];

  // 1a. Total de produtos ativos (POST — endpoint rejeita GET)
  console.log(`\n[Catalog] POST ${cfg.countUrl}`);
  const { data: countData } = await axios.post(cfg.countUrl, {}, {
    headers: {
      Cookie:         cookies,
      'Content-Type': 'application/json',
      deviceid:       DEVICE_ID,
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });
  console.log('[Catalog] Resposta count:', JSON.stringify(countData));

  const countPayload = countData?.data ?? countData;
  const total = typeof countPayload === 'number'
    ? countPayload
    : countPayload?.NORMAL ?? countPayload?.ACTIVE ?? Object.values(countPayload || {}).reduce((a, b) => a + b, 0) ?? 0;

  if (!total) {
    console.error('[Catalog] Nenhum produto encontrado. Verifique a sessão.');
    return null;
  }
  console.log(`[Catalog] Total produtos: ${total}`);

  // 1b. Disparar exportação
  const pageSize  = 50;
  const totalPage = Math.ceil(total / pageSize);

  const exportBody = {
    sortName:       cfg.sortName,
    sortValue:      cfg.sortValue,
    productState:   cfg.productState,
    state:          cfg.state,
    total,
    firstPage:      1,           // inteiro: número da primeira página
    endPage:        totalPage,   // inteiro: número da última página
    totalPage,
    pageNum:        1,
    pageSize,
    heads:          cfg.heads,
    translationKey: cfg.translationKey,
  };

  console.log(`\n[Catalog] POST ${cfg.exportUrl}`);
  console.log('[Catalog] Body:', JSON.stringify(exportBody));

  const { data: exportData } = await axios.post(cfg.exportUrl, exportBody, {
    headers: {
      Cookie:         cookies,
      'Content-Type': 'application/json',
      deviceid:       DEVICE_ID,
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    timeout: 30000,
  });
  console.log('[Catalog] Resposta export:', JSON.stringify(exportData).slice(0, 200));

  const jobKey = exportData?.data ?? exportData;
  if (!jobKey || typeof jobKey !== 'string') {
    console.error('[Catalog] Resposta inesperada do export — checar heads/translationKey');
    return null;
  }
  console.log(`[Catalog] Job key: ${jobKey}`);

  // 1c. Polling check-process
  console.log('\n[Catalog] Aguardando geração do arquivo...');
  let fileInfo = null;
  for (let i = 1; i <= 40; i++) {
    await sleep(3000);
    const { data: checkData } = await axios.get(`${UPSELLER_BASE}/api/check-process`, {
      params:  { uuid: jobKey },
      headers: { Cookie: cookies, deviceid: DEVICE_ID },
      timeout: 15000,
    });

    process.stdout.write(`  Check ${String(i).padStart(2)}\r`);

    // Formato real da resposta:
    // { data: { processMsg: { code: 1, msg: "https://...xlsx", successNum: 163, totalNum: 163 } } }
    // code=1 → pronto; code=-1 → ainda processando ou expirado
    const pm = checkData?.data?.processMsg;
    if (pm?.code === 1 && pm?.msg?.startsWith('http')) {
      console.log(`\n[Catalog] Arquivo pronto: ${pm.msg}`);
      fileInfo = { cdnUrl: pm.msg };
      break;
    }
  }
  process.stdout.write('\n');

  if (!fileInfo) {
    console.error('[Catalog] Timeout: arquivo não gerado após 2 min');
    return null;
  }

  // 1d. Download xlsx — URL completa vem do check-process
  const cdnUrl = fileInfo.cdnUrl;

  console.log(`[Catalog] Baixando: ${cdnUrl}`);
  const { data: buf } = await axios.get(cdnUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  // Parse
  const wb   = XLSX.read(buf, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  console.log(`[Catalog] xlsx: ${rows.length} linhas, ${(rows[0] || []).length} colunas`);
  console.log('[Catalog] Cabeçalhos:', (rows[0] || []).slice(0, 12).join(' | '));

  return { rows, cfg };
}

// ─── Passo 2: extrair ad_names do xlsx ───────────────────────────────────────

function extractFromXlsx(rows, cfg) {
  const products = new Map(); // adName → { shop, variants: Set }

  for (let i = 1; i < rows.length; i++) {
    const row     = rows[i];
    const shop    = String(row[cfg.shopCol]  || '').trim();
    const adName  = String(row[cfg.adNameCol] || '').trim();
    const variant = String(row[cfg.variantCol] || '').trim();

    if (!adName) continue;

    if (!products.has(adName)) {
      products.set(adName, { shop, variants: new Set() });
    }
    if (variant) products.get(adName).variants.add(variant);
  }

  return products; // Map<adName, { shop, variants }>
}

// ─── Passo 3: buscar ad_names das vendas no banco ────────────────────────────

async function fetchSalesAdNames(salesPlatform) {
  const { rows } = await db.query(`
    SELECT
      TRIM(ad_name) AS ad_name,
      COUNT(*)          AS qty_rows,
      SUM(total)        AS revenue,
      MAX(date)         AS last_sale
    FROM sales
    WHERE platform = $1
      AND ad_name IS NOT NULL
      AND ad_name <> ''
    GROUP BY TRIM(ad_name)
    ORDER BY revenue DESC
  `, [salesPlatform]);

  return rows; // [{ ad_name, qty_rows, revenue, last_sale }]
}

// ─── Passo 4: checar tabela products existente ───────────────────────────────

async function fetchExistingProducts() {
  const { rows } = await db.query(`
    SELECT nome, canal FROM products ORDER BY nome
  `);
  return rows;
}

// ─── Análise e relatório ─────────────────────────────────────────────────────

function printReport(catalogMap, salesRows, platform) {
  const catalogNames = new Set(catalogMap.keys());
  const salesNames   = new Set(salesRows.map(r => r.ad_name));

  // Interseção, diferenças
  const inBoth          = [...catalogNames].filter(n => salesNames.has(n));
  const onlyCatalog     = [...catalogNames].filter(n => !salesNames.has(n));  // existe no catálogo mas sem vendas
  const onlySales       = salesRows.filter(r => !catalogNames.has(r.ad_name)); // tem vendas mas não está no catálogo

  const coveragePct = salesNames.size > 0
    ? ((inBoth.length / salesNames.size) * 100).toFixed(1)
    : 0;

  console.log('\n' + '═'.repeat(70));
  console.log(`RELATÓRIO — ${platform.toUpperCase()}`);
  console.log('═'.repeat(70));

  console.log(`\n📦 Catálogo Upseller: ${catalogNames.size} anúncios distintos`);
  console.log(`📊 Vendas no banco:   ${salesNames.size} ad_names distintos`);
  console.log(`✅ Cobertura:         ${inBoth.length}/${salesNames.size} = ${coveragePct}%`);

  // Anúncios sem vendas (existem no catálogo mas nunca venderam)
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🔴 NO CATÁLOGO SEM VENDAS: ${onlyCatalog.length} anúncios`);
  console.log(`   (produtos que existem na plataforma mas sem histórico de venda)`);
  if (onlyCatalog.length > 0) {
    for (const name of onlyCatalog.slice(0, 30)) {
      const info = catalogMap.get(name);
      const vars = [...info.variants].join(', ');
      console.log(`   - [${info.shop}] ${name}`);
      if (vars) console.log(`       variações: ${vars}`);
    }
    if (onlyCatalog.length > 30) console.log(`   ... e mais ${onlyCatalog.length - 30}`);
  }

  // Vendas sem catálogo (ad_name que não bate com nenhum produto do catálogo)
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🟡 VENDAS SEM CATÁLOGO: ${onlySales.length} ad_names`);
  console.log(`   (têm vendas mas não encontradas no catálogo atual — renomeados? encerrados?)`);
  if (onlySales.length > 0) {
    for (const r of onlySales.slice(0, 30)) {
      const lastDate = r.last_sale ? new Date(r.last_sale).toLocaleDateString('pt-BR') : '?';
      const rev = parseFloat(r.revenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      console.log(`   - ${r.ad_name}`);
      console.log(`       última venda: ${lastDate}  |  receita total: ${rev}`);
    }
    if (onlySales.length > 30) console.log(`   ... e mais ${onlySales.length - 30}`);
  }

  // Match perfeito — top 10 por receita
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`✅ MATCH PERFEITO (top 10 por receita):`);
  const matchedWithRevenue = salesRows
    .filter(r => catalogNames.has(r.ad_name))
    .slice(0, 10);
  for (const r of matchedWithRevenue) {
    const info  = catalogMap.get(r.ad_name);
    const rev   = parseFloat(r.revenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const vars  = [...info.variants].slice(0, 4).join(', ');
    console.log(`   - ${r.ad_name}`);
    console.log(`       receita: ${rev}  |  variações catálogo: ${vars || '(nenhuma)'}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('CONCLUSÃO PARA MODELAGEM');
  console.log('═'.repeat(70));
  if (parseFloat(coveragePct) >= 90) {
    console.log(`✅ Cobertura alta (${coveragePct}%) — catálogo Upseller pode ser tabela mestre.`);
    console.log(`   ${onlySales.length} vendas sem catálogo: verificar se são anúncios encerrados.`);
  } else if (parseFloat(coveragePct) >= 70) {
    console.log(`⚠️  Cobertura parcial (${coveragePct}%) — catálogo cobre a maioria mas há gaps.`);
    console.log(`   Investigar ${onlySales.length} ad_names que têm vendas sem catálogo.`);
  } else {
    console.log(`❌ Cobertura baixa (${coveragePct}%) — nomes não batem. Possível diferença de formato.`);
    console.log(`   Comparar manualmente alguns exemplos de cada lado.`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const platform = (process.argv[2] || 'shopee').toLowerCase();

  if (!PLATFORM_CFG[platform]) {
    console.error(`Plataforma inválida. Use: ${Object.keys(PLATFORM_CFG).join(', ')}`);
    process.exit(1);
  }

  const cfg = PLATFORM_CFG[platform];

  // 1. Sessão Upseller
  console.log('[Auth] Obtendo sessão Upseller...');
  const cookies = await getOrCreateSession();
  if (!cookies) {
    console.error('[Auth] Sessão indisponível. Configure o Upseller primeiro.');
    process.exit(1);
  }
  console.log('[Auth] Sessão OK');

  // 2. Catálogo
  const result = await fetchCatalog(platform, cookies);
  if (!result) process.exit(1);

  const catalogMap = extractFromXlsx(result.rows, result.cfg);
  console.log(`\n[Parse] ${catalogMap.size} anúncios distintos no catálogo`);

  // 3. Vendas no banco
  console.log(`\n[DB] Buscando ad_names de vendas (platform='${cfg.salesPlatform}')...`);
  const salesRows = await fetchSalesAdNames(cfg.salesPlatform);
  console.log(`[DB] ${salesRows.length} ad_names distintos encontrados`);

  // 4. Produtos existentes (migration 034)
  const existingProducts = await fetchExistingProducts();
  if (existingProducts.length > 0) {
    console.log(`\n[DB] Tabela 'products' atual: ${existingProducts.length} registros`);
  } else {
    console.log('\n[DB] Tabela "products" está vazia (não utilizada ainda)');
  }

  // 5. Relatório
  printReport(catalogMap, salesRows, platform);

  // 6. Amostra de nomes para comparação visual
  console.log('\n─── AMOSTRA: primeiros 5 do catálogo vs primeiros 5 de vendas ───');
  const catalogSample = [...catalogMap.keys()].slice(0, 5);
  const salesSample   = salesRows.slice(0, 5).map(r => r.ad_name);
  console.log('Catálogo:');
  catalogSample.forEach(n => console.log(`  "${n}"`));
  console.log('Vendas:');
  salesSample.forEach(n => console.log(`  "${n}"`));

  process.exit(0);
}

main().catch(err => {
  console.error('\n[ERRO]', err.response?.status ?? '', err.response?.data ?? err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data).slice(0, 500));
  process.exit(1);
});
