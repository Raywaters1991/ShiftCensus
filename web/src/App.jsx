// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, Link, useLocation, Navigate } from "react-router-dom";
import { useUser } from "./contexts/UserContext.jsx";
import supabase from "./services/supabaseClient";

import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ShiftsPage from "./pages/ShiftsPage.jsx";
import CensusPage from "./pages/CensusPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import SuperAdminPage from "./pages/SuperAdminPage.jsx";
import AcceptInvitePage from "./pages/AcceptInvitePage.jsx";

// ✅ You will build this (your “Schedule Management” home)
import HomePage from "./pages/HomePage.jsx";

import OrgSwitcher from "./components/OrgSwitcher.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

import "./index.css";

function MenuLink({ to, label, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        padding: "12px 12px",
        borderRadius: 12,
        textDecoration: "none",
        color: "var(--nav-text)",
        fontWeight: 800,
        background: "var(--surface-glass)",
        border: "1px solid var(--border)",
      }}
    >
      {label}
    </Link>
  );
}

function MenuOverlay({ open, onClose, links, role, onLogout, onOrgChanged }) {
  if (!open) return null;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: 12,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 94vw)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--nav-bg)",
          color: "var(--nav-text)",
          backdropFilter: "blur(10px)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 900, color: "var(--nav-text)" }}>Menu</div>

          <button
            onClick={onClose}
            style={{
              height: 40,
              width: 40,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface-glass)",
              color: "var(--nav-text)",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 900,
            }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {links.map((l) => (
              <MenuLink key={l.to} to={l.to} label={l.label} onClick={onClose} />
            ))}
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800, color: "var(--nav-text)" }}>Organization</div>
              <div style={{ minWidth: 190 }}>
                <OrgSwitcher onOrgChanged={onOrgChanged} />
              </div>
            </div>

            {/* Theme toggle (only here, not top of page) */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ThemeToggle />
            </div>

            <div style={{ fontWeight: 800, color: "var(--nav-text)", opacity: 0.8 }}>
              Role: {role?.toUpperCase()}
            </div>

            <button
              onClick={onLogout}
              style={{
                background: "#b33",
                color: "white",
                border: "none",
                padding: "10px 14px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ✅ Role-based landing
 * - admissions -> /census
 * - scheduler  -> /shifts
 * - ed/don/admin/superadmin -> /dashboard
 * - "wallboard" (if you add) -> /dashboard
 * - default -> /home
 */
function RoleLanding({ role }) {
  const r = String(role || "").toLowerCase();

  // If role isn't loaded yet (rare), just go home-ish
  if (!r) return <Navigate to="/home" replace />;

  if (r === "admissions") return <Navigate to="/census" replace />;
  if (r === "scheduler") return <Navigate to="/shifts" replace />;

  if (["ed", "don", "admin", "superadmin", "wallboard"].includes(r)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/home" replace />;
}

export default function App() {
  const { user, loading, role } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Allow invite acceptance without being logged-in yet
  const isInviteRoute = location.pathname.startsWith("/accept-invite");

  useEffect(() => {
    if (!loading && !user && !isInviteRoute) navigate("/login");
  }, [loading, user, navigate, isInviteRoute]);

  const isSuperAdmin = role === "superadmin";
  const canSeeShifts = ["superadmin", "admin", "scheduler", "don"].includes(role);
  const canSeeCensus = ["superadmin", "admin", "admissions", "don", "ed"].includes(role);
  const canSeeAdmin = ["superadmin", "admin", "don", "ed"].includes(role);

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // ✅ Menu links (home is for most users)
  const navLinks = useMemo(() => {
    const links = [];

    // Most staff home
    links.push({ to: "/home", label: "Home" });

    // Always allow dashboard link (if you want to hide from basic users later, we can)
    links.push({ to: "/dashboard", label: "Dashboard" });

    if (canSeeShifts) links.push({ to: "/shifts", label: "Shifts" });
    if (canSeeCensus) links.push({ to: "/census", label: "Census" });
    if (canSeeAdmin) links.push({ to: "/admin", label: "Admin" });
    if (isSuperAdmin) links.push({ to: "/superadmin", label: "Super Admin" });

    return links;
  }, [canSeeShifts, canSeeCensus, canSeeAdmin, isSuperAdmin]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = "/login";
  };

  // one-time reload helper for org switching
  const handleOrgChanged = () => {
    setMenuOpen(false);
    window.location.reload();
  };

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  // ✅ If not logged in, only show auth + invite routes
  const showNav = !!user && !isInviteRoute;

  return (
    <div>
      {showNav && (
        <>
          {/* ✅ GLOBAL HAMBURGER NAVBAR */}
          <div
            className="navbar"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 999,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--nav-bg)",
              color: "var(--nav-text)",
              backdropFilter: "blur(10px)",
            }}
          >
            <button
              onClick={() => setMenuOpen((s) => !s)}
              style={{
                height: 44,
                width: 44,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface-glass)",
                color: "var(--nav-text)",
                cursor: "pointer",
                fontSize: 18,
                fontWeight: 900,
              }}
              aria-label="Open menu"
            >
              ☰
            </button>

            <div style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>ShiftCensus</div>
            <div style={{ flex: 1 }} />
          </div>

          <MenuOverlay
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            links={navLinks}
            role={role}
            onLogout={handleLogout}
            onOrgChanged={handleOrgChanged}
          />
        </>
      )}

      <Routes>
        {/* Public-ish routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        {/* Landing: decides where to send user based on role */}
        <Route path="/" element={<RoleLanding role={role} />} />

        {/* Main app pages */}
        <Route path="/home" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        {canSeeShifts && <Route path="/shifts" element={<ShiftsPage />} />}
        {canSeeCensus && <Route path="/census" element={<CensusPage />} />}
        {canSeeAdmin && <Route path="/admin" element={<AdminPage />} />}
        {isSuperAdmin && <Route path="/superadmin" element={<SuperAdminPage />} />}

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
