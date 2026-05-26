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
    const recharge_id = order_id; // recharge_id = order_id (same value)
    const recharge_amount = parseFloat(amount);
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0];
    const recharge_status = "pending";

    const query = `
      INSERT INTO recharge (
        recharge_id, order_id, userId, user_mobile, recharge_amount,
        recharge_type, payment_mode, date, time, recharge_status, isDepAdded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      recharge_status,
      0
    ]);

    // Return ONLY paymentUrl
    return res.json({
      paymentUrl: paymentUrl,
    });
  } catch (error) {
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
 * Handle webhook callbacks
 */
const webhookHandler = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = silkpayService.verifyWebhookSignature(payload, signature);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid signature",
      });
    }

    const { event, data } = req.body;

    // Handle different webhook events
    switch (event) {
      case "payment.success":
        // Update order status in database
        break;
      case "payment.failed":
        // Handle failed payment
        break;
      case "payment.refunded":
        // Handle refund
        break;
      case "payment.cancelled":
        // Handle cancellation
        break;
      default:
        // Unknown event
    }

    // Always return 200 to acknowledge receipt
    res.json({
      success: true,
      message: "Webhook received",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
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
