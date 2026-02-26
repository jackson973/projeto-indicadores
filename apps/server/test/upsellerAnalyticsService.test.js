const test = require("node:test");
const assert = require("node:assert/strict");

// ─── Mock setup ─────────────────────────────────────────────────────────────
// Mock db/connection for repositories
const { mockDb, setQueryResults, resetMock, getQueryCalls } = require("./helpers/mockDb");
const connectionPath = require.resolve("../src/db/connection");
require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };

// Mock axios
let axiosPostResult = null;
let axiosGetResult = null;
let axiosPostCalls = [];
let axiosGetCalls = [];

const mockAxios = {
  post: async (url, data, config) => {
    axiosPostCalls.push({ url, data, config });
    if (axiosPostResult instanceof Error) throw axiosPostResult;
    return axiosPostResult;
  },
  get: async (url, config) => {
    axiosGetCalls.push({ url, config });
    if (axiosGetResult instanceof Error) throw axiosGetResult;
    return axiosGetResult;
  }
};

const axiosPath = require.resolve("axios");
require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: mockAxios };

// Mock node-cron
let cronScheduleCalls = [];
const mockCron = {
  schedule: (expr, fn, opts) => {
    cronScheduleCalls.push({ expr, fn, opts });
    return { stop: () => {} };
  }
};
const cronPath = require.resolve("node-cron");
require.cache[cronPath] = { id: cronPath, filename: cronPath, loaded: true, exports: mockCron };

// Now import the service
const service = require("../src/services/upsellerAnalyticsService");

function resetAll() {
  resetMock();
  axiosPostResult = null;
  axiosGetResult = null;
  axiosPostCalls = [];
  axiosGetCalls = [];
  cronScheduleCalls = [];
}

const sampleApiResponse = {
  data: {
    code: 0,
    msg: "success",
    data: {
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
    }
  }
};

// ─── syncAnalytics ──────────────────────────────────────────────────────────

test("syncAnalytics retorna erro quando sem cookies de sessao", async () => {
  resetAll();
  // getSessionCookies returns null
  setQueryResults([{ rows: [{ sessionCookies: null, sessionSavedAt: null }] }]);

  const result = await service.syncAnalytics();
  assert.equal(result.success, false);
  assert.ok(result.message.includes("sessão"));
});

test("syncAnalytics retorna erro quando sessao expirada", async () => {
  resetAll();
  // getSessionCookies returns cookies
  setQueryResults([{
    rows: [{ sessionCookies: "valid_cookie=abc", sessionSavedAt: new Date() }]
  }]);
  // checkSession returns false (is-login fails)
  axiosGetResult = { data: { code: 0, data: false } };

  const result = await service.syncAnalytics();
  assert.equal(result.success, false);
  assert.ok(result.message.includes("expirada"));
});

test("syncAnalytics faz sync com sucesso quando tudo ok", async () => {
  resetAll();
  // getSessionCookies returns cookies
  setQueryResults([
    { rows: [{ sessionCookies: "valid_cookie=abc", sessionSavedAt: new Date() }] },
    // upsertDailyAnalytics RETURNING
    { rows: [{ id: 1 }] },
  ]);
  // checkSession ok
  axiosGetResult = { data: { code: 0, data: true } };
  // per-hour API response
  axiosPostResult = sampleApiResponse;

  const result = await service.syncAnalytics();
  assert.equal(result.success, true);

  // Verify axios.post was called with correct params
  assert.equal(axiosPostCalls.length, 1);
  assert.ok(axiosPostCalls[0].url.includes("per-hour"));
  assert.equal(axiosPostCalls[0].data.topFlag, true);
  assert.ok(axiosPostCalls[0].data.currencyTime); // has date
  assert.ok(axiosPostCalls[0].config.headers.Cookie, "valid_cookie=abc");

  // Verify upsert was called
  const dbCalls = getQueryCalls();
  const upsertCall = dbCalls.find(c => c.text.includes("INSERT INTO upseller_daily_analytics"));
  assert.ok(upsertCall);
});

test("syncAnalytics trata erro da API gracefully", async () => {
  resetAll();
  setQueryResults([
    { rows: [{ sessionCookies: "cookie=abc", sessionSavedAt: new Date() }] },
  ]);
  axiosGetResult = { data: { code: 0, data: true } };
  axiosPostResult = { data: { code: -1, msg: "API Error" } };

  const result = await service.syncAnalytics();
  assert.equal(result.success, false);
  assert.ok(result.message.includes("API Error"));
});

test("syncAnalytics trata erro de rede gracefully", async () => {
  resetAll();
  setQueryResults([
    { rows: [{ sessionCookies: "cookie=abc", sessionSavedAt: new Date() }] },
  ]);
  axiosGetResult = { data: { code: 0, data: true } };
  axiosPostResult = new Error("Network timeout");

  const result = await service.syncAnalytics();
  assert.equal(result.success, false);
  assert.ok(result.message.includes("Network timeout"));
});

// ─── getTodayAnalytics ──────────────────────────────────────────────────────

test("getTodayAnalytics retorna dados frescos do cache", async () => {
  resetAll();
  const freshData = {
    id: 1,
    referenceDate: "2026-02-25",
    fetchedAt: new Date(), // fresh
    todaySaleAmount: "3000.00",
    shopTops: [{ shopName: "Loja A", validSales: 1000 }],
  };
  // isFresh query + getDailyAnalytics query
  setQueryResults([
    { rows: [freshData] }, // isFresh calls getDailyAnalytics internally
    { rows: [freshData] }, // getTodayAnalytics calls getDailyAnalytics
  ]);

  const result = await service.getTodayAnalytics();
  assert.ok(result);
  assert.equal(result.todaySaleAmount, "3000.00");

  // Should NOT have called axios (no sync needed)
  assert.equal(axiosPostCalls.length, 0);
});

test("getTodayAnalytics retorna dados stale como fallback", async () => {
  resetAll();
  const staleData = {
    id: 1,
    referenceDate: "2026-02-25",
    fetchedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
    todaySaleAmount: "2000.00",
  };
  setQueryResults([
    { rows: [staleData] }, // isFresh → false (stale)
    // syncAnalytics → getSessionCookies fails
    { rows: [{ sessionCookies: null, sessionSavedAt: null }] },
    // fallback getDailyAnalytics
    { rows: [staleData] },
  ]);

  const result = await service.getTodayAnalytics();
  assert.ok(result);
  assert.equal(result.todaySaleAmount, "2000.00");
});

test("getTodayAnalytics retorna null quando sem dados", async () => {
  resetAll();
  setQueryResults([
    { rows: [] }, // isFresh → false (no data)
    // syncAnalytics → getSessionCookies fails
    { rows: [{ sessionCookies: null, sessionSavedAt: null }] },
    // fallback getDailyAnalytics → null
    { rows: [] },
  ]);

  const result = await service.getTodayAnalytics();
  assert.equal(result, null);
});
