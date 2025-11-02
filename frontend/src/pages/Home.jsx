import React from "react";
import { Link } from "react-router-dom";

function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f9f9f9",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem", color: "#333" }}>
        Welcome to My Business Dashboard 🚀
      </h1>

      <p style={{ fontSize: "1.1rem", textAlign: "center", maxWidth: "600px", color: "#555" }}>
        Track your invoices, manage payments, and view customer transactions—all from one place.
      </p>

      <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
        <Link
          to="/invoice"
          style={{
            backgroundColor: "#007bff",
            color: "white",
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "500",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
          Create Invoice 💳
        </Link>

         <Link
          to="/invoice-view"
          style={{
            backgroundColor: "#28a745",
            color: "white",
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "500",
            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          }}
        >
           Invoice View📊
        </Link>
      </div>

      <div
        style={{
          marginTop: "3rem",
          padding: "1.5rem",
          backgroundColor: "#fff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "700px",
          boxShadow: "0 6px 15px rgba(0,0,0,0.05)",
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#007bff" }}>Quick Stats</h2>
        <p style={{ color: "#555" }}>
          • 5 Pending Invoices <br />
          • 12 Completed Payments <br />
          • 3 Customers Awaiting Payment
        </p>
      </div>
    </div>
  );
}

export default Home;
