const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Testa a lógica de seleção de fonte de receita do endpoint /summary.
 * Extrai a lógica pura para testar sem HTTP.
 *
 * Regras:
 * 1. Sem filtro de loja → UpSeller total + Fábrica (Sisplan)
 * 2. Loja específica do UpSeller → shopTops.validSales
 * 3. Fábrica → dados da tabela sales (Sisplan)
 * 4. Analytics indisponível → fallback para tabela sales
 */

function resolveRevenue({ salesTodayRevenue, salesYesterdayRevenue, storeFilter, analytics, fabricaToday, fabricaYesterday }) {
  let todayRevenue = salesTodayRevenue;
  let yesterdayRevenue = salesYesterdayRevenue;
  const isFabrica = (storeFilter || '').toLowerCase() === 'fabrica';

  if (!isFabrica) {
    if (analytics && analytics.todaySaleAmount > 0) {
      if (!storeFilter) {
        todayRevenue = parseFloat(analytics.todaySaleAmount) + (fabricaToday || 0);
        yesterdayRevenue = parseFloat(analytics.yesterdaySaleAmount) + (fabricaYesterday || 0);
      } else {
        const shopTops = analytics.shopTops || [];
        const match = shopTops.find(s =>
          (s.shopName || '').toLowerCase() === storeFilter.toLowerCase()
        );
        if (match) {
          todayRevenue = parseFloat(match.validSales || 0);
        }
      }
    }
  }

  return { todayRevenue, yesterdayRevenue };
}

const analyticsData = {
  todaySaleAmount: "5000.00",
  yesterdaySaleAmount: "8000.00",
  shopTops: [
    { shopId: 1, shopName: "Kids 2 (Shopee)", platform: "shopee", validOrders: 24, validSales: 1494.90 },
    { shopId: 2, shopName: "Pula pula (Shopee)", platform: "shopee", validOrders: 20, validSales: 1200.50 },
    { shopId: 3, shopName: "Pula Pula Pipoquinha Moda Kids (Mercado Livre)", platform: "mercadolivre", validOrders: 5, validSales: 300 },
  ],
};

// ─── Regra 1: Sem filtro → UpSeller total + Fábrica ─────────────────────────

test("sem filtro: usa UpSeller total + Fabrica", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 6000,
    salesYesterdayRevenue: 9000,
    storeFilter: "",
    analytics: analyticsData,
    fabricaToday: 500,
    fabricaYesterday: 800,
  });

  assert.equal(result.todayRevenue, 5500);  // 5000 + 500
  assert.equal(result.yesterdayRevenue, 8800); // 8000 + 800
});

test("sem filtro e sem Fabrica: usa UpSeller total puro", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 6000,
    salesYesterdayRevenue: 9000,
    storeFilter: "",
    analytics: analyticsData,
    fabricaToday: 0,
    fabricaYesterday: 0,
  });

  assert.equal(result.todayRevenue, 5000);
  assert.equal(result.yesterdayRevenue, 8000);
});

// ─── Regra 2: Loja UpSeller → shopTops.validSales ──────────────────────────

test("filtro Kids 2 (Shopee): usa shopTops.validSales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 2000,
    salesYesterdayRevenue: 3000,
    storeFilter: "Kids 2 (Shopee)",
    analytics: analyticsData,
  });

  assert.equal(result.todayRevenue, 1494.90);
  // yesterdayRevenue keeps sales table value (no per-store yesterday data)
  assert.equal(result.yesterdayRevenue, 3000);
});

test("filtro Pula pula (Shopee): usa shopTops.validSales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 1500,
    salesYesterdayRevenue: 2500,
    storeFilter: "Pula pula (Shopee)",
    analytics: analyticsData,
  });

  assert.equal(result.todayRevenue, 1200.50);
});

test("filtro loja case insensitive match", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 2000,
    salesYesterdayRevenue: 3000,
    storeFilter: "kids 2 (shopee)",
    analytics: analyticsData,
  });

  assert.equal(result.todayRevenue, 1494.90);
});

test("filtro loja nao encontrada no shopTops: usa dados sales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 800,
    salesYesterdayRevenue: 1200,
    storeFilter: "Loja Inexistente",
    analytics: analyticsData,
  });

  // Fallback to sales table
  assert.equal(result.todayRevenue, 800);
  assert.equal(result.yesterdayRevenue, 1200);
});

// ─── Regra 3: Fábrica → tabela sales (Sisplan) ─────────────────────────────

test("filtro Fabrica: ignora UpSeller, usa dados Sisplan", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 1500,
    salesYesterdayRevenue: 2000,
    storeFilter: "Fabrica",
    analytics: analyticsData,
  });

  assert.equal(result.todayRevenue, 1500);
  assert.equal(result.yesterdayRevenue, 2000);
});

test("filtro fabrica (minusculo): ignora UpSeller", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 1500,
    salesYesterdayRevenue: 2000,
    storeFilter: "fabrica",
    analytics: analyticsData,
  });

  assert.equal(result.todayRevenue, 1500);
  assert.equal(result.yesterdayRevenue, 2000);
});

// ─── Regra 4: Analytics indisponível → fallback sales ───────────────────────

test("analytics null: usa dados sales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 3000,
    salesYesterdayRevenue: 4000,
    storeFilter: "",
    analytics: null,
  });

  assert.equal(result.todayRevenue, 3000);
  assert.equal(result.yesterdayRevenue, 4000);
});

test("analytics com todaySaleAmount zero: usa dados sales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 3000,
    salesYesterdayRevenue: 4000,
    storeFilter: "",
    analytics: { todaySaleAmount: 0, yesterdaySaleAmount: 0, shopTops: [] },
  });

  assert.equal(result.todayRevenue, 3000);
  assert.equal(result.yesterdayRevenue, 4000);
});

test("analytics com shopTops vazio: loja especifica usa sales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 1000,
    salesYesterdayRevenue: 2000,
    storeFilter: "Kids 2 (Shopee)",
    analytics: { todaySaleAmount: "5000", yesterdaySaleAmount: "8000", shopTops: [] },
  });

  // shopTops empty, no match → fallback to sales
  assert.equal(result.todayRevenue, 1000);
});

test("analytics com shopTops null: loja especifica usa sales", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 1000,
    salesYesterdayRevenue: 2000,
    storeFilter: "Kids 2 (Shopee)",
    analytics: { todaySaleAmount: "5000", yesterdaySaleAmount: "8000", shopTops: null },
  });

  assert.equal(result.todayRevenue, 1000);
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

test("todaySaleAmount como string numerica funciona", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 0,
    salesYesterdayRevenue: 0,
    storeFilter: "",
    analytics: { todaySaleAmount: "3500.50", yesterdaySaleAmount: "7200.00", shopTops: [] },
    fabricaToday: 100,
    fabricaYesterday: 200,
  });

  assert.equal(result.todayRevenue, 3600.50);
  assert.equal(result.yesterdayRevenue, 7400);
});

test("validSales como numero funciona", () => {
  const result = resolveRevenue({
    salesTodayRevenue: 0,
    salesYesterdayRevenue: 0,
    storeFilter: "Kids 2 (Shopee)",
    analytics: {
      todaySaleAmount: "5000",
      yesterdaySaleAmount: "8000",
      shopTops: [{ shopName: "Kids 2 (Shopee)", validSales: 1494.90 }],
    },
  });

  assert.equal(result.todayRevenue, 1494.90);
});
