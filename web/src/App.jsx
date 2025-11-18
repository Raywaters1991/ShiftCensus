import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";

import OrgPage from "./pages/OrgPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import StaffPage from "./pages/StaffPage";
import ShiftsPage from "./pages/ShiftsPage";
import CensusPage from "./pages/CensusPage";

function NavLinkItem({ to, label }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <Link
      to={to}
      style={{
        padding: "10px 20px",
        color: active ? "#00aaff" : "white",
        textDecoration: "none",
        fontSize: "18px",
        borderBottom: active ? "3px solid #00aaff" : "3px solid transparent",
        fontWeight: active ? "bold" : "normal",
      }}
    >
      {label}
    </Link>
  );
}

export default function App() {
  const [orgCode, setOrgCode] = useState(null);
  const [user, setUser] = useState(null);

  // Step 1: Org Code Required
  if (!orgCode) {
    return <OrgPage onOrgSelect={(code) => setOrgCode(code)} />;
  }

  // Step 2: User Login Required
  if (!user) {
    return <LoginPage onLogin={() => setUser(true)} />;
  }

  return (
    <BrowserRouter>
      {/* NAV BAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          background: "#1e1e1e",
          padding: "15px 0",
        }}
      >
        <NavLinkItem to="/" label={`Dashboard (${orgCode})`} />
        <NavLinkItem to="/staff" label="Staff" />
        <NavLinkItem to="/shifts" label="Shifts" />
        <NavLinkItem to="/census" label="Census" />

        <button
          onClick={() => setUser(null)}
          style={{
            marginLeft: "20px",
            background: "#b33",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      <Routes>
        <Route path="/" element={<DashboardPage org={orgCode} />} />
        <Route path="/staff" element={<StaffPage org={orgCode} />} />
        <Route path="/shifts" element={<ShiftsPage org={orgCode} />} />
        <Route path="/census" element={<CensusPage org={orgCode} />} />
      </Routes>
    </BrowserRouter>
  );
}
