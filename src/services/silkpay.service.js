const axios = require("axios");
const crypto = require("crypto");
const config = require("../config/silkpay");

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
      notifyUrl: paymentData.callbackUrl || paymentData.notifyUrl,
    };

    // Generate sign: md5(mId + mOrderId + amount + timestamp + secret)
    const signString = `${payload.mId}${payload.mOrderId}${payload.amount}${payload.timestamp}${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const url = `${config.baseURL}${config.createEndpoint}`;

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || "Failed to create payment";
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

    const notifyUrl = "http://localhost/silkpay";

    // Build payload
    const payload = {
      amount: String(amount),
      mId: config.merchantId,
      mOrderId: mOrderId,
      timestamp: timestamp,
      notifyUrl: notifyUrl,
    };

    // Generate sign: md5(mId + mOrderId + amount + timestamp + secret)
    const signString = `${payload.mId}${payload.mOrderId}${payload.amount}${payload.timestamp}${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const url = `${config.baseURL}${config.createEndpoint}`;

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

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
 * Get payment status
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} - Payment status response
 */
const getPaymentStatus = async (paymentId, merchantOrderId) => {
  try {
    const timestamp = Date.now();

    const payload = {
      mId: config.merchantId,
      timestamp: timestamp,
      ...(paymentId && { orderId: paymentId }),
      ...(merchantOrderId && { mOrderId: merchantOrderId }),
    };

    // Generate sign
    const params = Object.keys(payload).sort().map(key => `${key}=${payload[key]}`).join("&");
    const signString = `${params}&key=${config.secretKey}`;
    payload.sign = crypto.createHash("md5").update(signString).digest("hex");

    const response = await axios.post(
      `${config.baseURL}${config.statusEndpoint}`,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    return response.data;
  } catch (error) {
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

    const response = await axios.post(
      `${config.baseURL}${config.submitUtrEndpoint}`,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    return response.data;
  } catch (error) {
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

    const response = await axios.post(
      `${config.baseURL}${config.queryUtrEndpoint}`,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );

    return response.data;
  } catch (error) {
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
