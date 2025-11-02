import React, { useState } from "react";
import axios from "axios";
import "./invoice.css";

export default function ViewInvoice() {
  const [email, setEmail] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [error, setError] = useState("");

  // Fetch invoice by email
  const handleFetchInvoices = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.get(
        `http://localhost:5000/api/invoices/${email}`
      );

      // Normalize data: ensure items are parsed, and numeric values are numbers
      const normalizedData = (Array.isArray(response.data)
        ? response.data
        : [response.data]
      ).map((invoice) => ({
        ...invoice,
        items:
          typeof invoice.items === "string"
            ? JSON.parse(invoice.items)
            : invoice.items,
        subtotal: Number(invoice.subtotal),
        tax: Number(invoice.tax),
        total: Number(invoice.total),
        taxRate: Number(invoice.taxRate),
      }));

      setInvoices(normalizedData);
      setShowModal(false);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      if (error.response?.status === 404) {
        setError("No invoices found for this email.");
      } else {
        setError("Something went wrong! Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 💳 Handle Razorpay Payment
  const handlePayment = async (invoiceData) => {
    if (
      !invoiceData.clientName ||
      !invoiceData.clientEmail ||
      invoiceData.total === 0
    ) {
      alert("Client details missing or invalid invoice total.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create order
      const orderResponse = await axios.post(
        `http://localhost:5000/api/create-order`,
        {
          amount: invoiceData.total * 100,
          currency: "INR",
          invoiceNumber: invoiceData.invoiceNumber,
          clientName: invoiceData.clientName,
          clientEmail: invoiceData.clientEmail,
          items: invoiceData.items,
        }
      );

      const { order_id, razorpay_key } = orderResponse.data;

      // Step 2: Initialize Razorpay checkout
      const options = {
        key: razorpay_key,
        amount: invoiceData.total * 100,
        currency: "INR",
        name: "Your Company Name",
        description: `Payment for Invoice ${invoiceData.invoiceNumber}`,
        order_id: order_id,
        handler: async function (response) {
          try {
            // Step 3: Verify payment
            const verifyResponse = await axios.post(
              `http://localhost:5000/api/verify-payment`,
              {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                invoiceData: invoiceData,
              }
            );

            if (verifyResponse.data.success) {
              alert(
                `Payment successful! Payment ID: ${response.razorpay_payment_id}`
              );

              // Step 4: Update invoice status
              await axios.put(
                `http://localhost:5000/api/invoices/${
                  invoiceData.id || invoiceData.invoiceNumber
                }`,
                {
                  status: "paid",
                  paymentId: response.razorpay_payment_id,
                }
              );

              // Update UI instantly
              setInvoices((prevInvoices) =>
                prevInvoices.map((inv) =>
                  inv.invoiceNumber === invoiceData.invoiceNumber
                    ? { ...inv, status: "paid" }
                    : inv
                )
              );
            } else {
              alert("Payment verification failed!");
            }
          } catch (error) {
            console.error("Payment verification error:", error);
            alert("Payment verification error!");
          }
        },
        prefill: {
          name: invoiceData.clientName,
          email: invoiceData.clientEmail,
        },
        theme: {
          color: "#3399cc",
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Error in payment flow:", error);
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
                <p className="total-amount">
                  Total: ₹{invoice.total.toFixed(2)}
                </p>
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
