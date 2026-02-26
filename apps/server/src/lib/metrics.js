const getIsoWeekYear = (value) => {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
};

const formatPeriodKey = (date, period) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (period === "day") {
    return `${year}-${month}-${day}`;
  }
  if (period === "week") {
    const iso = getIsoWeekYear(date);
    const week = String(iso.week).padStart(2, "0");
    return `${iso.year}-W${week}`;
  }
  return `${year}-${month}`;
};

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const parseDateParam = (value) => {
  if (!value) return null;
  const date = dateOnlyPattern.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeStatusValue = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\u00A0\u200B]+/g, " ")
    .trim()
    .toLowerCase();

const isCanceled = (sale) => {
  const statusValue = normalizeStatusValue(sale.status);
  if (!statusValue) return false;
  const normalized = statusValue.replace(/\s+/g, " ");
  return normalized.includes("cancelado");
};

const getUnitPrice = (sale) => {
  const unitPrice = Number(sale.unitPrice || 0);
  if (!Number.isNaN(unitPrice) && unitPrice > 0) return unitPrice;
  if (sale.quantity) return sale.total / sale.quantity;
  return 0;
};

const filterSales = (sales, { start, end, store, state, platform, status }) => {
  const startDate = parseDateParam(start);
  let endDate = parseDateParam(end);
  if (endDate && typeof end === "string" && dateOnlyPattern.test(end)) {
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  return sales.filter((sale) => {
    if (store && sale.store !== store) return false;
    if (state && sale.state !== state) return false;
    if (platform && sale.platform !== platform) return false;
    if (status && sale.status !== status) return false;
    if (startDate && sale.date < startDate) return false;
    if (endDate && sale.date > endDate) return false;
    return true;
  });
};

const splitVariationAndSize = (sale) => {
  const rawVariation = String(sale.variation || "").trim();
  if (rawVariation.includes(",")) {
    const [variation, size] = rawVariation.split(",");
    return {
      variation: (variation || "").trim() || "Não informado",
      size: (size || "").trim() || "Não informado"
    };
  }

  if (rawVariation.includes("-")) {
    const parts = rawVariation.split("-");
    if (parts.length >= 3) {
      return {
        variation: parts[1] || "Não informado",
        size: parts[2] || "Não informado"
      };
    }
  }

  const adName = String(sale.adName || sale.product || "").trim();
  const rawSku = String(sale.sku || "").trim();
  if (rawSku && adName && rawSku.startsWith(`${adName}-`)) {
    const remainder = rawSku.slice(adName.length + 1);
    const parts = remainder.split("-").filter(Boolean);
    return {
      variation: parts[0] || "Não informado",
      size: parts[1] || "Não informado"
    };
  }

  if (rawSku) {
    const parts = rawSku.split("-").filter(Boolean);
    if (parts.length >= 2) {
      return {
        variation: parts[parts.length - 2] || "Não informado",
        size: parts[parts.length - 1] || "Não informado"
      };
    }
  }

  return {
    variation: rawVariation || "Não informado",
    size: "Não informado"
  };
};

const getSalesByPeriod = (sales, { start, end, store, period = "month" }) => {
  const filtered = filterSales(sales, { start, end, store });
  const map = new Map();

  filtered.forEach((sale) => {
    const key = formatPeriodKey(sale.date, period);
    const current = map.get(key) || { period: key, total: 0, quantity: 0 };
    current.total += sale.total;
    current.quantity += sale.quantity;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
};

const getSalesByStore = (sales, { start, end }) => {
  const filtered = filterSales(sales, { start, end });
  const map = new Map();

  filtered.forEach((sale) => {
    const key = sale.store;
    const current = map.get(key) || { store: key, total: 0, quantity: 0 };
    current.total += sale.total;
    current.quantity += sale.quantity;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

const getSalesByState = (sales, { start, end, store }) => {
  const filtered = filterSales(sales, { start, end, store });
  const map = new Map();

  filtered.forEach((sale) => {
    const key = sale.state || "Não informado";
    const current = map.get(key) || { state: key, total: 0, quantity: 0 };
    current.total += sale.total;
    current.quantity += sale.quantity;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

const getSalesByPlatform = (sales, { start, end }) => {
  const filtered = filterSales(sales, { start, end });
  const map = new Map();

  filtered.forEach((sale) => {
    const key = sale.platform || "Não informado";
    const current = map.get(key) || { platform: key, total: 0, quantity: 0 };
    current.total += sale.total;
    current.quantity += sale.quantity;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

const getCancellationsByReason = (sales, { start, end }) => {
  const filtered = filterSales(sales, { start, end });
  const map = new Map();

  filtered
    .filter((sale) => isCanceled(sale))
    .forEach((sale) => {
      const key = sale.cancelReason || "Não informado";
      const current = map.get(key) || { reason: key, count: 0, total: 0 };
      current.count += 1;
      current.total += getUnitPrice(sale) * sale.quantity;
      map.set(key, current);
    });

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

const getCanceledDetails = (sales, { start, end, store, state }) => {
  const filtered = filterSales(sales, { start, end, store, state });
  return filtered
    .filter((sale) => isCanceled(sale))
    .map((sale) => ({
      orderId: sale.orderId || "Não informado",
      date: sale.date,
      product: sale.product || "Não informado",
      quantity: sale.quantity,
      total: getUnitPrice(sale) * sale.quantity,
      status: sale.status || "",
      cancelBy: sale.cancelBy || "Não informado",
      cancelReason: sale.cancelReason || "Não informado"
    }))
    .sort((a, b) => b.date - a.date);
};

const getCanceledSummary = (sales, { start, end, store, state }) => {
  const filtered = filterSales(sales, { start, end, store, state }).filter((sale) => isCanceled(sale));
  const totalOrders = new Set();
  let totalValue = 0;
  const reasons = new Map();

  filtered.forEach((sale) => {
    const orderId = sale.orderId || `${sale.date.toISOString()}-${sale.store}-${sale.product}`;
    totalOrders.add(orderId);
    const value = getUnitPrice(sale) * sale.quantity;
    totalValue += value;

    const reasonKey = sale.cancelReason || "Não informado";
    const current = reasons.get(reasonKey) || {
      reason: reasonKey,
      total: 0,
      orders: new Set()
    };
    current.total += value;
    current.orders.add(orderId);
    reasons.set(reasonKey, current);
  });

  const reasonList = Array.from(reasons.values())
    .map((item) => ({
      reason: item.reason,
      total: Number(item.total.toFixed(2)),
      orders: item.orders.size
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total: Number(totalValue.toFixed(2)),
    orders: totalOrders.size,
    reasons: reasonList
  };
};

const getTicketByState = (sales, { start, end }) => {
  const filtered = filterSales(sales, { start, end });
  const orders = new Map();

  filtered.forEach((sale) => {
    const orderId = sale.orderId || `${sale.date.toISOString()}-${sale.store}-${sale.product}`;
    const current = orders.get(orderId) || {
      orderId,
      state: sale.state || "Não informado",
      total: 0
    };
    current.total += sale.total;
    orders.set(orderId, current);
  });

  const stateMap = new Map();
  Array.from(orders.values()).forEach((order) => {
    const key = order.state || "Não informado";
    const current = stateMap.get(key) || { state: key, total: 0, orders: 0, average: 0 };
    current.total += order.total;
    current.orders += 1;
    current.average = current.total / current.orders;
    stateMap.set(key, current);
  });

  return Array.from(stateMap.values()).sort((a, b) => b.average - a.average);
};

const getAbc = (sales, { start, end, store }) => {
  const filtered = filterSales(sales, { start, end, store });
  const map = new Map();

  filtered.forEach((sale) => {
    const adName = sale.adName || sale.product;
    const storeName = sale.store || "Todas";
    const key = `${adName}|||${storeName}`;
    const current = map.get(key) || {
      product: adName,
      adName,
      store: storeName,
      total: 0,
      quantity: 0,
      image: "",
      platformTotals: {}
    };
    current.total += sale.total;
    current.quantity += sale.quantity;
    if (!current.image && sale.image) {
      current.image = sale.image;
    }
    const platformKey = sale.platform || "Não informado";
    current.platformTotals[platformKey] = (current.platformTotals[platformKey] || 0) + sale.total;
    map.set(key, current);
  });

  const totals = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity || b.total - a.total);
  const grandTotal = totals.reduce((sum, item) => sum + item.total, 0) || 1;

  let cumulative = 0;
  return totals.map((item) => {
    cumulative += item.total;
    const share = cumulative / grandTotal;
    let classification = "C";
    if (share <= 0.8) classification = "A";
    else if (share <= 0.95) classification = "B";

    const platforms = Object.entries(item.platformTotals || {});
    const platformLabel =
      platforms.length <= 1
        ? (platforms[0]?.[0] || "Não informado")
        : "Múltiplas";

    return {
      ...item,
      platformLabel,
      share: Number((item.total / grandTotal).toFixed(4)),
      cumulative: Number(share.toFixed(4)),
      classification
    };
  });
};

const getAbcDetails = (sales, { start, end, store, adName }) => {
  if (!adName) return { adName: "", variations: [], sizes: [] };
  const filtered = filterSales(sales, { start, end, store }).filter(
    (sale) => (sale.adName || sale.product || "") === adName
      && (!store || sale.store === store)
  );

  const variationMap = new Map();
  const sizeMap = new Map();

  filtered.forEach((sale) => {
    const { variation, size } = splitVariationAndSize(sale);

    const variationEntry = variationMap.get(variation) || {
      variation,
      quantity: 0,
      total: 0,
      image: ""
    };
    variationEntry.quantity += sale.quantity;
    variationEntry.total += sale.total;
    if (!variationEntry.image && sale.image) {
      variationEntry.image = sale.image;
    }
    variationMap.set(variation, variationEntry);

    const sizeEntry = sizeMap.get(size) || {
      size,
      quantity: 0,
      total: 0
    };
    sizeEntry.quantity += sale.quantity;
    sizeEntry.total += sale.total;
    sizeMap.set(size, sizeEntry);
  });

  return {
    adName,
    variations: Array.from(variationMap.values()).sort((a, b) => b.quantity - a.quantity || b.total - a.total),
    sizes: Array.from(sizeMap.values()).sort((a, b) => b.quantity - a.quantity || b.total - a.total)
  };
};

const getSummary = (sales, { start, end, store }) => {
  const filtered = filterSales(sales, { start, end, store });
  const activeSales = filtered.filter((sale) => !isCanceled(sale));
  const canceledSales = filtered.filter((sale) => isCanceled(sale));
  const total = activeSales.reduce((sum, sale) => sum + sale.total, 0);
  const quantity = activeSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const stores = new Set(activeSales.map((sale) => sale.store));
  const products = new Set(activeSales.map((sale) => sale.product));
  const states = new Set(activeSales.map((sale) => sale.state).filter(Boolean));
  const totalSales = new Set(
    activeSales.map(
      (sale) => sale.orderId || `${sale.date.toISOString()}-${sale.store}-${sale.product}`
    )
  ).size;
  const ticketAverage = totalSales ? total / totalSales : 0;
  const canceledTotal = canceledSales.reduce(
    (sum, sale) => sum + getUnitPrice(sale) * sale.quantity,
    0
  );
  const canceledOrders = new Set(
    canceledSales.map(
      (sale) => sale.orderId || `${sale.date.toISOString()}-${sale.store}-${sale.product}`
    )
  ).size;

  return {
    totalRevenue: Number(total.toFixed(2)),
    totalQuantity: quantity,
    totalStores: stores.size,
    totalProducts: products.size,
    totalStates: states.size,
    totalSales,
    ticketAverage: Number(ticketAverage.toFixed(2)),
    canceledTotal: Number(canceledTotal.toFixed(2)),
    canceledOrders
  };
};

const getStores = (sales) => Array.from(new Set(sales.map((sale) => sale.store))).sort();
const getStates = (sales) =>
  Array.from(new Set(sales.map((sale) => sale.state).filter(Boolean))).sort();

module.exports = {
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
};
