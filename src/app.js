require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const paymentRoutes = require("./routes/payment.routes");
const payoutRoutes = require("./routes/payout.routes");
const { webhookHandler } = require("./controllers/payment.controller");
const { payoutWebhookHandler } = require("./controllers/payout.controller");
const logger = require("./utils/logger");

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Logging middleware — writes HTTP access log to console AND daily log file
app.use(morgan("combined", { stream: logger.morganStream }));
app.use(morgan("dev"));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SilkPay PayIn Webhook endpoint (must be at exact URL used in notifyUrl)
// This route is registered separately to ensure it's at /api/payment/webhook
app.post("/api/payment/webhook", webhookHandler);

// SilkPay Payout Webhook endpoint (must be at exact URL used in payout notifyUrl)
app.post("/api/payout/webhook", payoutWebhookHandler);

// API routes (all other payment endpoints)
app.use("/api/payments", paymentRoutes);

// Payout API routes
app.use("/api/payout", payoutRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "silkpay-gateway",
  });
});

// Root + docs — no public surface
app.get("/", (req, res) => {
  res.status(404).type("text/plain").send("Page not existed");
});

app.all("/api/docs", (req, res) => {
  res.status(404).type("text/plain").send("Page not existed");
});
app.all("/api/docs/*", (req, res) => {
  res.status(404).type("text/plain").send("Page not existed");
});
app.all("/swagger", (req, res) => {
  res.status(404).type("text/plain").send("Page not existed");
});
app.all("/docs", (req, res) => {
  res.status(404).type("text/plain").send("Page not existed");
});

// 404 handler
app.use((req, res) => {
  res.status(404).type("text/plain").send("Page not existed");
});

// Global error handler
app.use((err, req, res, next) => {
  logger.logError("App:GlobalErrorHandler", "Unhandled error", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info("App", `SilkPay Gateway Server running on port ${PORT}`);
  logger.info("App", `PayIn  API: http://localhost:${PORT}/api/payments`);
  logger.info("App", `Payout API: http://localhost:${PORT}/api/payout`);
  logger.info("App", `Health:     http://localhost:${PORT}/health`);
});

module.exports = app;
