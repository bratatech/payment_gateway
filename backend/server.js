import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import axios from "axios";
import pkg from "pg";
import dotenv from "dotenv";
import helmet from "helmet";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const FRONTEND_URL = process.env.FRONTEND_URL;

const { Pool } = pkg;

const app = express();

// --------------------- SECURITY ----------------------
 

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://payment-gateway-pzvg.onrender.com", "data:"], // ✅ added data:
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  })
);

// --------------------- MIDDLEWARE ----------------------
app.use(
  cors({
    origin: "https://invoice-pay.netlify.app", // allow your frontend only
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    credentials: true, // optional if using cookies
  })
);

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
    const result = await pool.query(
      "SELECT * FROM invoices WHERE client_email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No invoices found" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update invoice after payment
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
// ==========================
// Create Order Endpoint
// ==========================
app.post("/api/create-order", async (req, res) => {
  console.log("📦 Received create-order request:", req.body);

  try {
    const { amount, currency, invoiceNumber, clientName, clientEmail, clientPhone } = req.body;

    const orderAmount = parseFloat(amount);

    // Sanitize customer id (needed for Cashfree)
    const sanitizedCustomerId = (clientEmail || invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, "_");

    // ⚠️ Modern Cashfree requires "return_url" to be HTTPS and single slash
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
        return_url: `${FRONTEND_URL}payment-success?order_id={order_id}`, // ✅ fixed double slash
      },
    };

    const headers = {
      "x-client-id": CF_APP_ID,
      "x-client-secret": CF_SECRET,
      "x-api-version": "2022-09-01",
      "Content-Type": "application/json",
    };

    // ⚠️ Ensure this is the /orders endpoint for Cashfree v2
    const cfResp = await axios.post(`${CF_BASE_URL}/orders`, createOrderBody, { headers });
    const data = cfResp.data;

    // Save order and payment_session_id in DB
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
        data.payment_session_id, // ⚠️ This is what frontend will use as the "token"
        "PENDING",
      ]
    );

    console.log("✅ Cashfree order created successfully:", data);

    // ⚠️ FRONTEND USES payment_session_id as "token" for load()
    res.json({
      cf_order_id: data.cf_order_id,
      order_id: data.order_id,
      payment_session_id: data.payment_session_id, // ✅ send this to frontend
      env: CF_ENV, // optional, frontend can use to set PROD/TEST
    });
  } catch (error) {
    console.error("❌ Error creating Cashfree order:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Error creating Cashfree order",
      details: error?.response?.data || error.message,
    });
  }
});

// ==========================
// Verify Payment Endpoint
// ==========================
app.post("/api/verify-payment", async (req, res) => {
  try {
    const { order_id } = req.body;

    const headers = {
      "x-client-id": CF_APP_ID,
      "x-client-secret": CF_SECRET,
      "x-api-version": "2022-09-01",
    };

    // ✅ Correct URL to fetch order status
    const verifyResp = await axios.get(`${CF_BASE_URL}/orders/${order_id}`, { headers });
    const status = verifyResp?.data?.order_status; // 'PAID', 'ACTIVE', etc.
    const success = status === "PAID";

    // ✅ Update DB tables
    await pool.query(`UPDATE payments SET status=$1 WHERE order_id=$2`, [status, order_id]);
    await pool.query(`UPDATE invoices SET status=$1 WHERE invoice_number=$2`, [status, order_id]);

    console.log("💰 Payment verified:", order_id, status);

    res.json({ success, status });
  } catch (error) {
    console.error("❌ Payment verification error:", error?.response?.data || error.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
});


// --------------------- TEST ROUTE ----------------------
app.get("/", (req, res) => res.send("Backend is running!"));

// --------------------- SERVER ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
