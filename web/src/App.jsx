// src/App.jsx
import { useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useUser } from "./contexts/UserContext.jsx";
import { useTheme } from "./contexts/ThemeContext.jsx";
import supabase from "./services/supabaseClient";

import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ShiftsPage from "./pages/ShiftsPage.jsx";
import CensusPage from "./pages/CensusPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import SuperAdminPage from "./pages/SuperAdminPage.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

import "./index.css";

function NavLinkItem({ to, label }) {
  return (
    <a
      href={to}
      style={{
        padding: "8px 16px",
        color: "var(--nav-text)",
        textDecoration: "none",
        fontWeight: 600,
      }}
    >
      {label}
    </a>
  );
}

export default function App() {
  const { user, profile, loading } = useUser();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const role = profile?.role || null;
  const orgCode = profile?.org_code || null;

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  const isSuperAdmin = role === "superadmin";
  const canSeeShifts = ["superadmin", "admin", "scheduler", "don"].includes(role);
  const canSeeCensus = ["superadmin", "admin", "admissions", "don", "ed"].includes(role);
  const canSeeAdmin = ["superadmin", "admin", "don", "ed"].includes(role);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = "/login";
  };

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div>
      {user && (
        <div
          className="navbar"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "20px",
            padding: "15px",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <NavLinkItem to="/" label={`Dashboard (${orgCode || "No Org"})`} />
          {canSeeShifts && <NavLinkItem to="/shifts" label="Shifts" />}
          {canSeeCensus && <NavLinkItem to="/census" label="Census" />}
          {canSeeAdmin && <NavLinkItem to="/admin" label="Admin" />}
          {isSuperAdmin && <NavLinkItem to="/superadmin" label="Super Admin" />}

          <button
            onClick={handleLogout}
            style={{
              marginLeft: "20px",
              background: "#b33",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Logout
          </button>

          <div style={{ position: "absolute", right: "20px" }}>
            <ThemeToggle />
          </div>
        </div>
      )}

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
        {canSeeShifts && <Route path="/shifts" element={<ShiftsPage />} />}
        {canSeeCensus && <Route path="/census" element={<CensusPage />} />}
        {canSeeAdmin && <Route path="/admin" element={<AdminPage />} />}
        {isSuperAdmin && <Route path="/superadmin" element={<SuperAdminPage />} />}
      </Routes>
    </div>
  );
}
