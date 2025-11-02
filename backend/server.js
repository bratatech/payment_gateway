import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Razorpay from "razorpay";
import pkg from "pg";
import dotenv from "dotenv";


dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

// --------------------- ROUTES ----------------------

app.post("/invoices", async (req, res) => {
  try {
    const {
      invoiceNumber,
      date,
      dueDate,
      clientName,
      clientEmail,
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
      (invoice_number, date, due_date, client_name, client_email, client_address, items, tax_rate, subtotal, tax, total, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        invoiceNumber,
        date,
        dueDate,
        clientName,
        clientEmail,
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

app.post("/api/create-order", async (req, res) => {
  try {
    const { amount, currency, invoiceNumber } = req.body;

    const options = {
      amount,
      currency,
      receipt: invoiceNumber,
      payment_capture: 1, 
    };

    const order = await razorpay.orders.create(options);
    res.json({ order_id: order.id, razorpay_key: process.env.RAZORPAY_KEY });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: "Error creating order" });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  try {
    const crypto = await import("crypto");
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature === razorpay_signature) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});


app.put("/api/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params; // this is actually the invoiceNumber coming from frontend
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

// --------------------------------------------------

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
