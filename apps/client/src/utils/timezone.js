const TZ = 'America/Sao_Paulo';

export function getSaoPauloDate(daysOffset = 0) {
  const now = new Date();
  if (daysOffset !== 0) {
    now.setDate(now.getDate() + daysOffset);
  }
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

// Formata uma data/instante no fuso de São Paulo (pt-BR). Útil para evitar
// que o navegador exiba em UTC/fuso americano.
export function formatSaoPaulo(dateish, opts = {}) {
  if (!dateish) return '';
  const d = new Date(dateish);
  if (isNaN(d)) return '';
  return d.toLocaleString('pt-BR', { timeZone: TZ, ...opts });
}

export function getSaoPauloYear() {
  return parseInt(new Date().toLocaleString('en-CA', { timeZone: TZ, year: 'numeric' }));
}

export function getSaoPauloMonth() {
  return parseInt(new Date().toLocaleString('en-CA', { timeZone: TZ, month: 'numeric' }));
}
