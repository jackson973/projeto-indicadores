const TZ = 'America/Sao_Paulo';

/**
 * Get current date in São Paulo timezone as YYYY-MM-DD string.
 * @param {number} [daysOffset=0] - Days to add/subtract (e.g., -1 for yesterday)
 * @returns {string} Date in YYYY-MM-DD format
 */
function getSaoPauloDate(daysOffset = 0) {
  const now = new Date();
  if (daysOffset !== 0) {
    now.setDate(now.getDate() + daysOffset);
  }
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Get current year in São Paulo timezone.
 * @returns {number}
 */
function getSaoPauloYear() {
  return parseInt(new Date().toLocaleString('en-CA', { timeZone: TZ, year: 'numeric' }));
}

/**
 * Get current month (1-12) in São Paulo timezone.
 * @returns {number}
 */
function getSaoPauloMonth() {
  return parseInt(new Date().toLocaleString('en-CA', { timeZone: TZ, month: 'numeric' }));
}

/**
 * Get current day of week (0=Sunday) in São Paulo timezone.
 * @returns {number}
 */
function getSaoPauloDayOfWeek() {
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  return new Date(dateStr + 'T12:00:00').getDay();
}

module.exports = { getSaoPauloDate, getSaoPauloYear, getSaoPauloMonth, getSaoPauloDayOfWeek, TZ };
