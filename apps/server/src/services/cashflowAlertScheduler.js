const cron = require('node-cron');
const cashflowRepo = require('../db/cashflowRepository');
const usersRepo = require('../db/usersRepository');
const { sendCashflowAlertsEmail } = require('./emailService');

/**
 * Daily cashflow alerts email scheduler
 * Runs every day at 01:00 AM (Brazil timezone)
 */
function startCashflowAlertScheduler() {
  const schedule = '0 1 * * *'; // 01:00 AM daily

  console.log('[Cashflow Alert Scheduler] Initializing...');
  console.log('[Cashflow Alert Scheduler] Schedule: Daily at 01:00 AM');

  cron.schedule(schedule, async () => {
    console.log('[Cashflow Alert Scheduler] Running daily alert task...');

    try {
      const alertsData = await cashflowRepo.getAllBoxesAlerts();

      if (alertsData.boxes.length === 0) {
        console.log('[Cashflow Alert Scheduler] No alerts to send today.');
        return;
      }

      console.log(`[Cashflow Alert Scheduler] Found alerts in ${alertsData.boxes.length} box(es)`);

      const users = await usersRepo.findAll();
      const activeUsers = users.filter(u => u.active);

      if (activeUsers.length === 0) {
        console.log('[Cashflow Alert Scheduler] No active users to notify.');
        return;
      }

      console.log(`[Cashflow Alert Scheduler] Sending to ${activeUsers.length} active user(s)...`);

      const results = await Promise.allSettled(
        activeUsers.map(user =>
          sendCashflowAlertsEmail(user.email, user.name, alertsData)
            .then(() => {
              console.log(`[Cashflow Alert Scheduler] ✓ Email sent to ${user.email}`);
              return { email: user.email, success: true };
            })
            .catch(err => {
              console.error(`[Cashflow Alert Scheduler] ✗ Failed to send to ${user.email}:`, err.message);
              return { email: user.email, success: false, error: err.message };
            })
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      console.log(`[Cashflow Alert Scheduler] Complete: ${successful} sent, ${failed} failed`);

    } catch (error) {
      console.error('[Cashflow Alert Scheduler] Critical error:', error);
    }
  }, {
    scheduled: true,
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Cashflow Alert Scheduler] Started successfully');
}

module.exports = { startCashflowAlertScheduler };
