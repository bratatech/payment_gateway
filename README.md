Cashfree Payments Integration

A complete end-to-end payment and refund management system built using Node.js, Express, PostgreSQL, and Cashfree.
This project supports:

Invoice lookup via email

Payment initiation and Cashfree order creation

Secure webhook signature verification (HMAC SHA256)

Automatic payment status update

Automated invoice marking (PAID / REFUNDED)

Refund initiation + refund webhook processing

Designed for real-world production deployments, with secure raw-body handling and fallback mechanisms for inconsistent Cashfree API responses.

🚀 Features
✅ Invoice Management

Fetch invoices by user email

Display invoice details and payment link

✅ Payment Flow

Create Cashfree Orders

Save order_id and cf_order_id to PostgreSQL

Redirect to Cashfree checkout

✅ Webhook Verification

Uses express.raw() for raw body access

Validates signature using HMAC SHA256

Handles both test and live webhooks

Fallback logic for inconsistent event fields

✅ Refund Flow

Trigger refunds through Cashfree API

Process refund webhooks

Update invoice and payment tables accordingly

🔒 Security

Timing-safe comparison of signatures

Environment-variable-based secrets

Strict payload verification

🏗️ Tech Stack
Layer	Technology
Backend	Node.js, Express
Database	PostgreSQL
Payment Gateway	Cashfree PG API
Auth / Security	HMAC-SHA256 Webhook Verification
# Payment Gateway (Cashfree)

End-to-end sample to create invoices, accept payments via Cashfree PG, verify via API/webhooks, and manage refunds.

- Backend: Express + PostgreSQL
- Frontend: React (Vite)
- Cashfree SDK: @cashfreepayments/cashfree-js

---

## Project Structure

```
payment_gateway/
├─ backend/
│  ├─ server.js
│  ├─ package.json
│  └─ .env (not committed)
└─ frontend/
   ├─ src/
   │  ├─ App.jsx
   │  └─ pages/
   │     ├─ Home.jsx
   │     ├─ invoice.jsx           # Create Invoice
   │     ├─ ViewInvoice.jsx       # View/Pay/Refund Invoices
   │     └─ PaymentSuccess.jsx    # Post-payment landing
   ├─ .env.example
   └─ package.json
```

---

## Quick Start

- Backend
  - **Prereq**: PostgreSQL database and URL
  - Install & run:
    - `npm install` (in `backend`)
    - Copy required env (see "Environment") into `backend/.env`
    - `npm start`
  - Server listens on `PORT` (default 5000) and exposes REST API routes under `/api/*`.

- Frontend
  - Install & run:
    - `npm install` (in `frontend`)
    - Create `frontend/.env` from `.env.example`
    - `npm run dev` (Vite, default http://localhost:5173)

- Make sure backend CORS `FRONTEND_URL` matches your frontend URL before testing (see Environment).

---

## Environment

Back end (`backend/.env`):
- `PORT` (optional) — default `5000`
- `DATABASE_URL` — Postgres connection string (SSL enabled by code)
- `FRONTEND_URL` — e.g. `http://localhost:5173` (used by CORS & return_url base)
- `CASHFREE_APP_ID` — from Cashfree dashboard
- `CASHFREE_SECRET` — from Cashfree dashboard
- `CASHFREE_ENV` — `sandbox` or `production`
- `CASHFREE_WEBHOOK_SECRET` (optional) — if set on Cashfree; falls back to `CASHFREE_SECRET` for signature verification

Front end (`frontend/.env`):
- `VITE_API_BASE_URL` — base URL of backend, e.g. `http://localhost:5000`

Note: In `ViewInvoice.jsx` and `PaymentSuccess.jsx` there are hard-coded production URLs. For local/dev or self-hosted deployments, change:
- `API_BASE` to your backend URL
- `FRONTEND_BASE` to your frontend URL

---

## Database Schema (minimal)

Use/adjust these SQLs to create required tables.

```sql
-- invoices
CREATE TABLE IF NOT EXISTS invoices (
  invoice_number VARCHAR(128) PRIMARY KEY,
  date DATE,
  due_date DATE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  client_address TEXT,
  items JSONB NOT NULL,
  tax_rate NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  status TEXT NOT NULL,
  payment_id TEXT
);

-- payments
CREATE TABLE IF NOT EXISTS payments (
  order_id VARCHAR(128) PRIMARY KEY,
  cf_order_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  payment_session_id TEXT,
  status TEXT NOT NULL
);
```

---



- **Invoices**
  - `POST /api/invoices`
    - Body: `{ invoiceNumber, date, dueDate, clientName, clientEmail, clientPhone, clientAddress, items: [], taxRate, subtotal, tax, total, status }`
    - Creates an invoice row; returns the inserted invoice
  - `GET /api/invoices/:email`
    - Returns all invoices for `client_email`
  - `PUT /api/invoices/:id`
    - `:id` is `invoice_number`
    - Body: `{ status, paymentId }`
    - Updates invoice (used after payment success/verification)

- **Cashfree Order + Verification**
  - `POST /api/create-order`
    - Body: `{ amount, currency, invoiceNumber, clientName, clientEmail, clientPhone }`
    - Creates Cashfree order; inserts into `payments` and returns `{ cf_order_id, order_id, payment_session_id, env }`
  - `POST /api/verify-payment`
    - Body: `{ order_id }`
    - Fetches status from Cashfree (`order_status`), updates `payments.status`
    - If `PAID`, also updates `invoices` status to `PAID` and sets `payment_id`

- **Payments**
  - `GET /api/payments/:order_id`
    - Returns a single payment row

- **Refunds**
  - `POST /api/refund`
    - Body options:
      - `{ order_id, amount }` or `{ invoice_number, amount }`
      - If `amount` omitted, server will best-effort resolve from DB
    - Initiates refund via Cashfree and sets `payments.status=REFUND_INITIATED` and `invoices.status=REFUND_INITIATING`
    - Final status is updated by webhook (see below)

- **Webhooks (Cashfree)**
  - `POST /api/webhook/cashfree` (alias `POST /api/cashfree/webhook`)
    - Expects `Content-Type: application/json`
    - Signature header: `x-webhook-signature` (or `x-cf-signature`), `x-webhook-timestamp` (or `x-cf-timestamp`)
    - Verifies HMAC-SHA256 over `timestamp + rawBody` with `CASHFREE_WEBHOOK_SECRET` (fallback `CASHFREE_SECRET`)
    - On `PAID`/`SUCCESS`, marks invoice `PAID`
    - On refund events, maps statuses to:
      - `SUCCESS` → `REFUNDED`
      - `FAILED`/`CANCELLED` → `REFUND_FAILED`

---

## Frontend Routes (React)

- `/` → `Home` (links to Create Invoice, View Invoice)
- `/invoice` → `Invoice` (Create invoice; POST `/api/invoices`)
- `/invoice-view` → `ViewInvoice`
  - Search by email (`GET /api/invoices/:email`)
  - Pay Now → `POST /api/create-order` → Cashfree Checkout → redirect to `/payment-success?order_id=...`
  - Refund → `POST /api/refund` → UI polls invoice list until `REFUNDED`/`REFUND_FAILED`
- `/payment-success` → `PaymentSuccess`
  - Reads `order_id` from query
  - `POST /api/verify-payment`, then optionally `PUT /api/invoices/:invoiceNumber`
  - Navigates back to `/invoice-view?email=...`

---

## Payment Flow (End-to-End)

1) User creates invoice in `/invoice` → backend saves to `invoices`
2) From `/invoice-view`, user clicks Pay Now
3) Backend `POST /api/create-order` creates a Cashfree order and returns `payment_session_id`
4) Frontend loads Cashfree Checkout with `paymentSessionId`
5) Cashfree redirects to `/payment-success?order_id=...`
6) Frontend calls `POST /api/verify-payment` → if `PAID`, backend updates `payments` and `invoices`
7) Separately, Cashfree webhook also updates statuses as a source of truth

## Refund Flow

1) User clicks Refund on a `PAID` invoice in `/invoice-view`
2) Frontend `POST /api/refund` with `order_id` or `invoice_number`
3) Backend calls Cashfree refund API and sets interim statuses
4) Cashfree webhook sends final refund status → backend maps to `REFUNDED` or `REFUND_FAILED`
5) UI polls invoices periodically to reflect final state

---

## Cashfree Dashboard Setup

- Mode: set `CASHFREE_ENV` `production`
- Keys: Generate the Cashfree APP ID(x-client-id) and Secret ID(x-secret-id) from Developers-->API keys-->Generate API keys; set in backend env
- Webhook:
  - URL: `https://<your-backend>/api/webhook/cashfree`
  - Content-Type: JSON
  - Go to Developers-->Webhooks-->Configuration-->Add Webhook Endpoint

---

## CORS, CSP, and Security

- CORS allows only `FRONTEND_URL` origin; set it correctly in backend env
- Helmet CSP limits `connect-src` to Cashfree domains and your `FRONTEND_URL`
- Webhook routes use `express.raw({ type: 'application/json' })` for signature validation. Ensure Cashfree sends JSON.

---


- **CORS error**: Check `FRONTEND_URL` matches the actual origin (no trailing slash)
- **Cashfree 401/403**: Verify `CASHFREE_APP_ID`, `CASHFREE_SECRET`, env mode matches dashboard
- **Webhook 400 (signature)**: Ensure headers present, webhook secret configured consistently
- **Invoice not updated after payment**: Use `/api/verify-payment`; confirm webhook is reaching server
- **Refund stuck in initiating**: Wait for webhook; verify Cashfree dashboard and server logs

Flowchart

https://github.com/user-attachments/assets/217f6b24-f5e1-4e55-b575-dd6e17174bb7