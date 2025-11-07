import React, { useState } from "react";
import "./invoice.css";
import axios from "axios";
import { useNavigate } from "react-router-dom"; // ✅ for navigation

export default function Invoice() {
  const navigate = useNavigate();
  const API_BASE = import.meta.env.VITE_API_BASE_URL;

  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: "INV-" + new Date().getTime(),
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    items: [{ description: "", quantity: 1, price: 0 }],
    taxRate: 18,
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...invoiceData.items];
    updatedItems[index][field] = value;
    setInvoiceData((prev) => ({ ...prev, items: updatedItems }));
  };

  const addItem = () => {
    setInvoiceData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, price: 0 }],
    }));
  };

  const removeItem = (index) => {
    const updatedItems = invoiceData.items.filter((_, i) => i !== index);
    setInvoiceData((prev) => ({ ...prev, items: updatedItems }));
  };

  const subtotal = invoiceData.items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );
  const tax = (subtotal * invoiceData.taxRate) / 100;
  const total = subtotal + tax;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(
        `${API_BASE}/api/invoices`,
        {
          ...invoiceData,
          subtotal,
          tax,
          total,
          status: "created",
        }
      );

      console.log("Invoice saved:", response.data);
      alert("Invoice saved successfully!");

      // ✅ Navigate to Home after successful save
      navigate("/");
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert("Error saving invoice!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invoice-page">
      <div className="invoice-container">
        <h1 className="invoice-title">🧾 Invoice Generator</h1>

        <form onSubmit={handleSubmit} className="invoice-form">
          {/* Client Info */}
          <div className="form-section">
            <h2 className="section-title">Client Details</h2>
            <div className="form-grid">
              <div>
                <label className="form-label">Client Name *</label>
                <input
                  name="clientName"
                  value={invoiceData.clientName}
                  onChange={handleChange}
                  className="form-input"
                  required
                />
              </div>
              <div>
                <label className="form-label">Client Email *</label>
                <input
                  type="email"
                  name="clientEmail"
                  value={invoiceData.clientEmail}
                  onChange={handleChange}
                  className="form-input"
                  required
                />
              </div>
              <div>
                <label className="form-label">Client Phone *</label>
                <input
                  type="tel"
                  name="clientPhone"
                  value={invoiceData.clientPhone}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="e.g. 9876543210"
                  required
                />
              </div>
              <div className="full-width">
                <label className="form-label">Client Address</label>
                <textarea
                  name="clientAddress"
                  value={invoiceData.clientAddress}
                  onChange={handleChange}
                  rows="3"
                  className="form-textarea"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Invoice Info */}
          <div className="form-section">
            <h2 className="section-title">Invoice Details</h2>
            <div className="form-grid">
              <div>
                <label className="form-label">Invoice Number</label>
                <input
                  name="invoiceNumber"
                  value={invoiceData.invoiceNumber}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Date</label>
                <input
                  type="date"
                  name="date"
                  value={invoiceData.date}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Due Date</label>
                <input
                  type="date"
                  name="dueDate"
                  value={invoiceData.dueDate}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Tax Rate (%)</label>
                <input
                  type="number"
                  name="taxRate"
                  value={invoiceData.taxRate}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="form-section">
            <h2 className="section-title">Invoice Items</h2>
            <div className="items-list">
              {invoiceData.items.map((item, index) => (
                <div key={index} className="item-row">
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      handleItemChange(index, "description", e.target.value)
                    }
                    className="form-input item-input"
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(index, "quantity", Number(e.target.value))
                    }
                    className="form-input item-input"
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    value={item.price}
                    onChange={(e) =>
                      handleItemChange(index, "price", Number(e.target.value))
                    }
                    className="form-input item-input"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="remove-item-btn"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="add-item-btn">
              + Add Item
            </button>
          </div>

          {/* Totals */}
          <div className="totals-section">
            <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
            <p>Tax ({invoiceData.taxRate}%): ₹{tax.toFixed(2)}</p>
            <p className="total-amount">Total: ₹{total.toFixed(2)}</p>
          </div>

          {/* Buttons */}
          <div className="buttons-section">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? "Saving..." : "Save Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
