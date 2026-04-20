const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const { authenticate, requireAdmin } = require('../middleware/auth');
const { setSales, hasSales } = require("../lib/dataStore");
const {
  getSalesByPeriod,
  getSalesByStore,
  getSalesByState,
  getSalesByPlatform,
  getCancellationsByReason,
  getCanceledDetails,
  getCanceledSummary,
  getTicketByState,
  getAbc,
  getAbcDetails,
  getSummary,
  getStores,
  getStates,
  filterSales
} = require("../lib/metrics");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const COLUMN_ALIASES = {
  date: ["date", "data", "dt_venda", "data venda", "hora do pedido"],
  orderId: ["nº de pedido", "nº do pedido", "numero do pedido"],
  store: ["store", "loja", "filial", "nome da loja no upseller"],
  product: ["product", "produto", "item"],
  adName: ["nome do anúncio", "nome do anuncio", "anuncio"],
  variation: ["variação", "variacao"],
  sku: ["sku"],
  quantity: [
    "quantity",
    "quantidade",
    "qtd",
    "qtde",
    "total de pedidos",
    "pedidos válidos",
    "pedidos validos",
    "qtd. do produto"
  ],
  total: [
    "total",
    "valor",
    "valor_total",
    "total venda",
    "total_venda",
    "receita",
    "valor total de vendas",
    "valor de vendas válidas",
    "valor de vendas validas",
    "valor do pedido",
    "valor total de produtos"
  ],
  state: ["estado"],
  platform: ["plataformas"],
  status: ["pós-venda/cancelado/devolvido"],
  cancelBy: ["cancelado por", "cancelado_por"],
  cancelReason: ["razão do cancelamento", "razao do cancelamento"],
  image: ["link da imagem"],
  unitPrice: [
    "preço do produto",
    "preco do produto",
    "preço",
    "preco",
    "valor do produto",
    "valor unitário",
    "valor unitario",
    "preço unitário",
    "preco unitario",
    "valor un",
    "preço un",
    "preco un"
  ],
  clientName: [
    "nome de comprador",
    "nome do comprador",
    "comprador",
    "cliente",
    "nome do cliente"
  ],
  codcli: [
    "id do comprador",
    "id comprador",
    "codigo do cliente",
    "codigo cliente",
    "codcli"
  ]
};

const normalizeHeaderKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const toLowerKeyMap = (row) =>
  Object.keys(row).reduce((acc, key) => {
    acc[normalizeHeaderKey(key)] = key;
    return acc;
  }, {});

const findHeaderKey = (lowerMap, aliases) => {
  for (const alias of aliases) {
    const key = lowerMap[normalizeHeaderKey(alias)];
    if (key !== undefined) return key;
  }
  return null;
};

const parseDateValue = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value === "string" && /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(value)) {
    const [datePart, timePart] = value.split(" ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedLocal = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsedLocal.getTime())) return parsedLocal;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseNumber = (value) => {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return NaN;
  const raw = String(value).trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(/,/g, ".") : raw;
  return Number(normalized);
};

const normalizeRows = (rows) => {
  const normalized = [];
  const errors = [];

  const headerMap = toLowerKeyMap(rows[0] || {});
  const headerKeys = {
    date: findHeaderKey(headerMap, COLUMN_ALIASES.date),
    orderId: findHeaderKey(headerMap, COLUMN_ALIASES.orderId),
    store: findHeaderKey(headerMap, COLUMN_ALIASES.store),
  product: findHeaderKey(headerMap, COLUMN_ALIASES.product),
  adName: findHeaderKey(headerMap, COLUMN_ALIASES.adName),
  variation: findHeaderKey(headerMap, COLUMN_ALIASES.variation),
  sku: findHeaderKey(headerMap, COLUMN_ALIASES.sku),
    quantity: findHeaderKey(headerMap, COLUMN_ALIASES.quantity),
    total: findHeaderKey(headerMap, COLUMN_ALIASES.total),
    state: findHeaderKey(headerMap, COLUMN_ALIASES.state),
    platform: findHeaderKey(headerMap, COLUMN_ALIASES.platform),
    status: findHeaderKey(headerMap, COLUMN_ALIASES.status),
    cancelBy: findHeaderKey(headerMap, COLUMN_ALIASES.cancelBy),
    cancelReason: findHeaderKey(headerMap, COLUMN_ALIASES.cancelReason),
    image: findHeaderKey(headerMap, COLUMN_ALIASES.image),
    unitPrice: findHeaderKey(headerMap, COLUMN_ALIASES.unitPrice),
    clientName: findHeaderKey(headerMap, COLUMN_ALIASES.clientName),
    codcli: findHeaderKey(headerMap, COLUMN_ALIASES.codcli)
  };

  const missingColumns = [];
  if (!headerKeys.date) missingColumns.push("date");
  if (!headerKeys.total) missingColumns.push("total");

  if (missingColumns.length) {
    return { data: [], errors: [], missingColumns };
  }

  rows.forEach((row, index) => {
    const dateValue = row[headerKeys.date];
  const orderIdValue = headerKeys.orderId ? row[headerKeys.orderId] : "";
    const storeValue = headerKeys.store ? row[headerKeys.store] : "Todas";
  const productValue = headerKeys.product ? row[headerKeys.product] : "";
  const adNameValue = headerKeys.adName ? row[headerKeys.adName] : "";
  const variationValue = headerKeys.variation ? row[headerKeys.variation] : "";
  const skuValue = headerKeys.sku ? row[headerKeys.sku] : "";
    const quantityValue = headerKeys.quantity ? row[headerKeys.quantity] : 1;
    const totalValue = row[headerKeys.total];
  const stateValue = headerKeys.state ? row[headerKeys.state] : "";
  const platformValue = headerKeys.platform ? row[headerKeys.platform] : "";
  const statusValue = headerKeys.status ? row[headerKeys.status] : "";
  const cancelByValue = headerKeys.cancelBy ? row[headerKeys.cancelBy] : "";
  const cancelReasonValue = headerKeys.cancelReason ? row[headerKeys.cancelReason] : "";
  const imageValue = headerKeys.image ? row[headerKeys.image] : "";
  const unitPriceValue = headerKeys.unitPrice ? row[headerKeys.unitPrice] : "";
  const clientNameValue = headerKeys.clientName ? row[headerKeys.clientName] : "";
  const codcliValue = headerKeys.codcli ? row[headerKeys.codcli] : "";

    const parsedDate = parseDateValue(dateValue);
  const quantity = parseNumber(quantityValue);
  const total = parseNumber(totalValue);
  const parsedUnitPrice = parseNumber(unitPriceValue);

    if (!parsedDate || Number.isNaN(quantity) || Number.isNaN(total)) {
      errors.push({ index: index + 2, reason: "Linha inválida" });
      return;
    }

    normalized.push({
      date: parsedDate,
      orderId: String(orderIdValue || "").trim(),
      store: String(storeValue || "Todas").trim(),
  product: String(productValue || adNameValue || "Geral").trim(),
  adName: String(adNameValue || productValue || "Geral").trim(),
  variation: String(variationValue || "").trim(),
  sku: String(skuValue || "").trim(),
      quantity,
      total,
      unitPrice: Number.isNaN(parsedUnitPrice) || parsedUnitPrice <= 0
        ? (total > 0 && quantity ? total / quantity : 0)
        : parsedUnitPrice,
      state: String(stateValue || "").trim() || "Não informado",
      platform: String(platformValue || "").trim(),
      status: String(statusValue || "").trim(),
      cancelBy: String(cancelByValue || "").trim(),
      cancelReason: String(cancelReasonValue || "").trim(),
      image: String(imageValue || "").trim(),
      clientName: String(clientNameValue || "").trim(),
      codcli: String(codcliValue || "").trim()
    });
  });

  return { data: normalized, errors, missingColumns };
};

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log('=== Upload started ===');

    if (!req.file) {
      console.log('No file received');
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }

    console.log('File received:', req.file.originalname, 'Size:', req.file.size);

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    console.log('Parsed rows:', rows.length);

    if (!rows.length) {
      return res.status(400).json({ message: "Planilha vazia." });
    }

    const { data, errors, missingColumns } = normalizeRows(rows);

    console.log('Normalized data:', data.length, 'Errors:', errors.length);

    if (missingColumns.length) {
      console.log('Missing columns:', missingColumns);
      return res.status(400).json({
        message: "Colunas obrigatórias ausentes.",
        missingColumns
      });
    }

    console.log('Starting database insert...');
    const { inserted, updated } = await setSales(data);

    console.log('Database insert completed. Inserted:', inserted, 'Updated:', updated);

    return res.json({
      message: "Upload concluído.",
      rows: data.length,
      inserted,
      updated,
      errors: errors.length
    });
  } catch (error) {
    console.error('=== Upload error ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      message: "Erro ao processar upload.",
      error: error.message,
      details: error.stack
    });
  }
});

router.get("/summary", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json({ ...getSummary([], {}), lastUpdate: null, todayRevenue: 0, yesterdayRevenue: 0 });
    }
    const salesRepository = require('../db/salesRepository');
    const { getSaoPauloDate } = require('../lib/timezone');
    const spToday = getSaoPauloDate();
    const spYesterday = getSaoPauloDate(-1);

    const [sales, lastUpdate, salesTodayRevenue, salesYesterdayRevenue] = await Promise.all([
      salesRepository.getSales(req.query),
      salesRepository.getLastUpdate(),
      salesRepository.getDailyRevenue(spToday, req.query),
      salesRepository.getDailyRevenue(spYesterday, req.query)
    ]);

    // Use UpSeller analytics for today/yesterday revenue
    let todayRevenue = salesTodayRevenue;
    let yesterdayRevenue = salesYesterdayRevenue;
    let upsellerFetchedAt = null;
    let upsellerLastSyncAt = null;
    const storeFilter = req.query.store || '';
    const channelFilter = (req.query.sale_channel || '').toLowerCase();
    const isFabrica = storeFilter.toLowerCase() === 'fabrica';
    const isAtacado = channelFilter === 'atacado';
    const isOnline = channelFilter === 'online';

    // Get UpSeller order sync timestamp
    try {
      const upsellerRepo = require('../db/upsellerRepository');
      upsellerLastSyncAt = await upsellerRepo.getLastSyncAt();
    } catch (_) { /* not available */ }

    // Atacado = only Fabrica/Sisplan data (already filtered by getDailyRevenue via sale_channel)
    // Online = only UpSeller data (no Fabrica addition)
    // No filter = UpSeller + Fabrica combined
    if (!isFabrica && !isAtacado) {
      try {
        const analyticsRepo = require('../db/upsellerAnalyticsRepository');
        const analytics = await analyticsRepo.getDailyAnalytics(spToday);
        if (analytics) {
          upsellerFetchedAt = analytics.fetchedAt;
          if (analytics.todaySaleAmount > 0) {
            if (!storeFilter) {
              if (isOnline) {
                // Online only = UpSeller total (lojas)
                todayRevenue = parseFloat(analytics.todaySaleAmount);
                yesterdayRevenue = parseFloat(analytics.yesterdaySaleAmount);
              } else {
                // Todas as lojas = UpSeller total + Fábrica (Sisplan)
                const fabricaToday = await salesRepository.getDailyRevenue(spToday, { store: 'Fabrica' });
                const fabricaYesterday = await salesRepository.getDailyRevenue(spYesterday, { store: 'Fabrica' });
                todayRevenue = parseFloat(analytics.todaySaleAmount) + fabricaToday;
                yesterdayRevenue = parseFloat(analytics.yesterdaySaleAmount) + fabricaYesterday;
              }
            } else {
              // Loja específica — buscar no shopTops do UpSeller
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
      } catch (_) { /* analytics not available, use sales data */ }
    }

    return res.json({ ...getSummary(sales, req.query), lastUpdate, upsellerFetchedAt, upsellerLastSyncAt, todayRevenue, yesterdayRevenue });
  } catch (error) {
    console.error('Summary error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/stores", async (_req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales();
    return res.json(getStores(sales));
  } catch (error) {
    console.error('Stores error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/states", async (_req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales();
    return res.json(getStates(sales));
  } catch (error) {
    console.error('States error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/sales-by-period", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    const period = req.query.period || "month";
    return res.json(getSalesByPeriod(sales, { ...req.query, period }));
  } catch (error) {
    console.error('Sales by period error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/sales-by-store", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getSalesByStore(sales, req.query));
  } catch (error) {
    console.error('Sales by store error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/sales-by-state", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getSalesByState(sales, req.query));
  } catch (error) {
    console.error('Sales by state error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/sales-by-platform", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getSalesByPlatform(sales, req.query));
  } catch (error) {
    console.error('Sales by platform error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/cancellations-by-reason", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getCancellationsByReason(sales, req.query));
  } catch (error) {
    console.error('Cancellations by reason error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/canceled-details", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getCanceledDetails(sales, req.query));
  } catch (error) {
    console.error('Canceled details error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/canceled-summary", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json({ total: 0, orders: 0, reasons: [] });
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getCanceledSummary(sales, req.query));
  } catch (error) {
    console.error('Canceled summary error:', error);
    return res.status(500).json({ error: error.message });
  }
});

const normalizeStatusValue = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\u00A0\u200B]+/g, " ")
    .trim();

router.get("/cancel-statuses", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json({ statuses: [], samples: [] });
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    const filtered = filterSales(sales, req.query);
    const counts = new Map();
    const samples = [];
    filtered.forEach((sale) => {
      const raw = String(sale.status || "");
      const normalized = normalizeStatusValue(raw);
      const key = normalized || "(vazio)";
      counts.set(key, (counts.get(key) || 0) + 1);
      if (samples.length < 50) {
        samples.push({
          orderId: sale.orderId || "Não informado",
          date: sale.date,
          product: sale.product || "Não informado",
          status: raw
        });
      }
    });

    const statuses = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    return res.json({ statuses, samples });
  } catch (error) {
    console.error('Cancel statuses error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/ticket-by-state", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getTicketByState(sales, req.query));
  } catch (error) {
    console.error('Ticket by state error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/abc", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json([]);
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getAbc(sales, req.query));
  } catch (error) {
    console.error('ABC error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/abc/details", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json({ adName: "", variations: [], sizes: [] });
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);
    return res.json(getAbcDetails(sales, req.query));
  } catch (error) {
    console.error('ABC details error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ── Sales Analytic Export (Excel) ──

router.get("/sales-analytic-export", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.status(404).json({ error: "Sem vendas no período." });
    }
    const salesRepository = require('../db/salesRepository');
    const sales = await salesRepository.getSales(req.query);

    if (!sales.length) {
      return res.status(404).json({ error: "Sem vendas no período." });
    }

    const formatDate = (d) => {
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yyyy = dt.getFullYear();
      const hh = String(dt.getHours()).padStart(2, "0");
      const mi = String(dt.getMinutes()).padStart(2, "0");
      return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    };

    const rows = sales.map(s => ({
      "Data": formatDate(s.date),
      "Pedido": s.orderId || "",
      "Nº Pedido Plataforma": s.platformOrderId || "",
      "Loja": s.store || "",
      "Plataforma": s.platform || "",
      "Canal": s.saleChannel || "",
      "Status": s.status || "",
      "SKU": s.sku || "",
      "Anúncio": s.adName || "",
      "Produto": s.product || "",
      "Variação": s.variation || "",
      "UF": s.state || "",
      "Cliente": s.clientName || "",
      "CNPJ/CPF": s.cnpjCpf || "",
      "Qtd": Number(s.quantity) || 0,
      "Preço Unit.": Number(s.unitPrice) || 0,
      "Total": Number(s.total) || 0
    }));

    const totalQuantity = rows.reduce((sum, r) => sum + r["Qtd"], 0);
    const totalRevenue = rows.reduce((sum, r) => sum + r["Total"], 0);
    rows.push({
      "Data": "",
      "Pedido": "",
      "Nº Pedido Plataforma": "",
      "Loja": "",
      "Plataforma": "",
      "Canal": "",
      "Status": "",
      "SKU": "",
      "Anúncio": "",
      "Produto": "",
      "Variação": "",
      "UF": "",
      "Cliente": "",
      "CNPJ/CPF": "TOTAL",
      "Qtd": totalQuantity,
      "Preço Unit.": "",
      "Total": Number(totalRevenue.toFixed(2))
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 17 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 42 }, { wch: 42 },
      { wch: 22 }, { wch: 6 }, { wch: 28 }, { wch: 18 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }
    ];

    const currencyFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    const range = xlsx.utils.decode_range(ws["!ref"]);
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of [15, 16]) {
        const cell = ws[xlsx.utils.encode_cell({ r: R, c: C })];
        if (cell && typeof cell.v === "number") cell.z = currencyFmt;
      }
    }

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Analítico de Vendas");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    const start = (req.query.start || "").slice(0, 10);
    const end = (req.query.end || "").slice(0, 10);
    const filename = `analitico-vendas-${start}_a_${end}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Sales analytic export error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ── Daily Sales Details (for Vendas Hoje / Ontem drawers) ──

router.get("/daily-sales-details", async (req, res) => {
  try {
    if (!(await hasSales())) {
      return res.json({ summary: { total: 0, orders: 0 }, rows: [] });
    }
    const salesRepository = require('../db/salesRepository');
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Parâmetro 'date' obrigatório." });
    }
    const result = await salesRepository.getDailySalesDetails(date, req.query);
    return res.json(result);
  } catch (error) {
    console.error('Daily sales details error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ── Sisplan Active Check ──

router.get("/sisplan-active", async (req, res) => {
  try {
    const sisplanRepo = require('../db/sisplanRepository');
    const active = await sisplanRepo.isActive();
    const settings = await sisplanRepo.getSettings();
    return res.json({ active, ofActive: !!(active && settings?.ofActive) });
  } catch (error) {
    return res.json({ active: false, ofActive: false });
  }
});

// ── Clear All Sales Data (Admin Only) ──

router.delete("/sales", authenticate, requireAdmin, async (req, res) => {
  try {
    const salesRepository = require('../db/salesRepository');
    await salesRepository.clearSales();
    return res.json({ message: 'Dados de vendas excluídos com sucesso.' });
  } catch (error) {
    console.error('Clear sales error:', error);
    return res.status(500).json({ message: 'Erro ao excluir dados de vendas.' });
  }
});

module.exports = router;
