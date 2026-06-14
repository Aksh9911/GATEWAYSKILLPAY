const payoutService = require("../services/silkpay.payout.service");
const logger = require("../utils/logger");
const db = require("../config/database");

// ---------------------------------------------------------------------------
// createPayoutHandler
// ---------------------------------------------------------------------------

/**
 * Create a payout order.
 * POST /api/payout/create
 *
 * Body:
 *   withdrawId  {number|string} required  - ID from withdrawl table
 *   amount      {string|number} required
 *   bankNo      {string}        required
 *   ifsc        {string}        required
 *   name        {string}        required
 *   mOrderId    {string}        optional (auto-generated if omitted)
 *   upi         {string}        optional
 *   notifyUrl   {string}        optional (overrides config default)
 *
 * Flow:
 *   1. Validate payload
 *   2. Call SilkPay payout API
 *   3. On success → UPDATE withdrawl SET morder_id = ? WHERE id = ?
 *   4. If DB update fails → log CRITICAL (payout is live, needs manual fix)
 */
const createPayoutHandler = async (req, res) => {
  try {
    const { withdrawId, amount, mOrderId, bankNo, ifsc, name, upi, notifyUrl } = req.body;

    if (!withdrawId || !amount || !bankNo || !ifsc || !name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: withdrawId, amount, bankNo, ifsc, name",
      });
    }

    logger.info("Payout:createPayoutHandler", "Initiating payout", { withdrawId, amount });

    // Step 1: Call SilkPay payout API first
    const response = await payoutService.createPayoutOrder({
      amount,
      mOrderId,
      bankNo,
      ifsc,
      name,
      upi: upi || "",
      notifyUrl,
    });

    const usedMOrderId = response.usedMOrderId;
    const payOrderId = response?.data?.payOrderId || null;

    logger.info("Payout:createPayoutHandler", "SilkPay payout created successfully", { withdrawId, usedMOrderId, payOrderId });

    // Step 2: Update withdrawl table with morder_id
    try {
      const [updateResult] = await db.execute(
        "UPDATE withdrawl SET morder_id = ? WHERE id = ?",
        [usedMOrderId, withdrawId]
      );

      if (updateResult.affectedRows === 0) {
        logger.warn("Payout:createPayoutHandler", "DB UPDATE matched 0 rows — withdrawId may not exist", { withdrawId, usedMOrderId });
      } else {
        logger.info("Payout:createPayoutHandler", "DB updated — morder_id saved to withdrawl table", { withdrawId, usedMOrderId });
      }
    } catch (dbErr) {
      logger.logError(
        "Payout:createPayoutHandler",
        `CRITICAL: Payout created at SilkPay but DB update failed — manual fix required | withdrawId=${withdrawId} | mOrderId=${usedMOrderId} | payOrderId=${payOrderId}`,
        dbErr
      );
    }

    return res.json({
      success: true,
      mOrderId: usedMOrderId,
      payOrderId,
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
