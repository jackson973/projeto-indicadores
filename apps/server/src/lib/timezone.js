const TZ = 'America/Sao_Paulo';

// ICU-build-independent parts extractor. Avoids relying on 'en-CA' locale
// formatting, which falls back to en-US (M/D/YYYY) on small-icu Node builds.
function getTzParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    weekday: get('weekday'),
  };
}

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
  const { year, month, day } = getTzParts(now);
  return `${year}-${month}-${day}`;
}

/**
 * Get current year in São Paulo timezone.
 * @returns {number}
 */
function getSaoPauloYear() {
  return parseInt(getTzParts(new Date()).year, 10);
}

/**
 * Get current month (1-12) in São Paulo timezone.
 * @returns {number}
 */
function getSaoPauloMonth() {
  return parseInt(getTzParts(new Date()).month, 10);
}

/**
 * Get current day of week (0=Sunday) in São Paulo timezone.
 * @returns {number}
 */
function getSaoPauloDayOfWeek() {
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[getTzParts(new Date()).weekday] ?? 0;
}

module.exports = { getSaoPauloDate, getSaoPauloYear, getSaoPauloMonth, getSaoPauloDayOfWeek, TZ };
