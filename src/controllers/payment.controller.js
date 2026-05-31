const silkpayService = require("../services/silkpay.service");
const db = require("../config/database");

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
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0];
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
    console.error("[createUserOrderHandler] Error:", error.message);
    console.error("[createUserOrderHandler] SQL Error:", error.sqlMessage || "N/A");
    console.error("[createUserOrderHandler] Stack:", error.stack);
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
    // Log complete request body for debugging
    console.log("[SilkPay Webhook] Received callback:", JSON.stringify(req.body, null, 2));

    // Extract SilkPay callback fields
    const {
      mOrderId,    // Merchant order ID (same as recharge_id in DB)
      tradeNo,     // SilkPay transaction ID
      amount,      // Payment amount
      status,      // Should be "SUCCESS" for successful payments
      sign,        // Signature for verification
    } = req.body;

    // Log extracted fields
    console.log("[SilkPay Webhook] Extracted fields:", {
      mOrderId,
      tradeNo,
      amount,
      status,
      sign,
    });

    // TODO: Verify signature before processing
    // SilkPay sign format: md5(mId + mOrderId + amount + timestamp + secret)
    // const expectedSign = crypto.createHash("md5").update(mId + mOrderId + amount + timestamp + secretKey).digest("hex");
    // if (sign !== expectedSign) {
    //   console.error("[SilkPay Webhook] Invalid signature");
    //   return res.status(200).send("OK"); // Still return OK to stop retries, but don't process
    // }

    // SilkPay only sends callbacks for SUCCESS payments
    // But we check status anyway for safety
    if (status === "SUCCESS" || status === "success") {
      console.log("[SilkPay Webhook] Payment SUCCESS confirmed for order:", mOrderId, "Trade:", tradeNo);

      // TODO: Implement duplicate callback protection
      // Check if this mOrderId has already been processed (isDepAdded = 1)
      // const [existing] = await db.execute("SELECT isDepAdded FROM recharge WHERE order_id = ?", [mOrderId]);
      // if (existing.length > 0 && existing[0].isDepAdded === 1) {
      //   console.log("[SilkPay Webhook] Duplicate callback, already processed:", mOrderId);
      //   return res.status(200).send("OK");
      // }

      // TODO: Update database - mark payment as completed
      // Update recharge_status to "completed" and set trade_no
      // await db.execute(
      //   "UPDATE recharge SET recharge_status = ?, trade_no = ?, isDepAdded = 1 WHERE order_id = ?",
      //   ["completed", tradeNo, mOrderId]
      // );

      // TODO: Add user balance/wallet update logic here
      // await updateUserBalance(mOrderId, amount);

      console.log("[SilkPay Webhook] Payment processed successfully:", mOrderId);
    } else {
      // This should not happen as SilkPay only sends SUCCESS callbacks
      console.log("[SilkPay Webhook] Unexpected status:", status, "for order:", mOrderId);
    }

    // CRITICAL: Must return exact string "OK" with HTTP 200
    // Any other response will trigger SilkPay retry (every 5 min, up to 5 times)
    return res.status(200).send("OK");
  } catch (error) {
    console.error("[SilkPay Webhook] Error processing callback:", error.message);

    // Even on error, return "OK" to stop SilkPay retries
    // Log the error internally but acknowledge receipt
    // If you return FAIL, SilkPay will retry 5 times (every 5 minutes)
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
