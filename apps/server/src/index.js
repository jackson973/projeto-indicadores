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
const { authenticate } = require("./middleware/auth");

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

  const app = express();

  app.use(cors());
  app.use(express.json());

  // Public routes (no auth required)
  app.use("/api/auth", authRouter);

  // Protected routes (require valid JWT)
  app.use("/api/users", usersRouter);
  app.use("/api/cashflow", cashflowRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/sisplan", sisplanRouter);
  app.use("/api/whatsapp", whatsappRouter);
  app.use("/api/upseller", upsellerRouter);
  app.use("/api", authenticate, apiRouter);

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
