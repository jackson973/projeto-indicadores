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

// Sisplan Active Check (any authenticated user)
export const fetchSisplanActive = async () => {
  const response = await authFetch("/api/sisplan-active");
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
