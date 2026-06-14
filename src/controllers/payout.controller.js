const payoutService = require("../services/silkpay.payout.service");
const logger = require("../utils/logger");

// ---------------------------------------------------------------------------
// createPayoutHandler
// ---------------------------------------------------------------------------

/**
 * Create a payout order.
 * POST /api/payout/create
 *
 * Body:
 *   amount      {string|number} required
 *   mOrderId    {string}        optional (auto-generated if omitted)
 *   bankNo      {string}        required
 *   ifsc        {string}        required
 *   name        {string}        required
 *   upi         {string}        optional
 *   notifyUrl   {string}        optional (overrides config default)
 */
const createPayoutHandler = async (req, res) => {
  try {
    const { amount, mOrderId, bankNo, ifsc, name, upi, notifyUrl } = req.body;

    if (!amount || !bankNo || !ifsc || !name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount, bankNo, ifsc, name",
      });
    }

    const response = await payoutService.createPayoutOrder({
      amount,
      mOrderId,
      bankNo,
      ifsc,
      name,
      upi: upi || "",
      notifyUrl,
    });

    return res.json({
      success: true,
      mOrderId: response.usedMOrderId,
      data: response,
    });
  } catch (error) {
    logger.logError("Payout:createPayoutHandler", error.message, error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// checkPayoutStatusHandler
// ---------------------------------------------------------------------------

/**
 * Query payout order status.
 * POST /api/payout/status
 *
 * Body:
 *   mOrderId  {string} required
 */
const checkPayoutStatusHandler = async (req, res) => {
  try {
    const { mOrderId } = req.body;

    if (!mOrderId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: mOrderId",
      });
    }

    const response = await payoutService.checkPayoutStatus(mOrderId);

    return res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.logError("Payout:checkPayoutStatusHandler", error.message, error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// payoutWebhookHandler
// ---------------------------------------------------------------------------

/**
 * Handle SilkPay payout callback.
 * POST /api/payout/webhook
 *
 * SilkPay rules:
 *  - Merchant MUST return exact plain-text "OK" with HTTP 200.
 *  - If response is not "OK", SilkPay retries every 5 minutes up to 5 times.
 *  - Verify signature before trusting payload.
 *  - Callback is sent ONLY for status 2 (Success) or 3 (Failed).
 */
const payoutWebhookHandler = async (req, res) => {
  try {
    const { mOrderId, status } = req.body;

    if (!mOrderId) {
      logger.error("Payout:Webhook", "Missing mOrderId in callback", req.body);
      return res.status(200).send("OK");
    }

    const result = payoutService.handlePayoutCallback(req.body);

    if (!result.verified) {
      logger.error("Payout:Webhook", "INVALID signature — callback rejected", { mOrderId });
      return res.status(200).send("OK");
    }

    if (status === 2) {
      logger.info("Payout:Webhook", "Payout SUCCESS", { mOrderId, payOrderId: result.payOrderId, utr: result.utr || "N/A" });
    } else if (status === 3) {
      logger.warn("Payout:Webhook", "Payout FAILED", { mOrderId });
    } else {
      logger.info("Payout:Webhook", `Payout status=${status} received`, { mOrderId });
    }

    return res.status(200).send("OK");
  } catch (error) {
    logger.logError("Payout:Webhook", "Unexpected error in payout webhook handler", error);
    return res.status(200).send("OK");
  }
};

// ---------------------------------------------------------------------------
// getMerchantBalanceHandler
// ---------------------------------------------------------------------------

/**
 * Get merchant wallet balance.
 * GET /api/payout/balance
 */
const getMerchantBalanceHandler = async (req, res) => {
  try {
    const response = await payoutService.getMerchantBalance();

    return res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.logError("Payout:getMerchantBalanceHandler", error.message, error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  createPayoutHandler,
  checkPayoutStatusHandler,
  payoutWebhookHandler,
  getMerchantBalanceHandler,
};
