const test = require("node:test");
const assert = require("node:assert/strict");

// Injetar mock do db/connection ANTES de importar o repository
const { mockDb, setQueryResults, resetMock, getQueryCalls } = require("./helpers/mockDb");
const connectionPath = require.resolve("../src/db/connection");
require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };

const analyticsRepo = require("../src/db/upsellerAnalyticsRepository");

const sampleData = {
  perHour: [{ hour: "2026-02-25 08:00:00", amount: 500, validOrders: 10 }],
  yesPerHour: [{ hour: "2026-02-24 08:00:00", amount: 300, validOrders: 6 }],
  productTops: [{ shopId: 1, shopName: "Loja A", productName: "Produto X", unitsSold: 5, sales: 250 }],
  shopTops: [{ shopId: 1, shopName: "Loja A", platform: "shopee", validOrders: 20, validSales: 1000 }],
  todayOrderNum: 50,
  todaySaleAmount: 3000,
  yesterdayOrderNum: 80,
  yesterdaySaleAmount: 5000,
  yesterdayPeriodOrderNum: 30,
  yesterdayPeriodSaleAmount: 2000,
  currency: "BRL",
};

// ─── upsertDailyAnalytics ────────────────────────────────────────────────────

test("upsertDailyAnalytics insere dados e retorna registro", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 1, reference_date: "2026-02-25", today_sale_amount: 3000 }] }
  ]);

  const result = await analyticsRepo.upsertDailyAnalytics("2026-02-25", sampleData);

  assert.ok(result);
  assert.equal(result.id, 1);

  const calls = getQueryCalls();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes("INSERT INTO upseller_daily_analytics"));
  assert.ok(calls[0].text.includes("ON CONFLICT (reference_date) DO UPDATE"));
  assert.equal(calls[0].params[0], "2026-02-25");
  assert.equal(calls[0].params[5], 50);  // todayOrderNum
  assert.equal(calls[0].params[6], 3000); // todaySaleAmount
});

test("upsertDailyAnalytics serializa arrays como JSON", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 1 }] }]);

  await analyticsRepo.upsertDailyAnalytics("2026-02-25", sampleData);

  const calls = getQueryCalls();
  // perHour (param 1) should be JSON string
  assert.equal(typeof calls[0].params[1], "string");
  const parsed = JSON.parse(calls[0].params[1]);
  assert.equal(parsed[0].amount, 500);

  // shopTops (param 4) should be JSON string
  const shopTops = JSON.parse(calls[0].params[4]);
  assert.equal(shopTops[0].shopName, "Loja A");
  assert.equal(shopTops[0].validSales, 1000);
});

test("upsertDailyAnalytics usa defaults para dados ausentes", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 1 }] }]);

  await analyticsRepo.upsertDailyAnalytics("2026-02-25", {});

  const calls = getQueryCalls();
  assert.equal(calls[0].params[1], "[]"); // perHour default
  assert.equal(calls[0].params[4], "[]"); // shopTops default
  assert.equal(calls[0].params[5], 0);    // todayOrderNum default
  assert.equal(calls[0].params[6], 0);    // todaySaleAmount default
  assert.equal(calls[0].params[11], "BRL"); // currency default
});

test("upsertDailyAnalytics retorna null quando sem RETURNING", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const result = await analyticsRepo.upsertDailyAnalytics("2026-02-25", sampleData);
  assert.equal(result, null);
});

// ─── getDailyAnalytics ──────────────────────────────────────────────────────

test("getDailyAnalytics retorna dados do dia", async () => {
  resetMock();
  setQueryResults([{
    rows: [{
      id: 1,
      referenceDate: "2026-02-25",
      perHour: [{ hour: "08:00", amount: 500 }],
      shopTops: [{ shopName: "Loja A", validSales: 1000 }],
      productTops: [{ productName: "Produto X", sales: 250 }],
      todayOrderNum: 50,
      todaySaleAmount: "3000.00",
      yesterdaySaleAmount: "5000.00",
      fetchedAt: new Date("2026-02-25T12:00:00Z"),
    }]
  }]);

  const result = await analyticsRepo.getDailyAnalytics("2026-02-25");

  assert.ok(result);
  assert.equal(result.referenceDate, "2026-02-25");
  assert.equal(result.todayOrderNum, 50);
  assert.equal(result.shopTops[0].shopName, "Loja A");

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("WHERE reference_date = $1"));
  assert.deepEqual(calls[0].params, ["2026-02-25"]);
});

test("getDailyAnalytics retorna null quando nao encontrado", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const result = await analyticsRepo.getDailyAnalytics("2099-01-01");
  assert.equal(result, null);
});

// ─── isFresh ────────────────────────────────────────────────────────────────

test("isFresh retorna true quando dados sao recentes", async () => {
  resetMock();
  setQueryResults([{
    rows: [{
      id: 1,
      referenceDate: "2026-02-25",
      fetchedAt: new Date(), // agora = fresh
      todaySaleAmount: "1000",
    }]
  }]);

  const result = await analyticsRepo.isFresh("2026-02-25");
  assert.equal(result, true);
});

test("isFresh retorna false quando dados sao antigos", async () => {
  resetMock();
  const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
  setQueryResults([{
    rows: [{
      id: 1,
      referenceDate: "2026-02-25",
      fetchedAt: oldDate,
      todaySaleAmount: "1000",
    }]
  }]);

  const result = await analyticsRepo.isFresh("2026-02-25"); // default 5 min
  assert.equal(result, false);
});

test("isFresh retorna false quando nao ha dados", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const result = await analyticsRepo.isFresh("2099-01-01");
  assert.equal(result, false);
});

test("isFresh respeita maxAgeMs customizado", async () => {
  resetMock();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
  setQueryResults([{
    rows: [{
      id: 1,
      referenceDate: "2026-02-25",
      fetchedAt: twoMinAgo,
      todaySaleAmount: "1000",
    }]
  }]);

  // 1 min max = stale
  assert.equal(await analyticsRepo.isFresh("2026-02-25", 1 * 60 * 1000), false);

  // Reset e repetir com 5 min max = fresh
  resetMock();
  setQueryResults([{
    rows: [{
      id: 1,
      referenceDate: "2026-02-25",
      fetchedAt: twoMinAgo,
      todaySaleAmount: "1000",
    }]
  }]);
  assert.equal(await analyticsRepo.isFresh("2026-02-25", 5 * 60 * 1000), true);
});
