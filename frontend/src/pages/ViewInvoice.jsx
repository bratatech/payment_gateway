import React, { useState, useEffect } from "react";
import axios from "axios";
import { load } from "@cashfreepayments/cashfree-js";
import { useLocation } from "react-router-dom";
import "./invoice.css";

export default function ViewInvoice() {
  const API_BASE = "https://payment-gateway-pzvg.onrender.com";
  const FRONTEND_BASE = "https://invoice-pay.netlify.app";
  const [email, setEmail] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [error, setError] = useState("");
  const location = useLocation();

  // Fetch invoice by email
  const fetchInvoicesByEmail = async (targetEmail) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API_BASE}/api/invoices/${encodeURIComponent(targetEmail)}`);
      const normalizedData = (Array.isArray(response.data) ? response.data : [response.data]).map(
        (invoice) => ({
          ...invoice,
          invoiceNumber: invoice.invoiceNumber || invoice.invoice_number,
          clientName: invoice.clientName || invoice.client_name,
          clientEmail: invoice.clientEmail || invoice.client_email,
          clientPhone: invoice.clientPhone || invoice.client_phone,
          clientAddress: invoice.clientAddress || invoice.client_address,
          taxRate: Number(invoice.taxRate ?? invoice.tax_rate),
          items: (() => {
            if (typeof invoice.items === "string") {
              try {
                return JSON.parse(invoice.items);
              } catch {
                return [];
              }
            }
            return Array.isArray(invoice.items) ? invoice.items : [];
          })(),
          subtotal: Number(invoice.subtotal) || 0,
          tax: Number(invoice.tax) || 0,
          total: Number(invoice.total) || 0,
        })
      );

      setInvoices(normalizedData);
      setShowModal(false);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError(err.response?.status === 404 ? "No invoices found for this email." : "Something went wrong!");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchInvoices = async (e) => {
    e.preventDefault();
    fetchInvoicesByEmail(email);
  };

  // Auto-fetch when ?email= is present in the URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlEmail = params.get("email");
    if (urlEmail) {
      setEmail(urlEmail);
      fetchInvoicesByEmail(urlEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // 💳 Handle Cashfree Payment
const handlePayment = async (invoiceData) => {
  if (!invoiceData.clientName || !invoiceData.clientEmail || invoiceData.total <= 0) {
    alert("Client details missing or invalid invoice total.");
    return;
  }

  setLoading(true);

  try {
    // Step 1: Create order on backend
    const orderResponse = await axios.post(`${API_BASE}/api/create-order`, {
      amount: invoiceData.total,
      currency: "INR",
      invoiceNumber: invoiceData.invoiceNumber,
      clientName: invoiceData.clientName,
      clientEmail: invoiceData.clientEmail,
      clientPhone: invoiceData.clientPhone || "9999999999",
      items: invoiceData.items,
    });

    const { order_id, payment_session_id } = orderResponse.data;

    if (!payment_session_id) throw new Error("Missing payment session ID from backend");

    // Step 2: Initialize Cashfree checkout (correct usage)
    const cashfree = await load({ mode: "production" }); // Don't pass token here

    await cashfree.checkout({
      paymentSessionId: payment_session_id, // ← this is the actual session token
      redirectTarget: "_self",
    });

    // Step 3: Verify payment after redirection
    const verifyResponse = await axios.post(`${API_BASE}/api/verify-payment`, { order_id });

    if (verifyResponse.data.success) {
      alert("Payment successful!");

      // Step 4: Update invoice status
      await axios.put(`${API_BASE}/api/invoices/${invoiceData.id || invoiceData.invoiceNumber}`, {
        status: "paid",
        paymentId: order_id,
      });

      // Step 5: Update UI instantly
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.invoiceNumber === invoiceData.invoiceNumber
            ? { ...inv, status: "paid" }
            : inv
        )
      );

      window.location.assign(`${FRONTEND_BASE}/payment-success?order_id=${order_id}`);
    } else {
      alert("Payment verification failed!");
    }
  } catch (err) {
    console.error("Error in payment flow:", err);
    alert("Error initiating payment!");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="invoice-page">
      {/* Modal Popup */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>Enter Your Email to View Invoice</h2>
            <form onSubmit={handleFetchInvoices} className="modal-form">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? "Fetching..." : "View Invoice"}
              </button>
              {error && <p className="error-text">{error}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Invoice Display */}
      {!showModal && invoices.length > 0 && (
        <div className="invoice-container">
          <h1 className="invoice-title">📄 Your Invoices</h1>

          {/* Client Summary */}
          <div className="invoice-box" style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Client Summary</h3>
            <p>
              <strong>Name:</strong> {invoices[0].clientName}
            </p>
            <p>
              <strong>Email:</strong> {invoices[0].clientEmail}
            </p>
            <p>
              <strong>Phone:</strong> {invoices[0].clientPhone}
            </p>
            <p>
              <strong>Address:</strong> {invoices[0].clientAddress}
            </p>
          </div>

          {invoices.map((invoice, index) => (
            <div key={index} className="invoice-box">
              <h3>{invoice.invoiceNumber}</h3>
              <p>
                <strong>Client:</strong> {invoice.clientName}
              </p>
              <p>
                <strong>Email:</strong> {invoice.clientEmail}
              </p>
              <p>
                <strong>Phone:</strong> {invoice.clientPhone}
              </p>
              <p>
                <strong>Address:</strong> {invoice.clientAddress}
              </p>
              <p>
                <strong>Date:</strong> {invoice.date}
              </p>
              <p>
                <strong>Due Date:</strong> {invoice.dueDate}
              </p>
              <p>
                <strong>Status:</strong> {invoice.status}
              </p>

              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>₹{item.price}</td>
                      <td>₹{(item.quantity * item.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="totals-section">
                <p>Subtotal: ₹{invoice.subtotal.toFixed(2)}</p>
                <p>Tax ({invoice.taxRate}%): ₹{invoice.tax.toFixed(2)}</p>
                <p className="total-amount">Total: ₹{invoice.total.toFixed(2)}</p>
              </div>

              {/* 💳 Pay Now Button */}
              {invoice.status !== "paid" && (
                <button
                  className="pay-now-btn"
                  onClick={() => handlePayment(invoice)}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Pay Now 💰"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
