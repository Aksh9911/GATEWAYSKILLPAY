const express = require("express");
const router = express.Router();

const {
  createPayoutHandler,
  checkPayoutStatusHandler,
  payoutWebhookHandler,
  getMerchantBalanceHandler,
} = require("../controllers/payout.controller");

// Create a payout order
// POST /api/payout/create
router.post("/create", createPayoutHandler);             // POST /transaction/payout

// Query payout order status
// POST /api/payout/status
router.post("/status", checkPayoutStatusHandler);         // POST /transaction/payout/query

// Get merchant wallet balance
// GET /api/payout/balance
router.get("/balance", getMerchantBalanceHandler);        // POST /transaction/balance

// Payout webhook (SilkPay callback - no auth required)
// POST /api/payout/webhook
router.post("/webhook", payoutWebhookHandler);

module.exports = router;
