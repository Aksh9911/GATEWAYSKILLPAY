require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const paymentRoutes = require("./routes/payment.routes");
const { webhookHandler } = require("./controllers/payment.controller");

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Logging middleware
app.use(morgan("combined"));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SilkPay Webhook endpoint (must be at exact URL used in notifyUrl)
// This route is registered separately to ensure it's at /api/payment/webhook
app.post("/api/payment/webhook", webhookHandler);

// API routes (all other payment endpoints)
app.use("/api/payments", paymentRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "silkpay-gateway",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "SilkPay Payment Gateway API",
    version: "1.0.0",
    endpoints: {
      createPayment: "POST /api/payments/create",
      queryPaymentStatus: "POST /api/payments/status",
      submitUtr: "POST /api/payments/submit-utr",
      queryUtr: "POST /api/payments/query-utr",
      verifyPayment: "GET /api/payments/verify/:paymentId",
      webhook: "POST /api/payment/webhook",
      health: "GET /health",
    },
    silkpayEndpoints: {
      create: "POST https://api.dev.silkpay.ai/transaction/payin/v2",
      query: "POST https://api.dev.silkpay.ai/transaction/payin/query",
      submitUtr: "POST https://api.dev.silkpay.ai/transaction/payin/submit/utr",
      queryUtr: "POST https://api.dev.silkpay.ai/transaction/payin/query/utr",
      callback: "POST https://api.dev.silkpay.ai/callback",
    },
    documentation: "https://silkpay.stoplight.io/docs/silkpay/branches/main/30sk57lgvy7qx-guide",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 SilkPay Gateway Server running on port ${PORT}`);
  console.log(`📋 API Base URL: http://localhost:${PORT}/api/payments`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);

});

module.exports = app;
