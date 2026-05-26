# SilkPay Payment Gateway Integration Guide (Node.js)

## Overview

This document is prepared for implementing the SilkPay Payment Gateway in a Node.js application.

The original integration references provided were:

- Documentation: https://silkpay.stoplight.io/docs/silkpay/branches/main/30sk57lgvy7qx-guide
- Test API Base URL: https://api.dev.silkpay.ai
- Merchant Console: https://merchant.dev.silkpay.ai/#/dashboard

---

# Sandbox / Test Credentials

## Merchant Console Access

| Field | Value |
|---|---|
| Console URL | https://merchant.dev.silkpay.ai/#/dashboard |
| Username | TEST |
| Password | 123456 |

---

# API Environment

| Environment | Base URL |
|---|---|
| Sandbox / Test | https://api.dev.silkpay.ai |

---

# Secret / Encryption Information

```text
SIb3DQEBAQ
```

---

# Recommended Node.js Project Structure

```bash
silkpay-nodejs/
│
├── src/
│   ├── config/
│   │   └── silkpay.js
│   │
│   ├── services/
│   │   └── silkpay.service.js
│   │
│   ├── routes/
│   │   └── payment.routes.js
│   │
│   ├── controllers/
│   │   └── payment.controller.js
│   │
│   └── app.js
│
├── .env
├── package.json
└── README.md
```

---

# Required Environment Variables

Create a `.env` file:

```env
SILKPAY_BASE_URL=https://api.dev.silkpay.ai
SILKPAY_MERCHANT_ID=YOUR_MERCHANT_ID
SILKPAY_SECRET_KEY=YOUR_SECRET_KEY
SILKPAY_PUBLIC_KEY=YOUR_PUBLIC_KEY
SILKPAY_PRIVATE_KEY=YOUR_PRIVATE_KEY
PORT=3000
```

---

# Recommended Packages

Install dependencies:

```bash
npm install express axios dotenv crypto
```

Optional packages:

```bash
npm install cors helmet morgan
```

---

# Suggested SilkPay Configuration File

## File: `src/config/silkpay.js`

```js
require("dotenv").config();

module.exports = {
  baseURL: process.env.SILKPAY_BASE_URL,
  merchantId: process.env.SILKPAY_MERCHANT_ID,
  secretKey: process.env.SILKPAY_SECRET_KEY,
  publicKey: process.env.SILKPAY_PUBLIC_KEY,
  privateKey: process.env.SILKPAY_PRIVATE_KEY,
};
```

---

# Suggested Payment Service Structure

## File: `src/services/silkpay.service.js`

```js
const axios = require("axios");
const config = require("../config/silkpay");

const createPayment = async (payload) => {
  try {
    const response = await axios.post(
      `${config.baseURL}/YOUR_PAYMENT_ENDPOINT`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("SilkPay Error:", error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  createPayment,
};
```

---

# Suggested Express Route

## File: `src/routes/payment.routes.js`

```js
const express = require("express");
const router = express.Router();

const {
  createPaymentHandler,
} = require("../controllers/payment.controller");

router.post("/create-payment", createPaymentHandler);

module.exports = router;
```

---

# Suggested Controller

## File: `src/controllers/payment.controller.js`

```js
const silkpayService = require("../services/silkpay.service");

const createPaymentHandler = async (req, res) => {
  try {
    const response = await silkpayService.createPayment(req.body);

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

module.exports = {
  createPaymentHandler,
};
```

---

# Suggested Express App

## File: `src/app.js`

```js
require("dotenv").config();

const express = require("express");

const paymentRoutes = require("./routes/payment.routes");

const app = express();

app.use(express.json());

app.use("/api/payments", paymentRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

# Run the Application

```bash
node src/app.js
```

Or with nodemon:

```bash
npm install -D nodemon
npx nodemon src/app.js
```

---

# Implementation Steps for Windsurf Agent

## Step 1
Create a new Node.js Express application.

## Step 2
Install dependencies:
- express
- axios
- dotenv
- crypto

## Step 3
Create the project structure shown above.

## Step 4
Add SilkPay environment variables in `.env`.

## Step 5
Implement API authentication/signature generation according to the official SilkPay documentation.

## Step 6
Create payment APIs:
- Create Payment
- Verify Payment
- Refund Payment
- Payment Status

## Step 7
Add webhook handling endpoints.

## Step 8
Implement logging and error handling.

## Step 9
Test using SilkPay sandbox credentials.

---

# Important Notes

1. Use the official SilkPay documentation for exact API endpoints and request schemas.
2. Never expose secret keys in frontend code.
3. Store all credentials in environment variables.
4. Validate webhook signatures before accepting payment confirmations.
5. Use HTTPS in production.

---

# Official Documentation

https://silkpay.stoplight.io/docs/silkpay/branches/main/30sk57lgvy7qx-guide

---

# Final Goal

The Node.js application should support:

- Payment creation
- Payment verification
- Refunds
- Webhook callbacks
- Secure authentication
- Sandbox and production environments
