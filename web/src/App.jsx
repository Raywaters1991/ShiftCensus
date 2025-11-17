import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import CensusPage from "./pages/CensusPage";
import StaffPage from "./pages/StaffPage";
import ShiftsPage from "./pages/ShiftsPage";
import DashboardPage from "./pages/DashboardPage";

function NavLinkItem({ to, label }) {
  return (
    <NavLink
      to={to}
      end
      style={({ isActive }) => ({
        padding: "10px 25px",
        borderRadius: "8px",
        background: isActive ? "#3b82f6" : "transparent",
        color: isActive ? "#fff" : "#ccc",
        fontWeight: isActive ? "bold" : "500",
        textDecoration: "none",
        fontSize: "18px",
        transition: "0.2s",
      })}
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <Router>
      {/* NAV BAR */}
      <nav
        style={{
          width: "100%",
          backgroundColor: "#1c1c1c",
          padding: "18px 0",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          borderBottom: "2px solid #333",
          position: "sticky",
          top: 0,
          left: 0,
          zIndex: 1000,
        }}
      >
        <div style={{ display: "flex", gap: "45px" }}>
          <NavLinkItem to="/" label="Census" />
          <NavLinkItem to="/staff" label="Staff" />
          <NavLinkItem to="/shifts" label="Shifts" />
          <NavLinkItem to="/dashboard" label="Dashboard" />
        </div>
      </nav>

      {/* MAIN ROUTES */}
      <div style={{ width: "100%", marginTop: "20px" }}>
        <Routes>
          <Route path="/" element={<CensusPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/shifts" element={<ShiftsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </div>
    </Router>
  );
}
