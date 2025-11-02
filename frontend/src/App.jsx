import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Invoice from "./pages/invoice.jsx";
import ViewInvoice from "./pages/ViewInvoice.jsx";
import "./App.css";

function App() {
  return (
    <Router>
      {/* ✅ Navbar */}
      <nav
        style={{
          //background: "#1e1e1e",
          padding: "1rem",
          display: "flex",
          gap: "1.5rem",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Link
          to="/"
          style={{
            color: "white",
            textDecoration: "none",
            fontSize: "1.1rem",
            fontWeight: "500",
          }}
        >
          🏠 Home
        </Link>

        <Link
          to="/invoice"
          style={{
            color: "white",
            textDecoration: "none",
            fontSize: "1.1rem",
            fontWeight: "500",
          }}
        >
          💳 Invoice
        </Link>
      </nav>

      {/* ✅ Routes */}
      <div style={{ padding: "2rem" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/invoice" element={<Invoice />} />
          <Route path="/invoice-view" element={<ViewInvoice />} /> 
        </Routes>
      </div>

      {/* ✅ Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "1rem",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#f1f1f1",
          marginTop: "2rem",
          fontSize: "0.9rem",
          color: "#333",
        }}
      >
         {new Date().getFullYear()} 
      </footer>
    </Router>
  )
}

export default App;