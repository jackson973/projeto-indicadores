let authToken = localStorage.getItem('auth_token');

export const setToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
};

export const getToken = () => authToken;

const handleResponse = async (response) => {
  if (response.status === 401) {
    setToken(null);
    window.location.reload();
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Erro na requisição.");
  }
  return response.json();
};

const authFetch = (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return fetch(url, { ...options, headers });
};

// Auth API
export const login = async (email, password) => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return handleResponse(response);
};

export const fetchMe = async () => {
  const response = await authFetch("/api/auth/me");
  return handleResponse(response);
};

export const forgotPassword = async (email) => {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  return handleResponse(response);
};

export const resetPassword = async (token, password) => {
  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password })
  });
  return handleResponse(response);
};

// Users API
export const fetchUsers = async () => {
  const response = await authFetch("/api/users");
  return handleResponse(response);
};

export const createUser = async (data) => {
  const response = await authFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const updateUser = async (id, data) => {
  const response = await authFetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const updateUserPassword = async (id, password) => {
  const response = await authFetch(`/api/users/${id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  return handleResponse(response);
};

export const deleteUser = async (id) => {
  const response = await authFetch(`/api/users/${id}`, {
    method: "DELETE"
  });
  return handleResponse(response);
};

// Existing API (now with auth)
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await authFetch("/api/upload", {
    method: "POST",
    body: formData
  });
  return handleResponse(response);
};

export const fetchSummary = async (params) => {
  const response = await authFetch(`/api/summary?${params}`);
  return handleResponse(response);
};

export const fetchStores = async () => {
  const response = await authFetch("/api/stores");
  return handleResponse(response);
};

export const fetchStates = async () => {
  const response = await authFetch("/api/states");
  return handleResponse(response);
};

export const fetchSalesByPeriod = async (params) => {
  const response = await authFetch(`/api/sales-by-period?${params}`);
  return handleResponse(response);
};

export const fetchSalesByStore = async (params) => {
  const response = await authFetch(`/api/sales-by-store?${params}`);
  return handleResponse(response);
};

export const fetchSalesByState = async (params) => {
  const response = await authFetch(`/api/sales-by-state?${params}`);
  return handleResponse(response);
};

export const fetchSalesByPlatform = async (params) => {
  const response = await authFetch(`/api/sales-by-platform?${params}`);
  return handleResponse(response);
};

export const fetchAbc = async (params) => {
  const response = await authFetch(`/api/abc?${params}`);
  return handleResponse(response);
};

export const fetchAbcDetails = async (params) => {
  const response = await authFetch(`/api/abc/details?${params}`);
  return handleResponse(response);
};

export const fetchCanceledDetails = async (params) => {
  const response = await authFetch(`/api/canceled-details?${params}`);
  return handleResponse(response);
};

export const fetchCanceledSummary = async (params) => {
  const response = await authFetch(`/api/canceled-summary?${params}`);
  return handleResponse(response);
};

export const fetchDailySalesDetails = async (params) => {
  const response = await authFetch(`/api/daily-sales-details?${params}`);
  return handleResponse(response);
};

// Cashflow Boxes API
export const fetchCashflowBoxes = async () => {
  const response = await authFetch("/api/cashflow/boxes");
  return handleResponse(response);
};

export const createCashflowBox = async (name) => {
  const response = await authFetch("/api/cashflow/boxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse(response);
};

export const updateCashflowBox = async (id, name) => {
  const response = await authFetch(`/api/cashflow/boxes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse(response);
};

export const deleteCashflowBox = async (id) => {
  const response = await authFetch(`/api/cashflow/boxes/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

// Cashflow Categories API
export const fetchCashflowCategories = async () => {
  const response = await authFetch("/api/cashflow/categories");
  return handleResponse(response);
};

export const createCashflowCategory = async (name) => {
  const response = await authFetch("/api/cashflow/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse(response);
};

export const updateCashflowCategory = async (id, name) => {
  const response = await authFetch(`/api/cashflow/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse(response);
};

export const deleteCashflowCategory = async (id) => {
  const response = await authFetch(`/api/cashflow/categories/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

// Cashflow Entries API
export const fetchCashflowEntries = async (year, month, boxId) => {
  const response = await authFetch(`/api/cashflow/entries?year=${year}&month=${month}&boxId=${boxId}`);
  return handleResponse(response);
};

export const createCashflowEntry = async (data) => {
  const response = await authFetch("/api/cashflow/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const updateCashflowEntry = async (id, data) => {
  const response = await authFetch(`/api/cashflow/entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const toggleCashflowEntryStatus = async (id) => {
  const response = await authFetch(`/api/cashflow/entries/${id}/status`, { method: "PUT" });
  return handleResponse(response);
};

export const deleteCashflowEntry = async (id) => {
  const response = await authFetch(`/api/cashflow/entries/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

// Cashflow Balance & Summary API
export const fetchCashflowBalance = async (year, month, boxId) => {
  const response = await authFetch(`/api/cashflow/balance?year=${year}&month=${month}&boxId=${boxId}`);
  return handleResponse(response);
};

export const setCashflowBalance = async (year, month, openingBalance, boxId) => {
  const response = await authFetch("/api/cashflow/balance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year, month, openingBalance, boxId })
  });
  return handleResponse(response);
};

export const fetchCashflowSummary = async (year, month, boxId) => {
  const response = await authFetch(`/api/cashflow/summary?year=${year}&month=${month}&boxId=${boxId}`);
  return handleResponse(response);
};

// Cashflow Alerts API
export const fetchCashflowAlerts = async (year, month, boxId) => {
  const response = await authFetch(`/api/cashflow/alerts?year=${year}&month=${month}&boxId=${boxId}`);
  return handleResponse(response);
};

// Cashflow Recurrences API
export const fetchCashflowRecurrences = async (boxId) => {
  const response = await authFetch(`/api/cashflow/recurrences?boxId=${boxId}`);
  return handleResponse(response);
};

export const createCashflowRecurrence = async (data) => {
  const response = await authFetch("/api/cashflow/recurrences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const updateCashflowRecurrence = async (id, data) => {
  const response = await authFetch(`/api/cashflow/recurrences/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const deleteCashflowRecurrence = async (id) => {
  const response = await authFetch(`/api/cashflow/recurrences/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

export const generateCashflowRecurrences = async (year, month, boxId) => {
  const response = await authFetch("/api/cashflow/recurrences/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year, month, boxId })
  });
  return handleResponse(response);
};

// Cashflow Dashboard & Import API
export const fetchCashflowDashboard = async (startDate, endDate, grouping, boxId) => {
  let url = `/api/cashflow/dashboard?startDate=${startDate}&endDate=${endDate}&grouping=${grouping}`;
  if (boxId) url += `&boxId=${boxId}`;
  const response = await authFetch(url);
  return handleResponse(response);
};

export const importCashflow = async (file, boxId) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("boxId", boxId);
  const response = await authFetch("/api/cashflow/import", {
    method: "POST",
    body: formData
  });
  return handleResponse(response);
};

export const checkImportDuplicates = async (boxId, year, month) => {
  const response = await authFetch(
    `/api/cashflow/import/check?boxId=${boxId}&year=${year}&month=${month}`
  );
  return handleResponse(response);
};

// Sisplan API (Admin)
export const fetchSisplanSettings = async () => {
  const response = await authFetch("/api/sisplan");
  return handleResponse(response);
};

export const updateSisplanSettings = async (data) => {
  const response = await authFetch("/api/sisplan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const testSisplanConnection = async (data) => {
  const response = await authFetch("/api/sisplan/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const testSisplanQuery = async (data) => {
  const response = await authFetch("/api/sisplan/test-query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const triggerSisplanSync = async () => {
  const response = await authFetch("/api/sisplan/sync", { method: "POST" });
  return handleResponse(response);
};

export const triggerSisplanNfSync = async () => {
  const response = await authFetch("/api/sisplan/nf-sync", { method: "POST" });
  return handleResponse(response);
};

export const refreshSisplanData = async () => {
  const response = await authFetch("/api/sisplan/refresh", { method: "POST" });
  return handleResponse(response);
};

// Sisplan Active Check (any authenticated user)
export const fetchSisplanActive = async () => {
  const response = await authFetch("/api/sisplan-active");
  return handleResponse(response);
};

// UpSeller API (Admin)
export const fetchUpsellerSettings = async () => {
  const response = await authFetch("/api/upseller");
  return handleResponse(response);
};

export const updateUpsellerSettings = async (data) => {
  const response = await authFetch("/api/upseller", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const triggerUpsellerSync = async () => {
  const response = await authFetch("/api/upseller/sync", { method: "POST" });
  return handleResponse(response);
};

export const fetchUpsellerTodayAnalytics = async () => {
  const response = await authFetch("/api/upseller/today-analytics");
  return handleResponse(response);
};

export const refreshUpsellerTodayAnalytics = async () => {
  const response = await authFetch("/api/upseller/today-analytics/refresh", { method: "POST" });
  return handleResponse(response);
};

// WhatsApp API (Admin)
export const fetchWhatsappSettings = async () => {
  const response = await authFetch("/api/whatsapp");
  return handleResponse(response);
};

export const updateWhatsappSettings = async (data) => {
  const response = await authFetch("/api/whatsapp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const testWhatsappLlm = async (data) => {
  const response = await authFetch("/api/whatsapp/test-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const connectWhatsapp = async () => {
  const response = await authFetch("/api/whatsapp/connect", { method: "POST" });
  return handleResponse(response);
};

export const disconnectWhatsapp = async () => {
  const response = await authFetch("/api/whatsapp/disconnect", { method: "POST" });
  return handleResponse(response);
};

export const fetchWhatsappPhones = async () => {
  const response = await authFetch("/api/whatsapp/phones");
  return handleResponse(response);
};

export const updateWhatsappPhoneLabel = async (id, label) => {
  const response = await authFetch(`/api/whatsapp/phones/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label })
  });
  return handleResponse(response);
};

export const deleteWhatsappPhone = async (id) => {
  const response = await authFetch(`/api/whatsapp/phones/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

// WhatsApp Conversation Logs API (Admin)
export const fetchWhatsappConversations = async (params) => {
  const response = await authFetch(`/api/whatsapp/conversations?${params}`);
  return handleResponse(response);
};

export const fetchWhatsappConversationUsers = async () => {
  const response = await authFetch("/api/whatsapp/conversations/users");
  return handleResponse(response);
};

// Database Manager API (Admin Only)
export const fetchDatabaseSchema = async () => {
  const response = await authFetch("/api/database/schema");
  return handleResponse(response);
};

export const executeDatabaseQuery = async (sql) => {
  const response = await authFetch("/api/database/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
  return handleResponse(response);
};

// Database Maintenance API (Admin Only)
export const clearSalesData = async () => {
  const response = await authFetch("/api/sales", {
    method: "DELETE"
  });
  return handleResponse(response);
};

export const clearCashflowData = async () => {
  const response = await authFetch("/api/cashflow", {
    method: "DELETE"
  });
  return handleResponse(response);
};

// ── Terceiros: Product Groups ───────────────────────────────────────────────

export const fetchTerceirosProductGroups = async () => {
  const response = await authFetch("/api/terceiros/product-groups");
  return handleResponse(response);
};

export const createTerceirosProductGroup = async (name) => {
  const response = await authFetch("/api/terceiros/product-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse(response);
};

export const updateTerceirosProductGroup = async (id, name) => {
  const response = await authFetch(`/api/terceiros/product-groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse(response);
};

export const deleteTerceirosProductGroup = async (id) => {
  const response = await authFetch(`/api/terceiros/product-groups/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

export const fetchGroupProducts = async (groupId) => {
  const response = await authFetch(`/api/terceiros/product-groups/${groupId}/products`);
  return handleResponse(response);
};

export const addProductToGroup = async (groupId, productCode, productName) => {
  const response = await authFetch(`/api/terceiros/product-groups/${groupId}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productCode, productName })
  });
  return handleResponse(response);
};

export const removeProductFromGroup = async (groupId, productCode) => {
  const response = await authFetch(`/api/terceiros/product-groups/${groupId}/products/${encodeURIComponent(productCode)}`, {
    method: "DELETE"
  });
  return handleResponse(response);
};

export const addProductsToGroupBatch = async (groupId, products) => {
  const response = await authFetch(`/api/terceiros/product-groups/${groupId}/products/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products })
  });
  return handleResponse(response);
};

export const removeProductsFromGroupBatch = async (groupId, productCodes) => {
  const response = await authFetch(`/api/terceiros/product-groups/${groupId}/products/batch`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productCodes })
  });
  return handleResponse(response);
};

// ── Terceiros: Supplier Prices ──────────────────────────────────────────────

export const fetchTerceirosSupplierPrices = async (codcli, groupId) => {
  const params = new URLSearchParams();
  if (codcli) params.append('codcli', codcli);
  if (groupId) params.append('groupId', groupId);
  const response = await authFetch(`/api/terceiros/supplier-prices?${params}`);
  return handleResponse(response);
};

export const createTerceirosSupplierPrice = async (data) => {
  const response = await authFetch("/api/terceiros/supplier-prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const createTerceirosSupplierPricesBatch = async (items) => {
  const response = await authFetch("/api/terceiros/supplier-prices/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
  return handleResponse(response);
};

export const updateTerceirosSupplierPrice = async (id, data) => {
  const response = await authFetch(`/api/terceiros/supplier-prices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const deleteTerceirosSupplierPrice = async (id) => {
  const response = await authFetch(`/api/terceiros/supplier-prices/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

// ── Terceiros: OFs ──────────────────────────────────────────────────────────

export const fetchTerceirosOfs = async (params) => {
  const response = await authFetch(`/api/terceiros/ofs?${params || ''}`);
  return handleResponse(response);
};

export const fetchTerceirosSuppliers = async () => {
  const response = await authFetch("/api/terceiros/ofs/suppliers");
  return handleResponse(response);
};

export const fetchTerceirosProducts = async () => {
  const response = await authFetch("/api/terceiros/ofs/products");
  return handleResponse(response);
};

export const fetchTerceirosEtapas = async (codcli) => {
  const params = new URLSearchParams();
  if (codcli) params.append("codcli", codcli);
  const qs = params.toString();
  const response = await authFetch(`/api/terceiros/etapas${qs ? `?${qs}` : ""}`);
  return handleResponse(response);
};

export const fetchTerceirosParts = async (codcli, groupId) => {
  const params = new URLSearchParams();
  if (codcli) params.append("codcli", codcli);
  if (groupId) params.append("groupId", groupId);
  const qs = params.toString();
  const response = await authFetch(`/api/terceiros/ofs/parts${qs ? `?${qs}` : ""}`);
  return handleResponse(response);
};

export const fetchTerceirossizes = async (codcli, groupId) => {
  const params = new URLSearchParams();
  if (codcli) params.append("codcli", codcli);
  if (groupId) params.append("groupId", groupId);
  const qs = params.toString();
  const response = await authFetch(`/api/terceiros/ofs/sizes${qs ? `?${qs}` : ""}`);
  return handleResponse(response);
};

// ── Terceiros: Settlements ──────────────────────────────────────────────────

export const fetchTerceirosSettlements = async (params) => {
  const response = await authFetch(`/api/terceiros/settlements?${params || ''}`);
  return handleResponse(response);
};

export const fetchTerceirosSettlement = async (id) => {
  const response = await authFetch(`/api/terceiros/settlements/${id}`);
  return handleResponse(response);
};

export const createTerceirosSettlement = async (data) => {
  const response = await authFetch("/api/terceiros/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const saveTerceirosDraft = async (data, id) => {
  const url = id
    ? `/api/terceiros/settlements/drafts/${id}`
    : "/api/terceiros/settlements/drafts";
  const response = await authFetch(url, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const fetchTerceirosDraft = async (id) => {
  const response = await authFetch(`/api/terceiros/settlements/drafts/${id}`);
  return handleResponse(response);
};

export const payTerceirosSettlement = async (id) => {
  const response = await authFetch(`/api/terceiros/settlements/${id}/pay`, { method: "PUT" });
  return handleResponse(response);
};

export const unpayTerceirosSettlement = async (id) => {
  const response = await authFetch(`/api/terceiros/settlements/${id}/unpay`, { method: "PUT" });
  return handleResponse(response);
};

export const deleteTerceirosSettlement = async (id) => {
  const response = await authFetch(`/api/terceiros/settlements/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

export const updateTerceirosSettlement = async (id, data) => {
  const response = await authFetch(`/api/terceiros/settlements/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const removeSettlementItem = async (settlementId, itemId) => {
  const response = await authFetch(`/api/terceiros/settlements/${settlementId}/items/${itemId}`, { method: "DELETE" });
  return handleResponse(response);
};

export const updateSettlementItem = async (settlementId, itemId, data) => {
  const response = await authFetch(`/api/terceiros/settlements/${settlementId}/items/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const addSettlementItems = async (settlementId, items) => {
  const response = await authFetch(`/api/terceiros/settlements/${settlementId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
  return handleResponse(response);
};

// ── Terceiros: Settlement Discounts ──────────────────────────────────────────

export const addSettlementDiscount = async (settlementId, data) => {
  const response = await authFetch(`/api/terceiros/settlements/${settlementId}/discounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const updateSettlementDiscount = async (settlementId, discountId, data) => {
  const response = await authFetch(`/api/terceiros/settlements/${settlementId}/discounts/${discountId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const removeSettlementDiscount = async (settlementId, discountId) => {
  const response = await authFetch(`/api/terceiros/settlements/${settlementId}/discounts/${discountId}`, {
    method: "DELETE"
  });
  return handleResponse(response);
};

export const fetchTerceirosPricesForOfs = async (codcli, items) => {
  const response = await authFetch("/api/terceiros/find-prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codcli, items })
  });
  return handleResponse(response);
};

// ── Terceiros: OF Sync ──────────────────────────────────────────────────────

export const triggerOfSync = async () => {
  const response = await authFetch("/api/sisplan/of-sync", { method: "POST" });
  return handleResponse(response);
};

// ── System Settings ─────────────────────────────────────────────────────────

export const fetchSystemSettings = async () => {
  const response = await authFetch("/api/settings");
  return handleResponse(response);
};

export const updateSystemSettings = async (data) => {
  const response = await authFetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return handleResponse(response);
};

export const uploadSystemLogo = async (file) => {
  const formData = new FormData();
  formData.append("logo", file);
  const response = await authFetch("/api/settings/logo", {
    method: "POST",
    body: formData
  });
  return handleResponse(response);
};

export const deleteSystemLogo = async () => {
  const response = await authFetch("/api/settings/logo", { method: "DELETE" });
  return handleResponse(response);
};

export const uploadPwaIcon = async (file) => {
  const formData = new FormData();
  formData.append("pwaIcon", file);
  const response = await authFetch("/api/settings/pwa-icon", {
    method: "POST",
    body: formData,
  });
  return handleResponse(response);
};

export const deletePwaIcon = async () => {
  const response = await authFetch("/api/settings/pwa-icon", { method: "DELETE" });
  return handleResponse(response);
};

// ── Stores (Gerenciamento de Lojas) ──────────────────────────────────────────

export const fetchStoresManagement = async () => {
  const response = await authFetch("/api/lojas");
  return handleResponse(response);
};

export const createStoreMgmt = async (data) => {
  const response = await authFetch("/api/lojas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateStoreMgmt = async (id, data) => {
  const response = await authFetch(`/api/lojas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteStoreMgmt = async (id) => {
  const response = await authFetch(`/api/lojas/${id}`, { method: "DELETE" });
  return handleResponse(response);
};

export const testStoreConnection = async (id) => {
  const response = await authFetch(`/api/lojas/${id}/test`, { method: "POST" });
  return handleResponse(response);
};

export const getStoreOAuthUrl = async (id) => {
  const response = await authFetch(`/api/lojas/${id}/oauth/url`);
  return handleResponse(response);
};

export const exchangeStoreOAuthCode = async (id, code) => {
  const response = await authFetch(`/api/lojas/${id}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return handleResponse(response);
};

export const fetchAnuncios = async (storeId) => {
  const response = await authFetch(`/api/anuncios?store_id=${storeId}`);
  return handleResponse(response);
};

export const fetchMarketComparison = async (itemId, storeId, ourPrice) => {
  const priceParam = ourPrice != null ? `&our_price=${ourPrice}` : '';
  const response = await authFetch(`/api/anuncios/${itemId}/market?store_id=${storeId}${priceParam}`);
  return handleResponse(response);
};


export const fetchOFRastreio = async (ofNumero) => {
  const response = await authFetch(`/api/terceiros/rastreio-of/${encodeURIComponent(ofNumero)}`);
  return handleResponse(response);
};

// ── Products Management ──────────────────────────────────────────────────────

export const fetchProducts = async ({ codigo, nome, lojas, page, limit } = {}) => {
  const params = new URLSearchParams();
  if (codigo) params.set('codigo', codigo);
  if (nome) params.set('nome', nome);
  if (lojas && lojas.length > 0) params.set('lojas', lojas.join(','));
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const response = await authFetch(`/api/products?${params.toString()}`);
  return handleResponse(response);
};

export const fetchProductStores = async () => {
  const response = await authFetch('/api/products/stores');
  return handleResponse(response);
};

export const updateProductKitQty = async (storeVariationKey, kitQty, nome) => {
  const response = await authFetch('/api/products/kit-qty', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_variation_key: storeVariationKey, kit_qty: kitQty, nome }),
  });
  return handleResponse(response);
};

export const fetchProductVariations = async (storeKey, adName) => {
  const params = new URLSearchParams({ store_key: storeKey, ad_name: adName });
  const response = await authFetch(`/api/products/variations?${params.toString()}`);
  return handleResponse(response);
};

export const fetchProductDashboard = async (start, end, groupIds, lojas) => {
  const params = new URLSearchParams({ start, end });
  if (groupIds && groupIds.length > 0) params.set('group_ids', groupIds.join(','));
  if (lojas && lojas.length > 0) params.set('lojas', lojas.join(','));
  const response = await authFetch(`/api/products/dashboard?${params.toString()}`);
  return handleResponse(response);
};

export const fetchProductOrders = async (svk, start, end) => {
  const params = new URLSearchParams({ svk, start, end });
  const response = await authFetch(`/api/products/dashboard/orders?${params.toString()}`);
  return handleResponse(response);
};

// ── Product Groups ───────────────────────────────────────────────────────────

export const fetchProductGroups = async () => {
  const response = await authFetch('/api/products/groups');
  return handleResponse(response);
};

export const createProductGroup = async (name) => {
  const response = await authFetch('/api/products/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handleResponse(response);
};

export const updateProductGroup = async (id, name) => {
  const response = await authFetch(`/api/products/groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handleResponse(response);
};

export const deleteProductGroup = async (id) => {
  const response = await authFetch(`/api/products/groups/${id}`, { method: 'DELETE' });
  return handleResponse(response);
};

export const fetchProductGroupItems = async (groupId) => {
  const response = await authFetch(`/api/products/groups/${groupId}/items`);
  return handleResponse(response);
};

export const addProductGroupItem = async (groupId, adName) => {
  const response = await authFetch(`/api/products/groups/${groupId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_name: adName }),
  });
  return handleResponse(response);
};

export const addProductGroupItemsBatch = async (groupId, adNames) => {
  const response = await authFetch(`/api/products/groups/${groupId}/items/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_names: adNames }),
  });
  return handleResponse(response);
};

export const removeProductGroupItem = async (groupId, adName) => {
  const response = await authFetch(`/api/products/groups/${groupId}/items/${encodeURIComponent(adName)}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
};

export const removeProductGroupItemsBatch = async (groupId, adNames) => {
  const response = await authFetch(`/api/products/groups/${groupId}/items/batch`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_names: adNames }),
  });
  return handleResponse(response);
};

export const fetchAllAdsWithGroup = async () => {
  const response = await authFetch('/api/products/ads');
  return handleResponse(response);
};
