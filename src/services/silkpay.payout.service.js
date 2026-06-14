const axios = require("axios");
const crypto = require("crypto");
const config = require("../config/silkpay");
const logger = require("../utils/logger");

// ---------------------------------------------------------------------------
// Signature utilities (payout-specific formulas per SilkPay docs)
// ---------------------------------------------------------------------------

/**
 * Payout order signature: md5(mId + mOrderId + amount + timestamp + secret)
 * Also used for payout callback verification.
 */
const generatePayoutOrderSign = (mId, mOrderId, amount, timestamp, secretKey) => {
  const signString = `${mId}${mOrderId}${amount}${timestamp}${secretKey}`;
  const sign = crypto.createHash("md5").update(signString).digest("hex").toLowerCase();
  logger.logSign("Payout:generatePayoutOrderSign", signString, sign);
  return sign;
};

/**
 * Payout status query signature: md5(mId + mOrderId + timestamp + secret)
 */
const generatePayoutStatusSign = (mId, mOrderId, timestamp, secretKey) => {
  const signString = `${mId}${mOrderId}${timestamp}${secretKey}`;
  const sign = crypto.createHash("md5").update(signString).digest("hex").toLowerCase();
  logger.logSign("Payout:generatePayoutStatusSign", signString, sign);
  return sign;
};

/**
 * Merchant balance signature: md5(mId + timestamp + secret)
 */
const generateBalanceSign = (mId, timestamp, secretKey) => {
  const signString = `${mId}${timestamp}${secretKey}`;
  const sign = crypto.createHash("md5").update(signString).digest("hex").toLowerCase();
  logger.logSign("Payout:generateBalanceSign", signString, sign);
  return sign;
};

// ---------------------------------------------------------------------------
// Order counter (mirrors PayIn pattern — use DB sequence in production)
// ---------------------------------------------------------------------------

let payoutOrderCounter = 1;

// ---------------------------------------------------------------------------
// createPayoutOrder
// ---------------------------------------------------------------------------

/**
 * Create a payout order with SilkPay.
 * Endpoint: POST /transaction/payout
 * Sign: md5(mId + mOrderId + amount + timestamp + secret)
 *
 * @param {Object} payoutData
 * @param {string} payoutData.amount       - Payout amount
 * @param {string} [payoutData.mOrderId]    - Merchant order ID (auto-generated if omitted)
 * @param {string} payoutData.bankNo       - Beneficiary account number
 * @param {string} payoutData.ifsc         - Beneficiary IFSC code
 * @param {string} payoutData.name         - Beneficiary account holder name
 * @param {string} [payoutData.upi]        - Optional UPI ID
 * @param {string} [payoutData.notifyUrl]  - Override default payout notify URL
 * @returns {Promise<Object>}
 */
const createPayoutOrder = async (payoutData) => {
  const fnTag = "[SilkPay Payout][createPayoutOrder]";
  try {
    if (!config.merchantId || config.merchantId === "YOUR_MERCHANT_ID") {
      throw new Error("Merchant ID not configured. Please set SILKPAY_MERCHANT_ID in .env file");
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");  // HHMMSS
    const timestamp = now.getTime();
    const mId = config.merchantId;

    // Auto-generate mOrderId: SKILLPAY_YYYYMMDD_HHMMSS_XXX
    // Use caller-supplied mOrderId only if explicitly provided
    const orderNum = String(payoutOrderCounter).padStart(3, "0");
    const mOrderId = payoutData.mOrderId || `SKILLPAY_${dateStr}_${timeStr}_${orderNum}`;
    payoutOrderCounter++;

    const amount = String(payoutData.amount);
    const notifyUrl = payoutData.notifyUrl || config.payoutNotifyUrl;
    const upi = payoutData.upi || "";
    const bankNo = payoutData.bankNo;
    const ifsc = payoutData.ifsc;
    const name = payoutData.name;

    const sign = generatePayoutOrderSign(mId, mOrderId, amount, timestamp, config.secretKey);

    const payload = {
      amount,
      mId,
      mOrderId,
      timestamp,
      notifyUrl,
      upi,
      bankNo,
      ifsc,
      name,
      sign,
    };

    const url = `${config.baseURL}${config.payoutEndpoint}`;
    logger.logRequest("Payout:createPayoutOrder", url, payload);

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    logger.logResponse("Payout:createPayoutOrder", url, response.data);
    logger.info("Payout:createPayoutOrder", "Used mOrderId", { mOrderId });
    return {
      ...response.data,
      usedMOrderId: mOrderId,
    };
  } catch (error) {
    const errMsg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Failed to create payout order";
    logger.logError("Payout:createPayoutOrder", errMsg, error);
    throw new Error(errMsg);
  }
};

// ---------------------------------------------------------------------------
// checkPayoutStatus
// ---------------------------------------------------------------------------

/**
 * Query payout order status from SilkPay.
 * Endpoint: POST /transaction/payout/query
 * Sign: md5(mId + mOrderId + timestamp + secret)
 *
 * Status mapping:
 *   0 = Initial  |  1 = Processing  |  2 = Success  |  3 = Failed
 *
 * @param {string} mOrderId - Merchant order ID
 * @returns {Promise<Object>}
 */
const checkPayoutStatus = async (mOrderId) => {
  const fnTag = "[SilkPay Payout][checkPayoutStatus]";
  try {
    if (!mOrderId) {
      throw new Error("Missing required parameter: mOrderId");
    }

    const timestamp = Date.now();
    const mId = config.merchantId;

    const sign = generatePayoutStatusSign(mId, mOrderId, timestamp, config.secretKey);

    const payload = {
      mId,
      mOrderId,
      timestamp,
      sign,
    };

    const url = `${config.baseURL}${config.payoutStatusEndpoint}`;
    logger.logRequest("Payout:checkPayoutStatus", url, payload);

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    logger.logResponse("Payout:checkPayoutStatus", url, response.data);
    return response.data;
  } catch (error) {
    const errMsg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Failed to check payout status";
    logger.logError("Payout:checkPayoutStatus", errMsg, error);
    throw new Error(errMsg);
  }
};

// ---------------------------------------------------------------------------
// handlePayoutCallback
// ---------------------------------------------------------------------------

/**
 * Verify and process a SilkPay payout callback.
 * Sign verification: md5(mId + mOrderId + amount + timestamp + secret)
 * SilkPay status in callback: 2 = Success, 3 = Failed
 *
 * @param {Object} callbackData - Raw callback body from SilkPay
 * @returns {{ verified: boolean, status: number, mOrderId: string, payOrderId: string }}
 */
const handlePayoutCallback = (callbackData) => {
  const fnTag = "[SilkPay Payout][handlePayoutCallback]";

  logger.logWebhook("Payout:handlePayoutCallback", "/api/payout/webhook", callbackData);

  const { amount, payOrderId, mId, mOrderId, utr, sign: receivedSign, status, timestamp } = callbackData;

  // Calculate expected signature
  const calculatedSign = generatePayoutOrderSign(mId, mOrderId, amount, timestamp, config.secretKey);

  const verified = calculatedSign === receivedSign;
  logger.logSignVerify("Payout:handlePayoutCallback", receivedSign, calculatedSign, verified);

  if (!verified) {
    logger.error("Payout:handlePayoutCallback", "SECURITY WARNING: Signature mismatch", { mOrderId });
  }

  // Status label for logging
  const statusLabels = { 0: "Initial", 1: "Processing", 2: "Success", 3: "Failed" };
  logger.info("Payout:handlePayoutCallback", `Payout status=${status} (${statusLabels[status] || "Unknown"})`, { mOrderId, payOrderId, utr: utr || "N/A" });

  return {
    verified,
    status,
    mOrderId,
    payOrderId,
    utr: utr || null,
    amount,
  };
};

// ---------------------------------------------------------------------------
// getMerchantBalance
// ---------------------------------------------------------------------------

/**
 * Fetch merchant wallet balance from SilkPay.
 * Endpoint: POST /transaction/balance
 * Sign: md5(mId + timestamp + secret)
 *
 * @returns {Promise<Object>}
 */
const getMerchantBalance = async () => {
  const fnTag = "[SilkPay Payout][getMerchantBalance]";
  try {
    const timestamp = Date.now();
    const mId = config.merchantId;

    const sign = generateBalanceSign(mId, timestamp, config.secretKey);

    const payload = {
      mId,
      timestamp,
      sign,
    };

    const url = `${config.baseURL}${config.balanceEndpoint}`;
    logger.logRequest("Payout:getMerchantBalance", url, payload);

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    logger.logResponse("Payout:getMerchantBalance", url, response.data);
    return response.data;
  } catch (error) {
    const errMsg =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Failed to get merchant balance";
    logger.logError("Payout:getMerchantBalance", errMsg, error);
    throw new Error(errMsg);
  }
};

module.exports = {
  createPayoutOrder,
  checkPayoutStatus,
  handlePayoutCallback,
  getMerchantBalance,
  generatePayoutOrderSign,
  generatePayoutStatusSign,
  generateBalanceSign,
};
