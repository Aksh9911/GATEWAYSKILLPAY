const express = require("express");
const router = express.Router();

const {
  createPaymentHandler,
  createUserOrderHandler,
  verifyPaymentHandler,
  getPaymentStatusHandler,
  submitUtrHandler,
  queryUtrHandler,
  webhookHandler,
} = require("../controllers/payment.controller");

// NOTE: Webhook endpoint is registered at app.js level as /api/payment/webhook
// This route at /webhook is mounted at /api/payments in app.js

// User-facing endpoint (accepts amount only)
router.post("/user/order", createUserOrderHandler);       // For user app - auto-generates order params

// Direct SilkPay endpoints
router.post("/create", createPaymentHandler);             // POST /transaction/payin/v2
router.post("/status", getPaymentStatusHandler);          // POST /transaction/payin/query
router.post("/submit-utr", submitUtrHandler);              // POST /transaction/payin/submit/utr
router.post("/query-utr", queryUtrHandler);                 // POST /transaction/payin/query/utr
router.get("/verify/:paymentId", verifyPaymentHandler);   // GET (uses query endpoint internally)

// Webhook route for SilkPay callbacks (no auth required)
// SilkPay will send SUCCESS payment notifications to this endpoint
router.post("/webhook", webhookHandler);                    // POST /api/payments/webhook

module.exports = router;
