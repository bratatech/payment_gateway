import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

export default function PaymentSuccess() {
  const API_BASE = "https://payment-gateway-pzvg.onrender.com";
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState("Verifying payment...");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const order_id = params.get("order_id");

    if (!order_id) {
      setMessage("Missing order information.");
      return;
    }

    const run = async () => {
      try {
        // 1) Verify payment
        const verify = await axios.post(`${API_BASE}/api/verify-payment`, { order_id });
        const success = verify.data?.success;

        // 2) Fetch payment to get customer_email and amount
        const pay = await axios.get(`${API_BASE}/api/payments/${order_id}`);
        const customer_email = pay.data?.customer_email;
        const amount = Number(pay.data?.amount || 0);

        if (!customer_email) {
          setMessage("Payment verified, but email not found.");
          // Still redirect to view page where user can enter email manually
          navigate(`/invoice-view`);
          return;
        }

        // 3) Best-effort: mark matching invoice as paid using amount match
        //    We fetch invoices and update the first non-paid invoice whose total matches the payment amount
        try {
          const invList = await axios.get(`${API_BASE}/api/invoices/${encodeURIComponent(customer_email)}`);
          const invoices = Array.isArray(invList.data) ? invList.data : [invList.data];
          const normalized = invoices.map((inv) => ({
            ...inv,
            invoiceNumber: inv.invoiceNumber || inv.invoice_number,
            total: Number(inv.total) || 0,
            status: inv.status,
          }));
          const match = normalized.find((i) => i.status !== "paid" && Math.abs(i.total - amount) < 0.01);
          if (match?.invoiceNumber && success) {
            await axios.put(`${API_BASE}/api/invoices/${encodeURIComponent(match.invoiceNumber)}`, {
              status: "paid",
              paymentId: order_id,
            });
          }
        } catch (e) {
          // Non-fatal; continue to redirect
          console.warn("Unable to auto-mark invoice paid:", e?.response?.data || e.message);
        }

        setMessage(success ? "Payment successful! Redirecting..." : "Payment not completed. Redirecting...");

        // 4) Redirect to View Invoice page with email
        navigate(`/invoice-view?email=${encodeURIComponent(customer_email)}`);
      } catch (err) {
        console.error("Payment success flow error:", err?.response?.data || err.message);
        setMessage("We couldn't verify your payment. You can still view your invoice.");
        navigate(`/invoice-view`);
      }
    };

    run();
  }, [location.search, navigate]);

  return (
    <div className="content" style={{ padding: 24 }}>
      <h2>{message}</h2>
      <p>Please wait...</p>
    </div>
  );
}
