const test = require("node:test");
const assert = require("node:assert/strict");

// Injetar mock do db/connection ANTES de importar o repository
const { mockDb, setQueryResults, setClientQueryResults, resetMock, getQueryCalls, getClientQueryCalls } = require("./helpers/mockDb");
const connectionPath = require.resolve("../src/db/connection");
require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };

const salesRepo = require("../src/db/salesRepository");

test("batchUpsertSales retorna zeros para array vazio", async () => {
  resetMock();
  const result = await salesRepo.batchUpsertSales([]);
  assert.deepEqual(result, { inserted: 0, updated: 0 });
});

test("batchUpsertSales retorna zeros para null", async () => {
  resetMock();
  const result = await salesRepo.batchUpsertSales(null);
  assert.deepEqual(result, { inserted: 0, updated: 0 });
});

test("batchUpsertSales deduplica por orderId|product|variation", async () => {
  resetMock();
  setClientQueryResults([
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [{ inserted: true }, { inserted: true }], rowCount: 2 }, // INSERT
    { rows: [], rowCount: 0 } // COMMIT
  ]);

  const salesData = [
    { orderId: "PED-1", product: "Prod A", variation: "M", date: new Date(), total: 100, quantity: 1 },
    { orderId: "PED-1", product: "Prod A", variation: "M", date: new Date(), total: 120, quantity: 1 }, // duplicata
    { orderId: "PED-2", product: "Prod B", variation: "", date: new Date(), total: 80, quantity: 2 }
  ];

  await salesRepo.batchUpsertSales(salesData);

  const clientCalls = getClientQueryCalls();
  // BEGIN, INSERT (com 2 rows deduplicados), COMMIT
  assert.equal(clientCalls.length, 3);
  // A query INSERT deve ter parâmetros para 2 rows (não 3)
  const insertCall = clientCalls[1];
  // Cada row tem 21 params
  assert.equal(insertCall.params.length, 2 * 21);
});

test("getSales sem filtros retorna todos e converte NUMERIC", async () => {
  resetMock();
  setQueryResults([
    { rows: [
      { orderId: "PED-1", quantity: "2", total: "100.50", unitPrice: "50.25", store: "Loja A" },
      { orderId: "PED-2", quantity: "1", total: "80", unitPrice: "80", store: "Loja B" }
    ]}
  ]);

  const sales = await salesRepo.getSales();
  assert.equal(sales.length, 2);
  // Deve converter string para number
  assert.equal(typeof sales[0].quantity, "number");
  assert.equal(sales[0].quantity, 2);
  assert.equal(sales[0].total, 100.50);
  assert.equal(sales[0].unitPrice, 50.25);
});

test("getSales com filtro de data constroi WHERE correto", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await salesRepo.getSales({ start: "2026-01-01", end: "2026-01-31" });

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("date >= $1"));
  assert.ok(calls[0].text.includes("date <= $2"));
  assert.equal(calls[0].params.length, 2);
});

test("getSales com filtro de loja", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await salesRepo.getSales({ store: "Loja Centro" });

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("store = $1"));
  assert.deepEqual(calls[0].params, ["Loja Centro"]);
});

test("getSales com todos os filtros", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await salesRepo.getSales({
    start: "2026-01-01",
    end: "2026-01-31",
    store: "Loja A",
    state: "SP",
    platform: "Shopee",
    status: "Cancelado",
    sale_channel: "online"
  });

  const calls = getQueryCalls();
  assert.equal(calls[0].params.length, 7);
});

test("getSales converte NUMERIC nulo para 0", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ orderId: "PED-1", quantity: null, total: null, unitPrice: null }] }
  ]);

  const sales = await salesRepo.getSales();
  assert.equal(sales[0].quantity, 0);
  assert.equal(sales[0].total, 0);
  assert.equal(sales[0].unitPrice, 0);
});

test("hasSales retorna true quando existe", async () => {
  resetMock();
  setQueryResults([{ rows: [{ exists: true }] }]);

  const result = await salesRepo.hasSales();
  assert.equal(result, true);
});

test("hasSales retorna false quando vazio", async () => {
  resetMock();
  setQueryResults([{ rows: [{ exists: false }] }]);

  const result = await salesRepo.hasSales();
  assert.equal(result, false);
});

test("clearSales executa TRUNCATE", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await salesRepo.clearSales();

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("TRUNCATE sales"));
});

test("getStores retorna array de nomes", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ store: "Loja A" }, { store: "Loja B" }] }
  ]);

  const stores = await salesRepo.getStores();
  assert.deepEqual(stores, ["Loja A", "Loja B"]);
});

test("getStates retorna array de estados", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ state: "MG" }, { state: "SP" }] }
  ]);

  const states = await salesRepo.getStates();
  assert.deepEqual(states, ["MG", "SP"]);
});

test("getLastUpdate retorna data ou null", async () => {
  resetMock();
  setQueryResults([{ rows: [{ last_update: "2026-01-15T10:00:00Z" }] }]);

  const result = await salesRepo.getLastUpdate();
  assert.equal(result, "2026-01-15T10:00:00Z");
});

test("getLastUpdate retorna null quando sem dados", async () => {
  resetMock();
  setQueryResults([{ rows: [{ last_update: null }] }]);

  const result = await salesRepo.getLastUpdate();
  assert.equal(result, null);
});

test("getDailyRevenue retorna valor numerico", async () => {
  resetMock();
  setQueryResults([{ rows: [{ revenue: "1234.56" }] }]);

  const result = await salesRepo.getDailyRevenue("2026-01-15");
  assert.equal(result, 1234.56);
  assert.equal(typeof result, "number");
});

test("getDailyRevenue com filtros de loja e canal", async () => {
  resetMock();
  setQueryResults([{ rows: [{ revenue: "500" }] }]);

  await salesRepo.getDailyRevenue("2026-01-15", { store: "Loja A", sale_channel: "online" });

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("store = $2"));
  assert.ok(calls[0].text.includes("sale_channel = $3"));
});

test("searchSales busca por termo e converte NUMERIC", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ orderId: "PED-1", quantity: "3", total: "150", unitPrice: "50" }] }
  ]);

  const results = await salesRepo.searchSales("PED-1");
  assert.equal(results.length, 1);
  assert.equal(typeof results[0].quantity, "number");

  const calls = getQueryCalls();
  assert.ok(calls[0].params[0].includes("PED-1"));
});
