const express = require("express");
const router = express.Router();

const {
  createPayoutHandler,
  checkPayoutStatusHandler,
  payoutWebhookHandler,
  getMerchantBalanceHandler,
} = require("../controllers/payout.controller");
const { requirePayoutSecret } = require("../middleware/requirePayoutSecret");

router.post("/create", requirePayoutSecret, createPayoutHandler);
router.post("/status", checkPayoutStatusHandler);
router.get("/balance", getMerchantBalanceHandler);
router.post("/balance", getMerchantBalanceHandler);
router.post("/webhook", payoutWebhookHandler);

module.exports = router;
