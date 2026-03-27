/**
 * Testa o endpoint de catálogo de produtos do Upseller por plataforma.
 * Uso: node scripts/test-upseller-products.js [platform]
 * Plataformas: mercado | shopee | shein | tiktok
 */

const axios = require('axios');
const { getOrCreateSession } = require('../apps/server/src/services/upsellerSyncService');

const PLATFORM_URLS = {
  mercado: 'https://app.upseller.com/api/mercado/product/export',
  shopee:  'https://app.upseller.com/api/shopee/product/Export',
  shein:   'https://app.upseller.com/api/shein/product/export',
  tiktok:  'https://app.upseller.com/api/tiktok/product/export',
};

async function main() {
  const platform = process.argv[2] || 'shopee';
  const url = PLATFORM_URLS[platform];

  if (!url) {
    console.error(`Plataforma inválida. Use: ${Object.keys(PLATFORM_URLS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n[Upseller] Buscando produtos da plataforma: ${platform}`);
  console.log(`[Upseller] URL: ${url}\n`);

  const cookies = await getOrCreateSession();
  if (!cookies) {
    console.error('[Upseller] Sessão não disponível.');
    process.exit(1);
  }

  const params = new URLSearchParams({ pageNum: '1', pageSize: '10' });
  const { data } = await axios.post(url, params.toString(), {
    headers: {
      Cookie: cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    timeout: 30000,
  });

  // Mostra estrutura resumida
  if (Array.isArray(data)) {
    console.log(`Total de registros: ${data.length}`);
    if (data.length > 0) {
      console.log('\nChaves do primeiro registro:');
      console.log(Object.keys(data[0]));
      console.log('\nPrimeiros 3 registros:');
      console.log(JSON.stringify(data.slice(0, 3), null, 2));
    }
  } else if (data && typeof data === 'object') {
    console.log('Tipo: objeto');
    console.log('Chaves:', Object.keys(data));
    if (data.data && Array.isArray(data.data)) {
      console.log(`Total em data.data: ${data.data.length}`);
      if (data.data.length > 0) {
        console.log('\nChaves do primeiro item:');
        console.log(Object.keys(data.data[0]));
        console.log('\nPrimeiros 3 itens:');
        console.log(JSON.stringify(data.data.slice(0, 3), null, 2));
      }
    } else {
      console.log('\nResposta completa:');
      console.log(JSON.stringify(data, null, 2));
    }
  } else {
    console.log('Resposta:', data);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[ERRO]', err.response?.status, err.response?.data || err.message);
  process.exit(1);
});
