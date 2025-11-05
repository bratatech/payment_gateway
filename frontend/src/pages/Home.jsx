import React from "react";
import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="home">
      <h1 className="home-title">Welcome to My Business Dashboard 🚀</h1>

      <p className="home-subtitle">
        Track your invoices, manage payments, and view customer transactions—all from one place.
      </p>

      <div className="home-actions">
        <Link to="/invoice" className="btn btn-primary">Create Invoice 💳</Link>
        <Link to="/invoice-view" className="btn btn-success">Invoice View📊</Link>
      </div>

      <div className="card stats-card">
        <h2 style={{ color: "var(--primary)" }}>Quick Stats</h2>
        <p style={{ color: "var(--muted)" }}>
          • 5 Pending Invoices <br />
          • 12 Completed Payments <br />
          • 3 Customers Awaiting Payment
        </p>
      </div>
    </div>
  );
}

export default Home;
