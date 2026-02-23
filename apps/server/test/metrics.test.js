const test = require("node:test");
const assert = require("node:assert/strict");
const {
  filterSales,
  getSalesByPeriod,
  getSalesByStore,
  getSalesByState,
  getSalesByPlatform,
  getCancellationsByReason,
  getCanceledDetails,
  getTicketByState,
  getCanceledSummary,
  getAbc,
  getAbcDetails,
  getSummary,
  getStores,
  getStates
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
    orderId: "PED-3",
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
  // PED-1 (R$100) + PED-3 (R$150) = 2 pedidos, media = 125
  assert.equal(tickets[0].average, 125);
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

// ── Novos testes: filterSales ──

test("filterSales filtra por data inicio e fim", () => {
  const filtered = filterSales(sampleSales, {
    start: "2026-01-01",
    end: "2026-01-31"
  });
  // Deve retornar apenas as vendas de janeiro (2 jan e 3 jan)
  assert.equal(filtered.length, 2);
});

test("filterSales filtra por loja", () => {
  const filtered = filterSales(sampleSales, { store: "Loja Shopping" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].store, "Loja Shopping");
});

test("filterSales filtra por estado", () => {
  const filtered = filterSales(sampleSales, { state: "RJ" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].state, "RJ");
});

test("filterSales filtra por plataforma", () => {
  const filtered = filterSales(sampleSales, { platform: "Shopee" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].platform, "Shopee");
});

test("filterSales com multiplos filtros combinados", () => {
  const filtered = filterSales(sampleSales, {
    store: "Loja Centro",
    state: "SP",
    platform: "Mercado Livre"
  });
  assert.equal(filtered.length, 2);
});

test("filterSales retorna tudo sem filtros", () => {
  const filtered = filterSales(sampleSales, {});
  assert.equal(filtered.length, 3);
});

// ── Novos testes: getCanceledDetails ──

test("getCanceledDetails retorna detalhes formatados", () => {
  const details = getCanceledDetails(sampleSales, {});
  assert.equal(details.length, 1);
  assert.equal(details[0].orderId, "PED-2");
  assert.equal(details[0].product, "Produto B");
  assert.equal(details[0].cancelReason, "Estoque");
  assert.ok(details[0].total > 0);
});

test("getCanceledDetails sem cancelamentos retorna array vazio", () => {
  const activeSales = sampleSales.filter(s => s.status !== "Cancelado");
  const details = getCanceledDetails(activeSales, {});
  assert.equal(details.length, 0);
});

// ── Novos testes: getSalesByPeriod com diferentes periodos ──

test("sales-by-period agrega por dia", () => {
  const periods = getSalesByPeriod(sampleSales, { period: "day" });
  assert.equal(periods.length, 3);
  assert.equal(periods[0].period, "2026-01-02");
});

test("sales-by-period agrega por semana", () => {
  const periods = getSalesByPeriod(sampleSales, { period: "week" });
  assert.ok(periods.length >= 1);
  assert.ok(periods[0].period.includes("W"), "periodo deve conter 'W' para semana");
});

// ── Novos testes: getSummary edge cases ──

test("summary com array vazio retorna zeros", () => {
  const summary = getSummary([], {});
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.totalQuantity, 0);
  assert.equal(summary.totalStores, 0);
  assert.equal(summary.totalProducts, 0);
  assert.equal(summary.totalStates, 0);
  assert.equal(summary.totalSales, 0);
  assert.equal(summary.ticketAverage, 0);
  assert.equal(summary.canceledTotal, 0);
  assert.equal(summary.canceledOrders, 0);
});

// ── Novos testes: getStores e getStates ──

test("getStores retorna lojas unicas ordenadas", () => {
  const stores = getStores(sampleSales);
  assert.deepEqual(stores, ["Loja Centro", "Loja Shopping"]);
});

test("getStates retorna estados unicos ordenados", () => {
  const states = getStates(sampleSales);
  assert.deepEqual(states, ["RJ", "SP"]);
});

// ── Novos testes: status de cancelamento variantes ──

test("status 'para devolver' conta como cancelado", () => {
  const summary = getSummary([
    { ...sampleSales[0], orderId: "PED-10", status: "Para Devolver" }
  ], {});
  assert.equal(summary.canceledOrders, 1);
  assert.equal(summary.totalSales, 0);
});

test("status 'pos-venda' conta como cancelado", () => {
  const summary = getSummary([
    { ...sampleSales[0], orderId: "PED-11", status: "Pós-Venda" }
  ], {});
  assert.equal(summary.canceledOrders, 1);
});

test("abc details sem adName retorna vazio", () => {
  const details = getAbcDetails(sampleSales, {});
  assert.equal(details.adName, "");
  assert.equal(details.variations.length, 0);
  assert.equal(details.sizes.length, 0);
});
