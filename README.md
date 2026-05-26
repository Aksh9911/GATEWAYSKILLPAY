# SilkPay Payment Gateway Integration (Node.js)

A complete Node.js Express implementation of the SilkPay Payment Gateway with all essential APIs and webhook handling.

## Features

- **Payment Creation** - Create new payments with customer details
- **Payment Verification** - Verify payment status
- **Payment Status Check** - Get real-time payment status
- **Refund Processing** - Full and partial refunds
- **Payment Cancellation** - Cancel pending payments
- **Webhook Handling** - Secure webhook signature verification
- **Authentication** - HMAC-SHA256 signature generation

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit `.env` file with your SilkPay credentials:

```env
SILKPAY_BASE_URL=https://api.dev.silkpay.ai
SILKPAY_MERCHANT_ID=YOUR_MERCHANT_ID
SILKPAY_SECRET_KEY=YOUR_SECRET_KEY
SILKPAY_PUBLIC_KEY=YOUR_PUBLIC_KEY
SILKPAY_PRIVATE_KEY=YOUR_PRIVATE_KEY
PORT=3000
WEBHOOK_SECRET=your_webhook_secret_here
```

### 3. Start the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## API Endpoints

### Create Payment (Payin v2)
```bash
POST /api/payments/create
Content-Type: application/json

{
  "orderId": "DEP_001_20240526_001",
  "amount": 250.00,
  "currency": "INR",
  "description": "Wallet Deposit - User #12345",
  "customerEmail": "user@example.com",
  "customerName": "John Smith",
  "callbackUrl": "https://yourdomain.com/api/payments/webhook",
  "returnUrl": "https://yourdomain.com/deposit/success"
}
```

### Query Payment Status
```bash
POST /api/payments/status
Content-Type: application/json

{
  "paymentId": "pay_xxx",
  "merchantOrderId": "DEP_001_20240526_001"
}
```

### Submit UTR
```bash
POST /api/payments/submit-utr
Content-Type: application/json

{
  "paymentId": "pay_xxx",
  "merchantOrderId": "DEP_001_20240526_001",
  "utrNumber": "UTR123456789"
}
```

### Query UTR
```bash
POST /api/payments/query-utr
Content-Type: application/json

{
  "utrNumber": "UTR123456789"
}
```

### Webhook Endpoint
```bash
POST /api/payments/webhook
X-Webhook-Signature: <signature>

{
  "event": "payment.success",
  "data": { "paymentId": "pay_xxx", "status": "completed" }
}
```

## Project Structure

```
silkpay-nodejs/
├── src/
│   ├── config/
│   │   └── silkpay.js          # Configuration
│   ├── services/
│   │   └── silkpay.service.js  # API integration
│   ├── controllers/
│   │   └── payment.controller.js # Request handlers
│   ├── routes/
│   │   └── payment.routes.js   # Route definitions
│   └── app.js                  # Express app entry
├── .env                         # Environment variables
├── package.json                 # Dependencies
└── README.md                    # Documentation
```

## Authentication

The service uses HMAC-SHA256 signature authentication:

1. Timestamp is included in every request header (`X-Timestamp`)
2. Signature is generated using: `HMAC-SHA256(merchantId:timestamp:payload)`
3. Signature is sent in `X-Signature` header
4. Merchant ID is sent in `X-Merchant-Id` header

## Webhook Events

Supported webhook events:
- `payment.success` - Payment completed successfully
- `payment.failed` - Payment failed
- `payment.refunded` - Payment refunded
- `payment.cancelled` - Payment cancelled

## Sandbox Credentials

| Field | Value |
|-------|-------|
| Console URL | https://merchant.dev.silkpay.ai/#/dashboard |
| Username | TEST |
| Password | 123456 |
| API Base URL | https://api.dev.silkpay.ai |

## Documentation

- [SilkPay API Docs](https://silkpay.stoplight.io/docs/silkpay/branches/main/30sk57lgvy7qx-guide)

## License

MIT
