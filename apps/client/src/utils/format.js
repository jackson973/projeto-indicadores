export const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

export const formatNumber = (value) =>
  new Intl.NumberFormat("pt-BR").format(Number(value || 0));

export const formatPercent = (value, digits = 2) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));
