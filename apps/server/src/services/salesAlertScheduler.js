const cron = require('node-cron');
const analyticsRepo = require('../db/upsellerAnalyticsRepository');
const salesRepo = require('../db/salesRepository');
const alertsRepo = require('../db/whatsappSalesAlertsRepository');
const { sendTextToPhone } = require('./whatsappBotService');

const LOG_PREFIX = '[Sales Alert]';

function getGreeting(hour) {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatCurrency(value) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build the sales summary message for a user.
 * Combines:
 *  - Online (UpSeller): from upseller_daily_analytics (real-time, every 5min)
 *  - Fábrica (Sisplan): from sales table with store='Fabrica' (synced every 5min)
 * Same logic as the main dashboard.
 */
async function buildAlertMessage(userName, brHour, today) {
  const greeting = getGreeting(brHour);
  const firstName = userName.split(' ')[0];

  // 1. Online data (UpSeller real-time analytics)
  const analytics = await analyticsRepo.getDailyAnalytics(today);

  const onlineRevenue = parseFloat(analytics?.todaySaleAmount || 0);
  const onlineOrders = parseInt(analytics?.todayOrderNum || 0);
  const onlinePerHour = Array.isArray(analytics?.perHour) ? analytics.perHour : [];
  const onlineProductTops = Array.isArray(analytics?.productTops) ? analytics.productTops : [];
  const yesterdayPeriodRevenue = parseFloat(analytics?.yesterdayPeriodSaleAmount || 0);

  // 2. Fábrica data (Sisplan via sales table — synced every 5min)
  const fabricaRevenue = await salesRepo.getDailyRevenue(today, { store: 'Fabrica' });
  const fabricaHourly = await salesRepo.getHourlySales(today, { store: 'Fabrica' });
  const fabricaTopProducts = await salesRepo.getTopProducts(today, { store: 'Fabrica' }, 5);

  // 3. Combined totals
  const totalRevenue = onlineRevenue + fabricaRevenue;
  const fabricaOrders = fabricaHourly.reduce((sum, h) => sum + h.validOrders, 0);
  const totalOrders = onlineOrders + fabricaOrders;
  const ticketMedio = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  if (totalRevenue === 0 && totalOrders === 0) {
    return { msg: null, combinedPerHour: [] };
  }

  // 4. Combined per-hour data (for peak detection)
  const combinedPerHour = Array.from({ length: 24 }, (_, i) => {
    const online = onlinePerHour[i] || {};
    const fabrica = fabricaHourly[i] || {};
    return {
      amount: (parseFloat(online.amount || 0)) + (fabrica.amount || 0),
      validOrders: (parseInt(online.validOrders || 0)) + (fabrica.validOrders || 0)
    };
  });

  // Current hour
  const currentHour = combinedPerHour[brHour] || { amount: 0, validOrders: 0 };

  // 5. Combined top products (merge online + fabrica, sort by revenue)
  const allProducts = [];
  for (const p of onlineProductTops) {
    allProducts.push({
      name: p.productName || p.product_name || p.name || '-',
      units: parseInt(p.unitsSold || p.validOrders || p.valid_orders || 0),
      revenue: parseFloat(p.sales || p.validSales || p.valid_sales || 0)
    });
  }
  for (const p of fabricaTopProducts) {
    allProducts.push({
      name: p.productName || '-',
      units: parseInt(p.unitsSold || 0),
      revenue: p.sales || 0
    });
  }
  allProducts.sort((a, b) => b.revenue - a.revenue);
  const topProducts = allProducts.slice(0, 5);

  // 6. Build message
  let msg = `${greeting}, ${firstName}! 📊\n\n`;
  msg += `*Resumo de vendas — ${today.split('-').reverse().join('/')}*\n\n`;
  msg += `💰 *Receita:* ${formatCurrency(totalRevenue)}\n`;

  // Show breakdown if both channels have data
  if (onlineRevenue > 0 && fabricaRevenue > 0) {
    msg += `   _Online: ${formatCurrency(onlineRevenue)} | Fábrica: ${formatCurrency(fabricaRevenue)}_\n`;
  }

  msg += `📦 *Pedidos:* ${totalOrders}\n`;
  msg += `🎯 *Ticket médio:* ${formatCurrency(ticketMedio)}\n`;

  // Yesterday comparison (online only — fábrica doesn't have period comparison)
  if (yesterdayPeriodRevenue > 0) {
    const diff = totalRevenue - yesterdayPeriodRevenue;
    const pct = Math.round((diff / yesterdayPeriodRevenue) * 100);
    const arrow = diff >= 0 ? '↑' : '↓';
    msg += `📊 *vs ontem (mesmo horário):* ${arrow} ${Math.abs(pct)}%\n`;
  }

  if (currentHour.validOrders > 0) {
    msg += `\n⏰ *Última hora (${brHour}h):* ${currentHour.validOrders} pedidos | ${formatCurrency(currentHour.amount)}`;
  }

  if (topProducts.length > 0) {
    msg += '\n\n🏆 *Top produtos:*\n';
    topProducts.forEach((p, i) => {
      msg += `${i + 1}. ${p.name} — ${p.units} un. | ${formatCurrency(p.revenue)}\n`;
    });
  }

  // Data freshness info
  if (analytics?.fetchedAt) {
    const fetchedTime = new Date(analytics.fetchedAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    });
    msg += `\n_Dados atualizados às ${fetchedTime}_`;
  }

  return { msg, combinedPerHour, totalRevenue };
}

/**
 * Check for sales spike and send peak alerts.
 * Uses combined per-hour data (online + fábrica).
 */
async function checkPeakAlert(brHour, today, combinedPerHour) {
  if (brHour < 2 || !combinedPerHour || combinedPerHour.length === 0) return;

  // Get previous hours with sales
  const prevAmounts = combinedPerHour
    .slice(0, brHour)
    .map(h => h.amount)
    .filter(a => a > 0);

  if (prevAmounts.length < 2) return;

  const avgRevenue = prevAmounts.reduce((s, a) => s + a, 0) / prevAmounts.length;
  const currentRevenue = combinedPerHour[brHour]?.amount || 0;

  // Spike threshold: current hour > 2x average
  if (currentRevenue <= avgRevenue * 2 || currentRevenue < 100) return;

  console.log(`${LOG_PREFIX} Peak detected! Hour ${brHour}: ${formatCurrency(currentRevenue)} vs avg ${formatCurrency(avgRevenue)}`);

  const peakUsers = await alertsRepo.getPeakAlertUsers();
  if (peakUsers.length === 0) return;

  const pctIncrease = Math.round(((currentRevenue / avgRevenue) - 1) * 100);
  const greeting = getGreeting(brHour);

  for (const user of peakUsers) {
    const firstName = user.name.split(' ')[0];
    const msg = `${greeting}, ${firstName}! 🚀\n\n` +
      `*Pico de vendas detectado!*\n\n` +
      `⏰ *${brHour}h:* ${formatCurrency(currentRevenue)}\n` +
      `📈 *+${pctIncrease}%* acima da média por hora (${formatCurrency(avgRevenue)})\n\n` +
      `As vendas estão acelerando! 🔥`;

    await sendTextToPhone(user.whatsapp, msg);
  }

  console.log(`${LOG_PREFIX} Peak alert sent to ${peakUsers.length} user(s)`);
}

/**
 * Start the sales alert scheduler
 * Runs every hour at minute 2 (e.g., 08:02, 09:02, ...)
 * Minute 2 to ensure analytics has been refreshed (runs at :00 and :05)
 */
function startSalesAlertScheduler() {
  const schedule = '2 * * * *'; // minute 2 of every hour

  console.log(`${LOG_PREFIX} Initializing...`);
  console.log(`${LOG_PREFIX} Schedule: Every hour at :02`);

  cron.schedule(schedule, async () => {
    console.log(`${LOG_PREFIX} Running hourly check...`);

    try {
      const now = new Date();
      const brHour = parseInt(now.toLocaleString('en-US', {
        hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo'
      }));
      const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      // 1. Get users to alert
      const usersToAlert = await alertsRepo.getAlertsToSendNow();
      console.log(`${LOG_PREFIX} Hour ${brHour}, users to alert: ${usersToAlert.length}`);

      if (usersToAlert.length === 0 && !(await hasAnyPeakAlertUsers())) {
        console.log(`${LOG_PREFIX} No users to alert, skipping.`);
        return;
      }

      // 2. Build and send messages
      let combinedPerHourData = null;

      for (const user of usersToAlert) {
        try {
          const { msg, combinedPerHour } = await buildAlertMessage(user.name, brHour, today);
          combinedPerHourData = combinedPerHour;

          if (!msg) {
            console.log(`${LOG_PREFIX} No sales data available for ${today}, skipping ${user.name}`);
            continue;
          }

          const sent = await sendTextToPhone(user.whatsapp, msg);
          if (sent) {
            await alertsRepo.updateLastSentAt(user.id);
            console.log(`${LOG_PREFIX} ✓ Alert sent to ${user.name} (${user.whatsapp})`);
          } else {
            console.log(`${LOG_PREFIX} ✗ Failed to send to ${user.name}`);
          }
        } catch (err) {
          console.error(`${LOG_PREFIX} Error sending to ${user.name}:`, err.message);
        }
      }

      // 3. Check for peak alerts
      try {
        if (!combinedPerHourData) {
          // Build combined hourly data for peak detection only
          const analytics = await analyticsRepo.getDailyAnalytics(today);
          const onlinePerHour = Array.isArray(analytics?.perHour) ? analytics.perHour : [];
          const fabricaHourly = await salesRepo.getHourlySales(today, { store: 'Fabrica' });
          combinedPerHourData = Array.from({ length: 24 }, (_, i) => {
            const online = onlinePerHour[i] || {};
            const fabrica = fabricaHourly[i] || {};
            return {
              amount: (parseFloat(online.amount || 0)) + (fabrica.amount || 0),
              validOrders: (parseInt(online.validOrders || 0)) + (fabrica.validOrders || 0)
            };
          });
        }
        await checkPeakAlert(brHour, today, combinedPerHourData);
      } catch (err) {
        console.error(`${LOG_PREFIX} Peak alert check error:`, err.message);
      }

    } catch (error) {
      console.error(`${LOG_PREFIX} Critical error:`, error);
    }
  }, {
    scheduled: true,
    timezone: 'America/Sao_Paulo',
  });

  console.log(`${LOG_PREFIX} Started successfully`);
}

async function hasAnyPeakAlertUsers() {
  const users = await alertsRepo.getPeakAlertUsers();
  return users.length > 0;
}

module.exports = { startSalesAlertScheduler };
