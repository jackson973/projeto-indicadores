/**
 * UpSeller Scraper - Main entry point.
 *
 * Flow:
 *   1. Login via Puppeteer (CAPTCHA + email verification)
 *   2. Fetch profit report data via HTTP API (JSON pagination)
 *   3. Upload to the projeto-indicadores server for import
 *
 * Usage:
 *   npm run scrape                         # Last 90 days (default)
 *   npm run scrape -- --days 30            # Last 30 days
 *   npm run scrape -- --start 2025-01-01 --end 2025-01-31
 */
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import axios from 'axios';
import FormData from 'form-data';
import xlsx from 'xlsx';
import config from './config.js';
import logger from './logger.js';
import { login } from './login.js';
import { createClient, fetchProfitReport, mapOrdersToSales } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = resolve(__dirname, '..', 'downloads');
mkdirSync(DOWNLOADS_DIR, { recursive: true });

async function main() {
  const { startDate, endDate } = parseDateArgs();
  logger.info({ startDate, endDate }, 'Starting UpSeller scraper');

  // Step 1: Login
  logger.info('=== Step 1: Login ===');
  const { cookies } = await login();

  // Step 2: Fetch profit report data via API
  logger.info('=== Step 2: Fetch profit report ===');
  const client = createClient(cookies);
  const orders = await fetchProfitReport(client, startDate, endDate);

  if (orders.length === 0) {
    logger.warn('No orders found for the given date range');
    return;
  }

  // Step 3: Map to sales format
  logger.info('=== Step 3: Map and import ===');
  const salesData = mapOrdersToSales(orders);

  // Save a local backup as Excel
  const filename = `upseller_${startDate}_${endDate}.xlsx`;
  const filePath = resolve(DOWNLOADS_DIR, filename);
  saveAsExcel(salesData, filePath);
  logger.info({ filePath, rows: salesData.length }, 'Backup saved locally');

  // Step 4: Upload to server (if running)
  logger.info('=== Step 4: Upload to server ===');
  const excelBuffer = generateExcelBuffer(salesData);
  try {
    await uploadToServer(excelBuffer, filename);
  } catch (err) {
    logger.warn({ err: err.message }, 'Upload to server failed (is the server running?)');
    logger.info({ filePath }, 'Data saved locally - you can upload manually later');
  }

  logger.info('=== Scraper completed successfully ===');
}

/**
 * Generate an Excel buffer from sales data (matching the upload format).
 */
function generateExcelBuffer(salesData) {
  const rows = salesData.map((s) => ({
    'Nº de Pedido': s.orderId,
    'Data': s.date,
    'Nome da Loja no UpSeller': s.store,
    'Produto': s.product,
    'Nome do Anúncio': s.adName,
    'Variação': s.variation,
    'SKU': s.sku,
    'Quantidade': s.quantity,
    'Total': s.total,
    'Preço do Produto': s.unitPrice,
    'Estado': s.state,
    'Plataformas': s.platform,
    'Pós-venda/Cancelado/Devolvido': s.status,
    'Cancelado por': s.cancelBy,
    'Razão do Cancelamento': s.cancelReason,
    'Link da Imagem': s.image,
    'Nome de Comprador': s.clientName,
    'Id do Comprador': s.codcli,
  }));

  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Orders');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Save sales data as local Excel backup.
 */
function saveAsExcel(salesData, filePath) {
  const buffer = generateExcelBuffer(salesData);
  writeFileSync(filePath, buffer);
}

/**
 * Upload the Excel file to the projeto-indicadores server.
 */
async function uploadToServer(fileBuffer, filename) {
  const form = new FormData();
  form.append('file', fileBuffer, {
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  try {
    const { data } = await axios.post(config.server.uploadUrl, form, {
      headers: form.getHeaders(),
      timeout: 120000,
    });

    logger.info(
      { inserted: data.inserted, updated: data.updated, rows: data.rows, errors: data.errors },
      'Upload completed',
    );
  } catch (err) {
    if (err.response) {
      logger.error(
        { status: err.response.status, data: err.response.data },
        'Upload to server failed',
      );
    }
    throw new Error(`Upload failed: ${err.message}`);
  }
}

/**
 * Parse CLI date arguments.
 */
function parseDateArgs() {
  const args = process.argv.slice(2);
  let startDate, endDate;

  const startIdx = args.indexOf('--start');
  const endIdx = args.indexOf('--end');
  const daysIdx = args.indexOf('--days');

  if (startIdx !== -1 && endIdx !== -1) {
    startDate = args[startIdx + 1];
    endDate = args[endIdx + 1];
  } else {
    const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 90;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    startDate = formatDate(start);
    endDate = formatDate(end);
  }

  return { startDate, endDate };
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Fatal error');
  process.exit(1);
});
