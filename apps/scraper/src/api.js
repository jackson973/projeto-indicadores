/**
 * UpSeller HTTP API client.
 * Uses session cookies from Puppeteer login to call APIs directly.
 *
 * Strategy: Use profit-report/page API with pagination to fetch data as JSON.
 * This avoids the export limit restriction of the VIP1 plan.
 */
import axios from 'axios';
import logger from './logger.js';

const BASE_URL = 'https://app.upseller.com/api';
const PLATFORMS = ['mercado', 'shopee', 'shein'];
const PAGE_SIZE = 50;

/**
 * Create an axios instance with session cookies.
 * @param {string} cookies - Cookie string from login.
 */
export function createClient(cookies) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    timeout: 30000,
  });
}

/**
 * Fetch all profit report orders across all platforms using pagination.
 *
 * @param {import('axios').AxiosInstance} client
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>} All orders from all platforms
 */
export async function fetchProfitReport(client, startDate, endDate) {
  const allOrders = [];

  for (const platform of PLATFORMS) {
    logger.info({ platform, startDate, endDate }, 'Fetching profit report');

    let pageNum = 1;
    let totalFetched = 0;
    let total = 0;

    do {
      const params = {
        tabValue: 1,
        platform,
        beginDate: startDate,
        endDate,
        searchDateType: 1,
        pageSize: PAGE_SIZE,
        pageNum,
        sortName: 0,
        sortValue: 0,
      };

      const { data: res } = await client.get('/profit-report/page', { params });

      if (res.code !== 0) {
        // code 300003 means no data/permission for this platform
        if (res.code === 300003) {
          logger.info({ platform, code: res.code, msg: res.msg, data: res.data }, 'No data or no permission, skipping');
          break;
        }
        throw new Error(`profit-report/page error (${platform}): code=${res.code} msg=${res.msg}`);
      }

      const { pageInfo } = res.data;
      total = pageInfo.total;
      const orders = pageInfo.list || [];
      totalFetched += orders.length;

      // Add platform info and push to results
      for (const order of orders) {
        allOrders.push(order);
      }

      logger.info(
        { platform, page: pageNum, fetched: totalFetched, total },
        'Page fetched',
      );

      pageNum++;
    } while (totalFetched < total);

    logger.info({ platform, total: totalFetched }, 'Platform complete');
  }

  logger.info({ totalOrders: allOrders.length }, 'All platforms fetched');
  return allOrders;
}

/**
 * Map UpSeller profit report orders to the sales table format.
 * @param {Array} orders - Raw orders from profit-report/page API
 * @returns {Array} Normalized sales data for batchUpsertSales
 */
export function mapOrdersToSales(orders) {
  return orders.map((order) => ({
    orderId: order.orderNumber || order.platformOrderId || '',
    date: order.orderCreateTime || order.userOrderCreateDate,
    store: order.shopName || '',
    product: 'Geral',
    adName: 'Geral',
    variation: '',
    sku: '',
    quantity: 1,
    total: order.orderAmount || 0,
    unitPrice: order.orderAmount || 0,
    state: '',
    platform: mapPlatformName(order.platform),
    status: order.buyerRefundAmount > 0 ? 'Reembolsado' : '',
    cancelBy: '',
    cancelReason: '',
    image: '',
    clientName: '',
    codcli: '',
    nomeFantasia: '',
    cnpjCpf: '',
  }));
}

function mapPlatformName(platform) {
  const map = {
    mercado: 'Mercado Livre',
    shopee: 'Shopee',
    shein: 'Shein',
    amazon: 'Amazon',
    tiktok: 'TikTok Shop',
    magalu: 'Magalu',
  };
  return map[platform] || platform || '';
}
