const axios = require("axios");
const crypto = require("crypto");
const config = require("../config/silkpay");
const db = require("../config/database");
const logger = require("../utils/logger");

/**
 * Generate authentication signature for SilkPay API
 * @param {Object} payload - Request payload
 * @param {string} timestamp - Unix timestamp
 * @returns {string} - Generated signature
 */
const generateSignature = (payload, timestamp) => {
  const dataToSign = `${config.merchantId}:${timestamp}:${JSON.stringify(payload)}`;
  return crypto
    .createHmac("sha256", config.secretKey)
    .update(dataToSign)
    .digest("hex");
};

/**
 * Get request headers with authentication
 * @param {Object} payload - Request payload
 * @returns {Object} - Headers object
 */
const getHeaders = (payload = {}) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(payload, timestamp);

  return {
    "Content-Type": "application/json",
    "X-Merchant-Id": config.merchantId,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
};

/**
 * Create a new payment
 * @param {Object} paymentData - Payment details
 * @returns {Promise<Object>} - Payment response
 */
// Simple order counter (in production, use database)
let orderCounter = 1;

const createPayment = async (paymentData) => {
  try {
    // Check if merchantId is configured
    if (!config.merchantId || config.merchantId === "YOUR_MERCHANT_ID") {
      throw new Error("Merchant ID not configured. Please set SILKPAY_MERCHANT_ID in .env file");
    }

    const timestamp = Date.now();

    // Build payload in SilkPay format
    const payload = {
      mId: config.merchantId,
      mOrderId: paymentData.orderId || paymentData.mOrderId,
      amount: String(paymentData.amount),
      timestamp: timestamp,
      notifyUrl: paymentData.callbackUrl || paymentData.notifyUrl || config.notifyUrl,
      returnUrl: paymentData.returnUrl || config.returnUrl,
    };

    // Generate sign: md5(mId + mOrderId + amount + timestamp + secret)
    const signString = `${payload.mId}${payload.mOrderId}${payload.amount}${payload.timestamp}${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const url = `${config.baseURL}${config.createEndpoint}`;
    logger.logSign("PayIn:createPayment", signString, payload.sign);
    logger.logRequest("PayIn:createPayment", url, payload);

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

    logger.logResponse("PayIn:createPayment", url, response.data);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || "Failed to create payment";
    logger.logError("PayIn:createPayment", errorMessage, error);
    throw new Error(errorMessage);
  }
};

/**
 * Create user order with auto-generated params
 * Sign: md5(mId + mOrderId + amount + timestamp + secret)
 * @param {string} amount - Order amount
 * @returns {Promise<Object>} - SilkPay response
 */
const createUserOrder = async (amount) => {
  try {
    // Check if merchantId is configured
    if (!config.merchantId || config.merchantId === "YOUR_MERCHANT_ID") {
      throw new Error("Merchant ID not configured. Please set SILKPAY_MERCHANT_ID in .env file");
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ""); // HHMMSS
    const timestamp = now.getTime();

    // Generate mOrderId: SKILL_DATE_TIME_XXX
    const orderNum = String(orderCounter).padStart(3, "0");
    const mOrderId = `SKILL_${dateStr}_${timeStr}_${orderNum}`;
    orderCounter++; // Increment for next order

    const notifyUrl = config.notifyUrl;

    // Build payload
    const payload = {
      amount: String(amount),
      mId: config.merchantId,
      mOrderId: mOrderId,
      timestamp: timestamp,
      notifyUrl: notifyUrl,
      returnUrl: config.returnUrl,
    };

    // Generate sign: md5(mId + mOrderId + amount + timestamp + secret)
    const signString = `${payload.mId}${payload.mOrderId}${payload.amount}${payload.timestamp}${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const url = `${config.baseURL}${config.createEndpoint}`;
    logger.logSign("PayIn:createUserOrder", signString, payload.sign);
    logger.logRequest("PayIn:createUserOrder", url, payload);

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    logger.logResponse("PayIn:createUserOrder", url, response.data);
    return {
      silkpayResponse: response.data,
      orderDetails: {
        mOrderId: payload.mOrderId,
        amount: payload.amount,
        timestamp: payload.timestamp,
        sign: payload.sign,
      }
    };
  } catch (error) {
    const errorMessage = error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || "Failed to create user order";
    logger.logError("PayIn:createUserOrder", errorMessage, error);
    throw new Error(errorMessage);
  }
};

/**
 * Verify a payment status
 * @param {string} paymentId - Payment ID to verify
 * @returns {Promise<Object>} - Payment verification response
 */
const verifyPayment = async (paymentId) => {
  try {
    return await getPaymentStatus(paymentId);
  } catch (error) {
    throw new Error(error.response?.data?.message || "Failed to verify payment");
  }
};

/**
 * Get payment status (SilkPay query endpoint)
 * Endpoint: POST /transaction/payin/query
 * Payload: { mId, mOrderId, timestamp, sign }
 * Sign: md5(mId + mOrderId + timestamp + key) - 32-bit lowercase
 * Timestamp is fetched from recharge table based on mOrderId
 * @param {string} paymentId - Payment ID (optional)
 * @param {string} merchantOrderId - Merchant order ID (required)
 * @returns {Promise<Object>} - Payment status response
 */
const getPaymentStatus = async (paymentId, merchantOrderId) => {
  try {
    const mOrderId = merchantOrderId || paymentId;

    if (!mOrderId) {
      throw new Error("Missing required parameter: merchantOrderId or paymentId");
    }

    // Fetch silkpay_timestamp from recharge table using mOrderId
    const [rows] = await db.execute(
      "SELECT silkpay_timestamp FROM recharge WHERE order_id = ? LIMIT 1",
      [mOrderId]
    );

    let timestamp;
    if (rows.length > 0 && rows[0].silkpay_timestamp) {
      // Use the original SilkPay timestamp stored during order creation
      timestamp = rows[0].silkpay_timestamp;
    } else {
      // Fallback to current timestamp if not found (old orders without the column)
      timestamp = Date.now();
    }

    // Build payload in exact SilkPay format
    const payload = {
      mId: config.merchantId,
      mOrderId: mOrderId,
      timestamp: timestamp,
    };

    // Generate sign: md5(mId + mOrderId + timestamp + key) - exact order, 32-bit lowercase
    const signString = `${payload.mId}${payload.mOrderId}${payload.timestamp}${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const statusUrl = `${config.baseURL}${config.statusEndpoint}`;
    logger.logSign("PayIn:getPaymentStatus", signString, payload.sign);
    logger.logRequest("PayIn:getPaymentStatus", statusUrl, payload);

    const response = await axios.post(
      statusUrl,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    logger.logResponse("PayIn:getPaymentStatus", statusUrl, response.data);
    return response.data;
  } catch (error) {
    logger.logError("PayIn:getPaymentStatus", error.message || "Failed to get payment status", error);
    throw new Error(error.response?.data?.message || "Failed to get payment status");
  }
};

/**
 * Process a refund
 * @param {string} paymentId - Original payment ID
 * @param {number} amount - Refund amount (optional - partial refund)
 * @param {string} reason - Refund reason
 * @returns {Promise<Object>} - Refund response
 */
const submitUtr = async (paymentId, utrNumber, merchantOrderId) => {
  try {
    const timestamp = Date.now();

    const payload = {
      mId: config.merchantId,
      utrNumber,
      timestamp: timestamp,
      ...(paymentId && { orderId: paymentId }),
      ...(merchantOrderId && { mOrderId: merchantOrderId }),
    };

    // Generate sign
    const params = Object.keys(payload).sort().map(key => `${key}=${payload[key]}`).join("&");
    const signString = `${params}&key=${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const submitUrl = `${config.baseURL}${config.submitUtrEndpoint}`;
    logger.logSign("PayIn:submitUtr", signString, payload.sign);
    logger.logRequest("PayIn:submitUtr", submitUrl, payload);

    const response = await axios.post(
      submitUrl,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    logger.logResponse("PayIn:submitUtr", submitUrl, response.data);
    return response.data;
  } catch (error) {
    logger.logError("PayIn:submitUtr", error.message || "Failed to submit UTR", error);
    throw new Error(error.response?.data?.message || "Failed to submit UTR");
  }
};

/**
 * Get all payments (with optional filters)
 * @param {Object} filters - Optional filters (page, limit, status, from, to)
 * @returns {Promise<Object>} - List of payments
 */
const queryUtr = async (utrNumber) => {
  try {
    const timestamp = Date.now();

    const payload = {
      mId: config.merchantId,
      utrNumber,
      timestamp: timestamp,
    };

    // Generate sign
    const params = Object.keys(payload).sort().map(key => `${key}=${payload[key]}`).join("&");
    const signString = `${params}&key=${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const queryUtrUrl = `${config.baseURL}${config.queryUtrEndpoint}`;
    logger.logSign("PayIn:queryUtr", signString, payload.sign);
    logger.logRequest("PayIn:queryUtr", queryUtrUrl, payload);

    const response = await axios.post(
      queryUtrUrl,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    logger.logResponse("PayIn:queryUtr", queryUtrUrl, response.data);
    return response.data;
  } catch (error) {
    logger.logError("PayIn:queryUtr", error.message || "Failed to query UTR", error);
    throw new Error(error.response?.data?.message || "Failed to query UTR");
  }
};

/**
 * Cancel a pending payment
 * @param {string} paymentId - Payment ID to cancel
 * @returns {Promise<Object>} - Cancellation response
 */
const handleCallback = async (callbackData) => {
  try {
    // This is for outgoing callback to SilkPay if needed
    const payload = {
      merchantId: config.merchantId,
      ...callbackData,
    };

    const response = await axios.post(
      `${config.baseURL}${config.callbackEndpoint}`,
      payload,
      { headers: getHeaders(payload), timeout: 10000 }
    );

    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || "Failed to process callback");
  }
};

/**
 * Verify webhook signature
 * @param {string} payload - Raw webhook payload
 * @param {string} signature - Signature from header
 * @returns {boolean} - Whether signature is valid
 */
const verifyWebhookSignature = (payload, signature) => {
  if (!config.webhookSecret) {
    return true;
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
};

module.exports = {
  createPayment,
  createUserOrder,
  verifyPayment,
  getPaymentStatus,
  submitUtr,
  queryUtr,
  handleCallback,
  verifyWebhookSignature,
  generateSignature,
};
