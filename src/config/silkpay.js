require("dotenv").config();

module.exports = {
  baseURL: process.env.SILKPAY_BASE_URL || "https://api.silkpay.ai",
  merchantId: process.env.SILKPAY_MERCHANT_ID,
  secretKey: process.env.SILKPAY_SECRET_KEY,
  publicKey: process.env.SILKPAY_PUBLIC_KEY,
  privateKey: process.env.SILKPAY_PRIVATE_KEY,  
  webhookSecret: process.env.WEBHOOK_SECRET,
  // API Endpoints (SilkPay actual endpoints)
  createEndpoint: process.env.SILKPAY_CREATE_ENDPOINT || "/transaction/payin/v2",
  statusEndpoint: process.env.SILKPAY_STATUS_ENDPOINT || "/transaction/payin/query",
  submitUtrEndpoint: process.env.SILKPAY_SUBMIT_UTR_ENDPOINT || "/transaction/payin/submit/utr",
  queryUtrEndpoint: process.env.SILKPAY_QUERY_UTR_ENDPOINT || "/transaction/payin/query/utr",
  callbackEndpoint: process.env.SILKPAY_CALLBACK_ENDPOINT || "/callback",
  // Notify URL for SilkPay callbacks
  notifyUrl: process.env.NOTIFY_URL || "https://skillpay.rollix777.com/api/payment/webhook",
  returnUrl: process.env.RETURN_URL || "https://r7dream.com/",
  // Payout API Endpoints
  payoutEndpoint: process.env.SILKPAY_PAYOUT_ENDPOINT || "/transaction/payout",
  payoutStatusEndpoint: process.env.SILKPAY_PAYOUT_STATUS_ENDPOINT || "/transaction/payout/query",
  balanceEndpoint: process.env.SILKPAY_BALANCE_ENDPOINT || "/transaction/balance",
  // Payout Notify URL
  payoutNotifyUrl: process.env.PAYOUT_NOTIFY_URL || "https://skillpay.rollix777.com/api/payout/webhook",
};
