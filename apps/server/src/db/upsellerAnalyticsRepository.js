const db = require('./connection');

async function upsertDailyAnalytics(referenceDate, data) {
  const result = await db.query(
    `INSERT INTO upseller_daily_analytics
       (reference_date, per_hour, yes_per_hour, product_tops, shop_tops,
        today_order_num, today_sale_amount,
        yesterday_order_num, yesterday_sale_amount,
        yesterday_period_order_num, yesterday_period_sale_amount,
        currency, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
     ON CONFLICT (reference_date) DO UPDATE SET
       per_hour = EXCLUDED.per_hour,
       yes_per_hour = EXCLUDED.yes_per_hour,
       product_tops = EXCLUDED.product_tops,
       shop_tops = EXCLUDED.shop_tops,
       today_order_num = EXCLUDED.today_order_num,
       today_sale_amount = EXCLUDED.today_sale_amount,
       yesterday_order_num = EXCLUDED.yesterday_order_num,
       yesterday_sale_amount = EXCLUDED.yesterday_sale_amount,
       yesterday_period_order_num = EXCLUDED.yesterday_period_order_num,
       yesterday_period_sale_amount = EXCLUDED.yesterday_period_sale_amount,
       currency = EXCLUDED.currency,
       fetched_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      referenceDate,
      JSON.stringify(data.perHour || []),
      JSON.stringify(data.yesPerHour || []),
      JSON.stringify(data.productTops || []),
      JSON.stringify(data.shopTops || []),
      data.todayOrderNum || 0,
      data.todaySaleAmount || 0,
      data.yesterdayOrderNum || 0,
      data.yesterdaySaleAmount || 0,
      data.yesterdayPeriodOrderNum || 0,
      data.yesterdayPeriodSaleAmount || 0,
      data.currency || 'BRL'
    ]
  );
  return result.rows[0] || null;
}

async function getDailyAnalytics(referenceDate) {
  const result = await db.query(
    `SELECT id, reference_date AS "referenceDate",
            per_hour AS "perHour",
            yes_per_hour AS "yesPerHour",
            product_tops AS "productTops",
            shop_tops AS "shopTops",
            today_order_num AS "todayOrderNum",
            today_sale_amount AS "todaySaleAmount",
            yesterday_order_num AS "yesterdayOrderNum",
            yesterday_sale_amount AS "yesterdaySaleAmount",
            yesterday_period_order_num AS "yesterdayPeriodOrderNum",
            yesterday_period_sale_amount AS "yesterdayPeriodSaleAmount",
            currency,
            fetched_at AT TIME ZONE 'UTC' AS "fetchedAt",
            created_at AT TIME ZONE 'UTC' AS "createdAt"
     FROM upseller_daily_analytics
     WHERE reference_date = $1`,
    [referenceDate]
  );
  return result.rows[0] || null;
}

async function isFresh(referenceDate, maxAgeMs = 5 * 60 * 1000) {
  const row = await getDailyAnalytics(referenceDate);
  if (!row || !row.fetchedAt) return false;
  const age = Date.now() - new Date(row.fetchedAt).getTime();
  return age < maxAgeMs;
}

module.exports = {
  upsertDailyAnalytics,
  getDailyAnalytics,
  isFresh
};
