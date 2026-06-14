const axios = require("axios");
const silkpayService = require("../services/silkpay.service");
const db = require("../config/database");
const crypto = require("crypto");
const config = require("../config/silkpay");
const logger = require("../utils/logger");

/**
 * Create a new payment (SilkPay format)
 */
const createPaymentHandler = async (req, res) => {
  try {
    const {
      orderId,
      mOrderId,
      amount,
      notifyUrl,
      callbackUrl,
    } = req.body;

    // Validate required fields (SilkPay format)
    const finalOrderId = orderId || mOrderId;
    const finalNotifyUrl = notifyUrl || callbackUrl;

    if (!finalOrderId || !amount || !finalNotifyUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: orderId (or mOrderId), amount, notifyUrl (or callbackUrl)",
      });
    }

    const response = await silkpayService.createPayment({
      orderId: finalOrderId,
      amount,
      notifyUrl: finalNotifyUrl,
    });

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Create order for user app (auto-generates params)
 * Accepts: amount, userId, user_mobile, recharge_type, payment_mode
 * Auto-generates: mOrderId (SKILL_DATE_TIME_XXX format), timestamp, sign
 * Inserts record into recharge table on success
 * Returns: Only paymentUrl
 */
const createUserOrderHandler = async (req, res) => {
  try {
    const { amount, userId, user_mobile, recharge_type, payment_mode } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: amount",
      });
    }

    const response = await silkpayService.createUserOrder(amount);

    // Extract only paymentUrl from SilkPay response
    const paymentUrl = response?.silkpayResponse?.data?.paymentUrl;

    if (!paymentUrl) {
      return res.status(500).json({
        success: false,
        error: "Failed to get payment URL from SilkPay",
      });
    }

    // Insert into recharge table
    const orderDetails = response?.orderDetails;
    const order_id = orderDetails?.mOrderId;
    const silkpayTimestamp = orderDetails?.timestamp; // Store original timestamp
    const recharge_id = order_id; // recharge_id = order_id (same value)
    const recharge_amount = parseFloat(amount);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const recharge_status = "pending";

    const query = `
      INSERT INTO recharge (
        recharge_id, order_id, userId, user_mobile, recharge_amount,
        recharge_type, payment_mode, date, time, silkpay_timestamp, recharge_status, isDepAdded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.execute(query, [
      recharge_id,
      order_id,
      userId || 0,
      user_mobile || "",
      recharge_amount,
      recharge_type || "silkpay",
      "skillpay", // Fixed payment_mode for this endpoint
      date,
      time,
      silkpayTimestamp || Date.now(), // Store original SilkPay timestamp (fallback to now if undefined)
      recharge_status,
      0
    ]);

    // Return ONLY paymentUrl
    return res.json({
      paymentUrl: paymentUrl,
    });
  } catch (error) {
    logger.logError("PayIn:createUserOrderHandler", error.message, error);
    logger.error("PayIn:createUserOrderHandler", "SQL Error: " + (error.sqlMessage || "N/A"));
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Verify payment status
 */
const verifyPaymentHandler = async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: paymentId",
      });
    }

    const response = await silkpayService.verifyPayment(paymentId);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get payment status (SilkPay query endpoint)
 */
const getPaymentStatusHandler = async (req, res) => {
  try {
    const { paymentId, merchantOrderId } = req.body;

    if (!paymentId && !merchantOrderId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: paymentId or merchantOrderId",
      });
    }

    const response = await silkpayService.getPaymentStatus(paymentId, merchantOrderId);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Submit UTR number for payment
 */
const submitUtrHandler = async (req, res) => {
  try {
    const { paymentId, merchantOrderId, utrNumber } = req.body;

    if (!utrNumber) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: utrNumber",
      });
    }

    if (!paymentId && !merchantOrderId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: paymentId or merchantOrderId",
      });
    }

    const response = await silkpayService.submitUtr(paymentId, utrNumber, merchantOrderId);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Query UTR status
 */
const queryUtrHandler = async (req, res) => {
  try {
    const { utrNumber } = req.body;

    if (!utrNumber) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: utrNumber",
      });
    }

    const response = await silkpayService.queryUtr(utrNumber);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};


/**
 * Handle SilkPay webhook callbacks
 * Endpoint: POST /api/payment/webhook
 * Notify URL: https://skillpay.rollix777.com/api/payment/webhook
 *
 * IMPORTANT: SilkPay callback rules:
 * 1. SilkPay sends callback ONLY for SUCCESS payments (no callback for failed/pending)
 * 2. Merchant MUST return exact string "OK" with HTTP 200
 * 3. If response is not "OK", SilkPay retries every 5 minutes up to 5 times
 * 4. Merchant MUST verify sign consistency before trusting callback
 * 5. Implement duplicate callback protection (idempotency) - same mOrderId may be sent multiple times
 */
const webhookHandler = async (req, res) => {
  try {
    logger.logWebhook("PayIn:Webhook", "/api/payment/webhook", req.body);

    // Extract only what we need: mOrderId and status
    const { mOrderId, status } = req.body;
    logger.info("PayIn:Webhook", "Extracted fields", { mOrderId, status });

    // Validate required fields
    if (!mOrderId) {
      logger.error("PayIn:Webhook", "Missing mOrderId in callback payload", req.body);
      return res.status(200).send("OK");
    }

    // Only process when status === 1 (success)
    if (status !== 1) {
      logger.info("PayIn:Webhook", `Status=${status} (not 1), ignoring`, { mOrderId });
      return res.status(200).send("OK");
    }

    logger.info("PayIn:Webhook", "Payment SUCCESS (status=1)", { mOrderId });

    // Atomic update — AND isDepAdded = 0 prevents duplicate processing
    const [updateResult] = await db.execute(
      "UPDATE recharge SET recharge_status = 'success', isDepAdded = 1 WHERE order_id = ? AND isDepAdded = 0",
      [mOrderId]
    );

    if (updateResult.affectedRows === 0) {
      logger.warn("PayIn:Webhook", "Already processed, skipping", { mOrderId });
      return res.status(200).send("OK");
    }

    logger.info("PayIn:Webhook", "DB updated — order marked completed", { mOrderId });

    // Call platform APIs: deposit record + wallet balance update
    try {
      const [rechargeRow] = await db.execute(
        "SELECT userId, recharge_amount FROM recharge WHERE order_id = ? LIMIT 1",
        [mOrderId]
      );

      if (rechargeRow.length === 0) {
        logger.error("PayIn:Webhook", "No recharge row found", { mOrderId });
        return res.status(200).send("OK");
      }

      const userId = rechargeRow[0].userId;
      const rechargeAmount = parseFloat(rechargeRow[0].recharge_amount);
      const platformBaseURL = process.env.PLATFORM_BASE_URL || "https://api.rollix777.com";

      // Step 1: Create deposit record
      const depositRes = await axios.post(
        `${platformBaseURL}/api/user/deposit`,
        { userId, amount: rechargeAmount, cryptoname: "INR", orderid: mOrderId },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      logger.logResponse("PayIn:Webhook:DepositAPI", `${platformBaseURL}/api/user/deposit`, depositRes.data);

      // Step 2: Update wallet balance (with 10% bonus)
      const bonusAmount = rechargeAmount * 1.10;
      const walletRes = await axios.put(
        `${platformBaseURL}/api/user/wallet/balance`,
        { userId, cryptoname: "INR", balance: bonusAmount },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );
      logger.logResponse("PayIn:Webhook:WalletAPI", `${platformBaseURL}/api/user/wallet/balance`, walletRes.data);
      logger.info("PayIn:Webhook", "Bonus applied", { original: rechargeAmount, bonus: bonusAmount });

      logger.info("PayIn:Webhook", "Payment fully processed", { mOrderId });
    } catch (platformErr) {
      logger.logError("PayIn:Webhook", `CRITICAL: Platform API failed for order ${mOrderId} — manual intervention required`, platformErr);
    }

    return res.status(200).send("OK");
  } catch (error) {
    logger.logError("PayIn:Webhook", "Unexpected error in webhook handler", error);
    return res.status(200).send("OK");
  }
};

module.exports = {
  createPaymentHandler,
  createUserOrderHandler,
  verifyPaymentHandler,
  getPaymentStatusHandler,
  submitUtrHandler,
  queryUtrHandler,
  webhookHandler,
};
