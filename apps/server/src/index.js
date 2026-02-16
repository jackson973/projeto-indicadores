// Load environment variables
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const apiRouter = require("./routes/api");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const cashflowRouter = require("./routes/cashflow");
const emailRouter = require("./routes/email");
const { authenticate } = require("./middleware/auth");

// Initialize database connection (will test connection on import)
require('./db/connection');

// Seed admin user on startup
require('./db/seedAdmin');

// Start cashflow alert scheduler
const { startCashflowAlertScheduler } = require('./services/cashflowAlertScheduler');
startCashflowAlertScheduler();

const app = express();

app.use(cors());
app.use(express.json());

// Public routes (no auth required)
app.use("/api/auth", authRouter);

// Protected routes (require valid JWT)
app.use("/api/users", usersRouter);
app.use("/api/cashflow", cashflowRouter);
app.use("/api/email", emailRouter);
app.use("/api", authenticate, apiRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
