import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";

import OrgPage from "./pages/OrgPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import StaffPage from "./pages/StaffPage";
import ShiftsPage from "./pages/ShiftsPage";
import CensusPage from "./pages/CensusPage";
import ThemeToggle from "./components/ThemeToggle";

function NavLinkItem({ to, label }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <Link
      to={to}
      style={{
        padding: "10px 20px",
        color: active ? "var(--button-bg)" : "var(--nav-text)",
        textDecoration: "none",
        fontSize: "18px",
        borderBottom: active ? `3px solid var(--button-bg)` : "3px solid transparent",
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

  if (!orgCode) return <OrgPage onOrgSelect={setOrgCode} />;
  if (!user) return <LoginPage onLogin={() => setUser(true)} />;

  return (
    <BrowserRouter>
      <div
        className="navbar"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "20px",
          padding: "15px 0",
          position: "relative",
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

        {/* Theme toggle positioned cleanly at top-right */}
        <div style={{ position: "absolute", right: "20px" }}>
          <ThemeToggle />
        </div>
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
