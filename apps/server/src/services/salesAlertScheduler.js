const cron = require('node-cron');
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
 * Build the sales summary message for a user
 */
async function buildAlertMessage(userName, brHour, today) {
  const greeting = getGreeting(brHour);
  const firstName = userName.split(' ')[0];

  const dailyRevenue = await salesRepo.getDailyRevenue(today);
  const hourlySales = await salesRepo.getHourlySales(today);
  const topProducts = await salesRepo.getTopProducts(today, {}, 5);

  const totalOrders = hourlySales.reduce((sum, h) => sum + h.validOrders, 0);
  const ticketMedio = totalOrders > 0 ? dailyRevenue / totalOrders : 0;

  // Current hour sales
  const currentHour = hourlySales[brHour] || { amount: 0, validOrders: 0 };

  let msg = `${greeting}, ${firstName}! 📊\n\n`;
  msg += `*Resumo de vendas — ${today.split('-').reverse().join('/')}*\n\n`;
  msg += `💰 *Receita:* ${formatCurrency(dailyRevenue)}\n`;
  msg += `📦 *Pedidos:* ${totalOrders}\n`;
  msg += `🎯 *Ticket médio:* ${formatCurrency(ticketMedio)}\n`;

  if (currentHour.validOrders > 0) {
    msg += `\n⏰ *Última hora (${brHour}h):* ${currentHour.validOrders} pedidos | ${formatCurrency(currentHour.amount)}`;
  }

  if (topProducts.length > 0) {
    msg += '\n\n🏆 *Top produtos:*\n';
    topProducts.forEach((p, i) => {
      msg += `${i + 1}. ${p.productName} — ${parseInt(p.unitsSold)} un. | ${formatCurrency(p.sales)}\n`;
    });
  }

  return { msg, dailyRevenue, totalOrders, hourlySales };
}

/**
 * Check for sales spike and send peak alerts
 */
async function checkPeakAlert(brHour, today, hourlySales) {
  if (brHour < 2) return; // not enough data early in the day

  // Calculate average of previous hours (only hours with sales)
  const prevHours = hourlySales.slice(0, brHour).filter(h => h.amount > 0);
  if (prevHours.length < 2) return;

  const avgRevenue = prevHours.reduce((s, h) => s + h.amount, 0) / prevHours.length;
  const currentRevenue = hourlySales[brHour]?.amount || 0;

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
 * Runs every hour at minute 1 (e.g., 08:01, 09:01, ...)
 */
function startSalesAlertScheduler() {
  const schedule = '1 * * * *'; // minute 1 of every hour

  console.log(`${LOG_PREFIX} Initializing...`);
  console.log(`${LOG_PREFIX} Schedule: Every hour at :01`);

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

      // 2. Build message once (same data for all users, personalized greeting)
      let hourlySalesData = null;

      for (const user of usersToAlert) {
        try {
          const { msg, hourlySales } = await buildAlertMessage(user.name, brHour, today);
          hourlySalesData = hourlySales;
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
        if (!hourlySalesData) {
          hourlySalesData = await salesRepo.getHourlySales(today);
        }
        await checkPeakAlert(brHour, today, hourlySalesData);
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
