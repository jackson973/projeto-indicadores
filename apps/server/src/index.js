// Load environment variables
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const apiRouter = require("./routes/api");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const cashflowRouter = require("./routes/cashflow");
const emailRouter = require("./routes/email");
const sisplanRouter = require("./routes/sisplan");
const whatsappRouter = require("./routes/whatsapp");
const upsellerRouter = require("./routes/upseller");
const databaseRouter = require("./routes/database");
const terceirosRouter = require("./routes/terceiros");
const settingsRouter = require("./routes/settings");
const storesRouter = require("./routes/stores");
const anunciosRouter = require("./routes/anuncios");
const productsRouter = require("./routes/products");
const ordersRouter = require("./routes/orders");
const validadorRouter = require("./routes/validador");
const stockRouter = require("./routes/stock");
const costRouter = require("./routes/cost");
const accessRouter = require("./routes/access");
const purchasesRouter = require("./routes/purchases");
const mlProfitRouter = require("./routes/mlProfit");
const path = require("path");
const { authenticate, requireModule } = require("./middleware/auth");

// Initialize database connection (will test connection on import)
require('./db/connection');

const { runMigrations } = require('./db/migrate');

async function start() {
  // Run pending migrations before anything else
  await runMigrations();

  // Seed admin user on startup
  require('./db/seedAdmin');

  // Start cashflow alert scheduler
  const { startCashflowAlertScheduler } = require('./services/cashflowAlertScheduler');
  startCashflowAlertScheduler();

  // Start Sisplan sync scheduler
  const { startSisplanSyncScheduler } = require('./services/sisplanSyncService');
  startSisplanSyncScheduler();

  // Start UpSeller sync scheduler
  const { startUpsellerSyncScheduler } = require('./services/upsellerSyncService');
  startUpsellerSyncScheduler();

  // Start UpSeller analytics scheduler (per-hour data, every 5 min)
  const { startAnalyticsScheduler } = require('./services/upsellerAnalyticsService');
  startAnalyticsScheduler();

  // Start ML daily snapshot scheduler (builds trend history for Anúncios dashboard)
  const { startMlSnapshotScheduler } = require('./services/mlSnapshotScheduler');
  startMlSnapshotScheduler();

  // Start WhatsApp sales alert scheduler (hourly alerts to users)
  const { startSalesAlertScheduler } = require('./services/salesAlertScheduler');
  startSalesAlertScheduler();

  // Start ML daily profit report scheduler (valores reais via API + PDF)
  const { startMlProfitScheduler } = require('./services/mlProfitScheduler');
  startMlProfitScheduler();

  // Start WhatsApp bot if active
  try {
    const { startWhatsappBot } = require('./services/whatsappBotService');
    const whatsappSettingsRepo = require('./db/whatsappRepository');
    const settings = await whatsappSettingsRepo.getSettings();
    if (settings && settings.active) {
      console.log('[WhatsApp Bot] Settings active, attempting to restore connection...');
      await startWhatsappBot();
    } else {
      console.log('[WhatsApp Bot] Not active, skipping auto-start.');
    }
  } catch (error) {
    console.error('[WhatsApp Bot] Failed to auto-start:', error.message);
  }

  // Versão do deploy — o servidor reinicia a cada deploy, então reflete o commit atual.
  // Usada pela trava de versão do cliente para forçar atualização quando há bundle novo.
  const { execSync } = require('child_process');
  let APP_SHA = process.env.APP_SHA || 'nogit';
  try { APP_SHA = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { /* sem git */ }
  const APP_STARTED_AT = new Date().toISOString();

  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Public routes (no auth required)
  app.get("/api/version", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ sha: APP_SHA, startedAt: APP_STARTED_AT });
  });
  app.use("/api/auth", authRouter);

  // Protected routes (require valid JWT)
  app.use("/api/users", usersRouter);
  app.use("/api/cashflow", cashflowRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/sisplan", sisplanRouter);
  app.use("/api/whatsapp", whatsappRouter);
  app.use("/api/upseller", upsellerRouter);
  app.use("/api/terceiros", terceirosRouter);
  app.use("/api/settings", settingsRouter);
  // Allow token via query string (needed for backup download via <a href>, bypasses service worker)
  app.use("/api/database", (req, res, next) => {
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  }, authenticate, requireModule('configuracoes'), databaseRouter);
  app.use("/api/lojas", storesRouter);
  app.use("/api/anuncios", anunciosRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/validador", validadorRouter);
  app.use("/api/stock", stockRouter);
  app.use("/api/cost", costRouter);
  app.use("/api/access", accessRouter);
  app.use("/api/purchases", purchasesRouter);
  app.use("/api/ml-profit", mlProfitRouter);
  app.use("/api", authenticate, apiRouter);

  // Serve uploaded files (logos, etc)
  app.use("/uploads", express.static(path.join(__dirname, '../uploads')));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
