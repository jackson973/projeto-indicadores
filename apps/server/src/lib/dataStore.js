const salesRepository = require('../db/salesRepository');

/**
 * Set sales data (batch upsert to database)
 * @param {Array} rows - Normalized sales data
 * @returns {Promise<{inserted: number, updated: number}>}
 */
const setSales = async (rows) => {
  return await salesRepository.batchUpsertSales(rows);
};

/**
 * Get all sales data (with optional filters)
 * @param {Object} filters - Optional filters (start, end, store, etc.)
 * @returns {Promise<Array>}
 */
const getSales = async (filters = {}) => {
  return await salesRepository.getSales(filters);
};

/**
 * Clear all sales data
 * @returns {Promise<void>}
 */
const clearSales = async () => {
  return await salesRepository.clearSales();
};

/**
 * Check if any sales exist
 * @returns {Promise<boolean>}
 */
const hasSales = async () => {
  return await salesRepository.hasSales();
};

module.exports = {
  setSales,
  getSales,
  clearSales,
  hasSales
};
