const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getSalesByPeriod,
  getSalesByStore,
  getSalesByState,
  getSalesByPlatform,
  getCancellationsByReason,
  getTicketByState,
  getCanceledSummary,
  getAbc,
  getAbcDetails,
  getSummary
} = require("../src/lib/metrics");

const sampleSales = [
  {
  date: new Date(2026, 0, 2),
    store: "Loja Centro",
    product: "Produto A",
    adName: "Anuncio Alpha",
    variation: "Cor: Azul, M",
    sku: "Anuncio Alpha-Azul-M",
    quantity: 2,
    total: 100,
    state: "SP",
    platform: "Mercado Livre",
  status: "",
    orderId: "PED-1",
    cancelReason: ""
  },
  {
  date: new Date(2026, 0, 3),
    store: "Loja Shopping",
    product: "Produto B",
    adName: "Anuncio Beta",
    variation: "Cor: Vermelho, G",
    sku: "Anuncio Beta-Vermelho-G",
    quantity: 1,
    total: 80,
    state: "RJ",
    platform: "Shopee",
  status: "Cancelado",
    orderId: "PED-2",
    cancelReason: "Estoque"
  },
  {
  date: new Date(2026, 1, 1),
    store: "Loja Centro",
    product: "Produto A",
    adName: "Anuncio Alpha",
    variation: "Cor: Azul, M",
    sku: "Anuncio Alpha-Azul-M",
    quantity: 3,
    total: 150,
    state: "SP",
    platform: "Mercado Livre",
  status: "",
    orderId: "PED-1",
    cancelReason: ""
  }
];

const placeholderStatusSales = [
  {
    date: new Date(2026, 0, 4),
    store: "Loja Centro",
    product: "Produto C",
    adName: "Anuncio Gamma",
    variation: "",
    sku: "",
    quantity: 1,
    total: 50,
    state: "SP",
    platform: "Mercado Livre",
  status: "-",
    orderId: "PED-3",
    cancelReason: ""
  }
];

test("summary calcula totais", () => {
  const summary = getSummary(sampleSales, {});
  assert.equal(summary.totalRevenue, 250);
  assert.equal(summary.totalQuantity, 5);
  assert.equal(summary.totalStores, 1);
  assert.equal(summary.totalProducts, 1);
  assert.equal(summary.totalStates, 1);
  assert.equal(summary.totalSales, 2);
  assert.equal(summary.ticketAverage, 125);
  assert.equal(summary.canceledTotal, 80);
  assert.equal(summary.canceledOrders, 1);
});

test("sales-by-period agrega por mês", () => {
  const periods = getSalesByPeriod(sampleSales, { period: "month" });
  assert.equal(periods.length, 2);
  assert.equal(periods[0].total, 180);
});

test("sales-by-store agrega por loja", () => {
  const stores = getSalesByStore(sampleSales, {});
  assert.equal(stores[0].store, "Loja Centro");
  assert.equal(stores[0].total, 250);
});

test("sales-by-state agrega por estado", () => {
  const states = getSalesByState(sampleSales, {});
  assert.equal(states[0].state, "SP");
  assert.equal(states[0].total, 250);
});

test("sales-by-state respeita filtro de loja", () => {
  const states = getSalesByState(sampleSales, { store: "Loja Shopping" });
  assert.equal(states.length, 1);
  assert.equal(states[0].state, "RJ");
  assert.equal(states[0].total, 80);
});

test("sales-by-platform agrega por plataforma", () => {
  const platforms = getSalesByPlatform(sampleSales, {});
  assert.equal(platforms[0].platform, "Mercado Livre");
  assert.equal(platforms[0].total, 250);
});

test("cancellations-by-reason agrega motivo", () => {
  const reasons = getCancellationsByReason(sampleSales, {});
  assert.equal(reasons[0].reason, "Estoque");
  assert.equal(reasons[0].count, 1);
});

test("status placeholder nao conta como cancelado", () => {
  const summary = getSummary(placeholderStatusSales, {});
  assert.equal(summary.canceledOrders, 0);
  assert.equal(summary.totalSales, 1);
});

test("status fora da lista nao conta como cancelado", () => {
  const summary = getSummary([
    {
      ...sampleSales[0],
      orderId: "PED-4",
      status: "Pago"
    }
  ], {});
  assert.equal(summary.canceledOrders, 0);
  assert.equal(summary.totalSales, 1);
});

test("status com texto extra conta como cancelado", () => {
  const summary = getSummary([
    {
      ...sampleSales[1],
      orderId: "PED-5",
      status: "Cancelado - Cliente"
    }
  ], {});
  assert.equal(summary.canceledOrders, 1);
  assert.equal(summary.totalSales, 0);
});

test("canceled summary agrega por razao com pedidos unicos", () => {
  const payload = [
    {
      ...sampleSales[1],
      orderId: "PED-2",
      cancelReason: "Estoque"
    },
    {
      ...sampleSales[1],
      orderId: "PED-2",
      quantity: 2,
      total: 160,
      cancelReason: "Estoque"
    },
    {
      ...sampleSales[1],
      orderId: "PED-6",
      cancelReason: "Cliente"
    }
  ];
  const summary = getCanceledSummary(payload, {});
  assert.equal(summary.orders, 2);
  assert.equal(summary.reasons.length, 2);
  assert.equal(summary.reasons[0].orders, 1);
});

test("ticket-by-state calcula media por pedido", () => {
  const tickets = getTicketByState(sampleSales, {});
  assert.equal(tickets[0].state, "SP");
  assert.equal(tickets[0].average, 250);
});

test("abc classifica produtos", () => {
  const abc = getAbc(sampleSales, {});
  assert.equal(abc.length, 2);
  assert.equal(abc[0].product, "Anuncio Alpha");
  assert.equal(abc[0].platformLabel, "Mercado Livre");
  assert.equal(abc[0].classification, "A");
});

test("abc details agrega variacoes e tamanhos", () => {
  const details = getAbcDetails(sampleSales, { adName: "Anuncio Alpha" });
  assert.equal(details.variations.length, 1);
  assert.equal(details.variations[0].variation, "Cor: Azul");
  assert.equal(details.variations[0].quantity, 5);
  assert.equal(details.sizes[0].size, "M");
  assert.equal(details.sizes[0].quantity, 5);
});
