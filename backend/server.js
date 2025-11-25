import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import axios from "axios";
import pkg from "pg";
import dotenv from "dotenv";
import helmet from "helmet";
import crypto from "crypto";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const FRONTEND_URL = process.env.FRONTEND_URL || "https://invoice-pay.netlify.app";
const { Pool } = pkg;

const app = express();

// --------------------- SECURITY ----------------------
// Add Cashfree domains to connectSrc so SDK/XHR can work
const CSP_CONNECT_SRC = [
  "'self'",
  "https://sandbox.cashfree.com",
  "https://api.cashfree.com",
  FRONTEND_URL,
];

// Use raw body for Cashfree webhook to verify signature BEFORE json parsing
app.use(
  ["/api/webhook/cashfree", "/api/cashfree/webhook"],
  express.raw({ type: "application/json" })
);

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://payment-gateway-pzvg.onrender.com", "data:"],
      connectSrc: CSP_CONNECT_SRC,
      imgSrc: ["'self'", "data:"],
    },
  })
);

// --------------------- MIDDLEWARE ----------------------
app.use(
  cors({
    origin: FRONTEND_URL.replace(/\/$/, "")
, // allow your frontend only (set via env)
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    credentials: true,
  })
);


// JSON parser for all other routes
app.use(bodyParser.json());

// --------------------- DATABASE CONNECTION ----------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

console.log("🧩 Connected DB URL:", process.env.DATABASE_URL);

// --------------------- CASHFREE CONFIG ----------------------
const CF_APP_ID = process.env.CASHFREE_APP_ID;
const CF_SECRET = process.env.CASHFREE_SECRET;
const CF_ENV = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
const CF_WEBHOOK_SECRET = process.env.CASHFREE_WEBHOOK_SECRET;

const CF_BASE_URL =
  CF_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

// --------------------- ROUTES ----------------------

// Create new invoice
app.post("/api/invoices", async (req, res) => {
  try {
    const {
      invoiceNumber,
      date,
      dueDate,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      items,
      taxRate,
      subtotal,
      tax,
      total,
      status,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO invoices
         (invoice_number, date, due_date, client_name, client_email, client_phone, client_address, items, tax_rate, subtotal, tax, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        invoiceNumber,
        date,
        dueDate,
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        JSON.stringify(items),
        taxRate,
        subtotal,
        tax,
        total,
        status,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error saving invoice:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch all invoices for a specific client
app.get("/api/invoices/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query("SELECT * FROM invoices WHERE client_email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No invoices found" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update invoice after payment (manual update route kept)
app.put("/api/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params; // invoiceNumber
    const { status, paymentId } = req.body;

    const result = await pool.query(
      `UPDATE invoices SET status=$1, payment_id=$2 WHERE invoice_number=$3 RETURNING *`,
      [status, paymentId, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a Cashfree payment order
app.post("/api/create-order", async (req, res) => {
  console.log("📦 Received create-order request:", req.body);

  try {
    const { amount, currency, invoiceNumber, clientName, clientEmail, clientPhone } = req.body;

    const orderAmount = parseFloat(amount);

    // Sanitize customer id (needed for Cashfree)
    const sanitizedCustomerId = (clientEmail || invoiceNumber || "cust")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64);

    // Ensure FRONTEND_URL ends with a slash if not provided in env
    const frontendBase = FRONTEND_URL.endsWith("/") ? FRONTEND_URL : `${FRONTEND_URL}/`;

    // Modern Cashfree requires "return_url" to be HTTPS and single slash
    const createOrderBody = {
      order_id: `${invoiceNumber}-${Date.now()}`,
      order_amount: orderAmount,
      order_currency: currency || "INR",
      customer_details: {
        customer_id: sanitizedCustomerId,
        customer_email: clientEmail,
        customer_name: clientName,
        customer_phone: clientPhone || "9999999999",
      },
      order_meta: {
        return_url: `${frontendBase}payment-success?order_id={order_id}`,
      },
    };

    const headers = {
      "x-client-id": CF_APP_ID,
      "x-client-secret": CF_SECRET,
      "x-api-version": "2022-09-01",
      "Content-Type": "application/json",
    };

    const cfResp = await axios.post(`${CF_BASE_URL}/orders`, createOrderBody, { headers });
    const data = cfResp.data;

    // Save order and payment_session_id in DB
    // Note: ensure your `payments` table has the columns used below.
    await pool.query(
      `INSERT INTO payments (order_id, cf_order_id, amount, currency, customer_email, customer_phone, payment_session_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        data.order_id,
        data.cf_order_id,
        orderAmount,
        currency || "INR",
        clientEmail,
        clientPhone || "9999999999",
        data.payment_session_id,
        "PENDING",
      ]
    );

    console.log("✅ Cashfree order created successfully:", data);

    // FRONTEND USES payment_session_id as "token" for load()
    res.json({
      cf_order_id: data.cf_order_id,
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      env: CF_ENV,
    });
  } catch (error) {
    console.error("❌ Error creating Cashfree order:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Error creating Cashfree order",
      details: error?.response?.data || error.message,
    });
  }
});

// Verify Payment Endpoint (polling style verification)
app.post("/api/verify-payment", async (req, res) => {
  try {
    const { order_id } = req.body;

    const headers = {
      "x-client-id": CF_APP_ID,
      "x-client-secret": CF_SECRET,
      "x-api-version": "2022-09-01",
    };

    const verifyResp = await axios.get(`${CF_BASE_URL}/orders/${order_id}`, { headers });
    const status = verifyResp?.data?.order_status; // 'PAID', 'ACTIVE', etc.
    const success = status === "PAID";

    // Update DB payments table with latest status
    await pool.query(`UPDATE payments SET status=$1 WHERE order_id=$2`, [status, order_id]);

    console.log("💰 Payment verified:", order_id, status);

    // If paid, try to update corresponding invoice status automatically
    if (success) {
      try {
        const lastHyphen = order_id.lastIndexOf("-");
        const invoiceNum = lastHyphen > 0 ? order_id.slice(0, lastHyphen) : order_id;
        await pool.query(`UPDATE invoices SET status='PAID' WHERE invoice_number=$1`, [invoiceNum]);
        console.log("🔁 Invoice marked PAID for invoice_number:", invoiceNum);
      } catch (err) {
        console.warn("Could not auto-update invoice status after verification:", err.message);
      }
    }

    res.json({ success, status });
  } catch (error) {
    console.error("❌ Payment verification error:", error?.response?.data || error.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// Cashfree Webhook Endpoint
const handleCashfreeWebhook = async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === "production";

    // --- 1) BYPASS CASHFREE DASHBOARD TEST EVENTS ---
    const ua = req.header("user-agent") || "";
    const isTestWebhook = ua.includes("Cashfree") || ua.includes("CF-Webhook-Tester");
    if (isTestWebhook) {
      console.log("⚡ Cashfree TEST webhook received — skipping signature verification but processing payload");
    }

    // --- 2) Signature Validation (REAL WEBHOOKS ONLY) ---
    const rawBody = req.body; // raw buffer (express.raw)
    const signature =
      req.header("x-webhook-signature") ||
      req.header("x-cf-signature");
    const timestamp =
      req.header("x-webhook-timestamp") ||
      req.header("x-cf-timestamp");

    if (!isTestWebhook) {
      if (!signature) {
        console.warn("❌ Missing webhook signature");
        return res.status(400).send("Missing signature");
      }

      if (!timestamp) {
        console.warn("❌ Missing webhook timestamp");
        return res.status(400).send("Missing timestamp");
      }

      // Cashfree docs: HMAC-SHA256 over (timestamp + rawBody) using client secret, base64-encoded
      const secretForWebhook = CF_SECRET || CF_WEBHOOK_SECRET;
      if (!secretForWebhook) {
        console.warn("⚠️ Missing Cashfree secret for webhook verification");
        return res.status(500).send("Server not configured");
      }

      const payloadToSign = timestamp + rawBody.toString("utf8");

      const computed = crypto
        .createHmac("sha256", secretForWebhook)
        .update(payloadToSign)
        .digest("base64");

      let signatureBuf, computedBuf;
      try {
        signatureBuf = Buffer.from(signature, "base64");
        computedBuf = Buffer.from(computed, "base64");
      } catch (err) {
        console.warn("❌ Signature not base64:", err.message);
        return res.status(400).send("Invalid signature format");
      }

      if (signatureBuf.length !== computedBuf.length) {
        console.warn("❌ Signature length mismatch");
        return res.status(400).send("Invalid signature");
      }

      const valid = crypto.timingSafeEqual(signatureBuf, computedBuf);
      if (!valid) {
        console.warn("❌ Invalid webhook signature");
        return res.status(400).send("Invalid signature");
      }
    }

    // --- 3) Process Real Cashfree Event ---
    const event = JSON.parse(rawBody.toString("utf8"));

    const orderId =
      event?.data?.order?.order_id ||
      event?.data?.order_id ||
      event?.order_id ||
      event?.order?.id;

    const orderStatus =
      event?.data?.order?.order_status ||
      event?.data?.order_status ||
      event?.order_status ||
      event?.data?.status ||
      event?.data?.payment?.payment_status ||
      event?.payment?.payment_status;

    const orderStatusUpper = typeof orderStatus === "string" ? orderStatus.toUpperCase() : orderStatus;
    const isSuccessStatus = orderStatusUpper === "PAID" || orderStatusUpper === "SUCCESS";

    if (orderId && orderStatus) {
      const upd = await pool.query(`UPDATE payments SET status=$1 WHERE order_id=$2`, [
        orderStatus,
        orderId,
      ]);
      if (upd.rowCount === 0) {
        console.warn("⚠️ No payment row updated for order_id:", orderId);
        // Try fallback using Cashfree order id (gateway_order_id maps to cf_order_id saved in DB)
        const cfOrderId =
          event?.data?.cf_order_id ||
          event?.data?.payment_gateway_details?.gateway_order_id ||
          event?.payment_gateway_details?.gateway_order_id ||
          event?.order?.cf_order_id;
        if (cfOrderId) {
          const upd2 = await pool.query(`UPDATE payments SET status=$1 WHERE cf_order_id=$2`, [
            orderStatus,
            cfOrderId,
          ]);
          if (upd2.rowCount === 0) {
            console.warn("⚠️ No payment row updated for cf_order_id:", cfOrderId);
          } else {
            console.log("📥 Webhook updated by cf_order_id:", cfOrderId, orderStatus);
          }
        } else {
          console.warn("ℹ️ No cf_order_id present in webhook payload for fallback update");
        }
      } else {
        console.log("📥 Webhook updated order:", orderId, orderStatus);
      }

      if (isSuccessStatus) {
        try {
          const lastHyphen = orderId.lastIndexOf("-");
          const invoiceNum =
            lastHyphen > 0 ? orderId.slice(0, lastHyphen) : orderId;

          await pool.query(
            `UPDATE invoices SET status='PAID' WHERE invoice_number=$1`,
            [invoiceNum]
          );
          console.log(
            "🔁 Webhook marked invoice PAID for invoice_number:",
            invoiceNum
          );
        } catch (err) {
          console.warn(
            "Could not auto-update invoice from webhook:",
            err.message
          );
        }
      }
    } else {
      console.warn("⚠️ Webhook missing order details", { orderId, orderStatus });
    }

    console.log("✔ Cashfree webhook processed successfully");
    return res.status(200).send("OK");

  } catch (err) {
    console.error("Webhook processing error:", err?.message || err);
    return res.status(400).send("Bad Request");
  }
};

app.post("/api/webhook/cashfree", handleCashfreeWebhook);
app.post("/api/cashfree/webhook", handleCashfreeWebhook);

// Get Payment by order_id
app.get("/api/payments/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;
    const result = await pool.query(`SELECT * FROM payments WHERE order_id = $1 LIMIT 1`, [order_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --------------------- TEST ROUTE ----------------------
app.get("/", (req, res) => res.send("Backend is running!"));

// --------------------- SERVER ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
