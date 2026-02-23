const TZ = 'America/Sao_Paulo';

export function getSaoPauloDate(daysOffset = 0) {
  const now = new Date();
  if (daysOffset !== 0) {
    now.setDate(now.getDate() + daysOffset);
  }
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function getSaoPauloYear() {
  return parseInt(new Date().toLocaleString('en-CA', { timeZone: TZ, year: 'numeric' }));
}

export function getSaoPauloMonth() {
  return parseInt(new Date().toLocaleString('en-CA', { timeZone: TZ, month: 'numeric' }));
}
