import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Invoice from "./pages/invoice.jsx";
import ViewInvoice from "./pages/ViewInvoice.jsx";
import PaymentSuccess from "./pages/PaymentSuccess.jsx";
import "./App.css";

function App() {
  return (
    <Router>
      {/* ✅ Navbar */}
      <nav className="navbar">
        <div className="nav-inner">
          <div className="brand">Payment Gateway</div>
          <div className="nav-links">
            <Link to="/" className="nav-link">🏠 Home</Link>
            <Link to="/invoice" className="nav-link">💳 Invoice</Link>
            <Link to="/invoice-view" className="nav-link">📄 View</Link>
          </div>
        </div>
      </nav>

      {/* ✅ Routes */}
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/invoice" element={<Invoice />} />
          <Route path="/invoice-view" element={<ViewInvoice />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
        </Routes>
      </main>

      {/* ✅ Footer */}
      <footer className="footer">© {new Date().getFullYear()}</footer>
    </Router>
  )
}

export default App;