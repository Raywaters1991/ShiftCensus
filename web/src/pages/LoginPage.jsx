import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../services/supabaseClient";
import { useUser } from "../contexts/UserContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // simple responsive switch
  const [isWide, setIsWide] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 900 : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const styles = useMemo(() => makeStyles(isWide), [isWide]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");

    if (!email.trim() || !password) {
      setErrorMsg("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const token = data?.session?.access_token;
      if (token) sessionStorage.setItem("token", token);

      const { data: authUser, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const role = authUser?.user?.user_metadata?.role || "";
      const org_code = authUser?.user?.user_metadata?.org_code || "";

      sessionStorage.setItem("role", role);
      sessionStorage.setItem("org_code", org_code);

      await refreshUser();
      navigate("/");
    } catch (err) {
      const msg =
        String(err?.message || "").toLowerCase().includes("invalid login")
          ? "Invalid email or password."
          : "Login failed. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleContact = () => {
    const subject = encodeURIComponent("ShiftCensus — Request Demo / Access");
    const body = encodeURIComponent(
      `Hi ShiftCensus,\n\nI’d like to get started.\n\nFacility:\nContact Name:\nPhone:\nEmail:\n`
    );
    window.location.href = `mailto:hello@shiftcensus.com?subject=${subject}&body=${body}`;
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brandWrap}>
          <img
            src="/icon-black.png"
            alt="ShiftCensus"
            style={styles.logo}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div style={styles.brandName}>ShiftCensus</div>
            <div style={styles.brandTag}>Staffing + census clarity for SNFs</div>
          </div>
        </div>

        <button type="button" style={styles.headerBtn} onClick={handleContact}>
          Contact Sales
        </button>
      </header>

      {/* Main */}
      <main style={styles.container}>
        {/* Left */}
        <section style={styles.card}>
          <div style={styles.pill}>Built for Skilled Nursing Facilities</div>

          <h1 style={styles.h1}>
            Know your census.
            <br />
            Staff smarter.
            <br />
            Stop the chaos.
          </h1>

          <p style={styles.lead}>
            ShiftCensus helps skilled nursing and long-term care teams track daily
            census, staffing coverage, and assignments in one place—so everyone stays
            aligned.
          </p>

          <div style={styles.featureStack}>
            <Feature text="Census + staffing in one real-time view" />
            <Feature text="Fewer gaps caused by missed updates" />
            <Feature text="Built around real SNF workflows" />
            <Feature text="Multi-facility access with one login" />
          </div>

          <div style={styles.ctaRow}>
            <button type="button" style={styles.primaryCta} onClick={handleContact}>
              Request a Demo
            </button>
          </div>
        </section>

        {/* Right */}
        <section style={styles.card}>
          <div style={{ marginBottom: 18 }}>
            <div style={styles.h2}>Log in</div>
            <div style={styles.sub}>
              Your email determines your organization automatically.
            </div>
          </div>

          {errorMsg ? <div style={styles.errorBox}>{errorMsg}</div> : null}
          {infoMsg ? <div style={styles.infoBox}>{infoMsg}</div> : null}

          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                placeholder="Organization Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                autoComplete="current-password"
              />
            </div>

            <button type="submit" style={styles.loginBtn(loading)} disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <div style={styles.rowBetween}>
              <button type="button" style={styles.linkBtn} onClick={handleContact}>
                Forgot password?
              </button>

              <a style={styles.link} href="mailto:hello@shiftcensus.com?subject=ShiftCensus%20-%20Need%20Access">
                Need access?
              </a>
            </div>

            <div style={styles.securityBox}>
              <div style={styles.securityTitle}>Security note</div>
              <div style={styles.securityText}>
                If your email isn’t linked to an organization yet, contact us and we’ll
                onboard your facility.
              </div>
            </div>
          </form>
        </section>
      </main>

      <footer style={styles.footer}>© {new Date().getFullYear()} ShiftCensus</footer>
    </div>
  );
}

function Feature({ text }) {
  return (
    <div style={featurePill}>
      <div style={featureDot} aria-hidden="true" />
      <div style={featureText}>{text}</div>
    </div>
  );
}

/* ---------------- Styles ---------------- */

function makeStyles(isWide) {
  return {
    page: {
      minHeight: "100vh",
      background: "#050505",
      color: "white",
    },

    header: {
      maxWidth: 1120,
      margin: "0 auto",
      padding: "22px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },

    brandWrap: { display: "flex", alignItems: "center", gap: 10 },

    logo: {
  width: isWide ? 100 : 80,
  height: isWide ? 100 : 80,
  imageRendering: "auto",
  filter: "drop-shadow(0 14px 32px rgba(0,0,0,0.65))",
},


    brandName: {
  fontSize: isWide ? 22 : 20,
  fontWeight: 950,
  letterSpacing: "-0.015em",
},

    brandTag: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },

    headerBtn: {
      background: "white",
      color: "#0b0b0b",
      border: "none",
      borderRadius: 14,
      padding: "10px 14px",
      fontWeight: 900,
      cursor: "pointer",
    },

    container: {
      maxWidth: 1120,
      margin: "0 auto",
      padding: "0 20px 30px",
      display: "grid",
      gridTemplateColumns: isWide ? "1.15fr 0.85fr" : "1fr",
      gap: 18,
    },

    card: {
      background: "#0c0c0c",
      border: "1px solid #1f1f1f",
      borderRadius: 28,
      padding: isWide ? 32 : 22,
      boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
    },

    pill: {
      display: "inline-flex",
      alignItems: "center",
      padding: "7px 10px",
      borderRadius: 999,
      fontSize: 12,
      color: "#D1D5DB",
      background: "#131313",
      border: "1px solid #232323",
    },

    h1: {
      marginTop: 14,
      fontSize: 34,
      lineHeight: 1.1,
      fontWeight: 950,
      letterSpacing: "-0.02em",
    },

    lead: {
      marginTop: 12,
      color: "#C7CBD1",
      fontSize: 15,
      lineHeight: 1.6,
      maxWidth: 560,
    },

    featureStack: {
      marginTop: 18,
      display: "grid",
      gap: 10,
    },

    ctaRow: { marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" },

    primaryCta: {
      background: "white",
      color: "#0b0b0b",
      border: "none",
      borderRadius: 18,
      padding: "12px 16px",
      fontWeight: 950,
      cursor: "pointer",
    },

    h2: { fontSize: 26, fontWeight: 950, letterSpacing: "-0.02em" },

    sub: {
      marginTop: 6,
      fontSize: 13,
      color: "#9CA3AF",
      lineHeight: 1.5,
    },

    form: { display: "grid", gap: 12 },

    field: { display: "grid", gap: 8 },

    label: { fontSize: 13, color: "#D1D5DB" },

    input: {
      width: "100%",
      padding: "12px 12px",
      background: "#070707",
      color: "white",
      border: "1px solid #262626",
      borderRadius: 16,
      outline: "none",
    },

    loginBtn: (loading) => ({
      width: "100%",
      padding: "12px 14px",
      background: "white",
      color: "#0b0b0b",
      border: "none",
      borderRadius: 18,
      fontWeight: 950,
      cursor: loading ? "not-allowed" : "pointer",
      opacity: loading ? 0.7 : 1,
      marginTop: 6,
    }),

    rowBetween: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 6,
      gap: 10,
    },

    linkBtn: {
      background: "transparent",
      border: "none",
      color: "#D1D5DB",
      textDecoration: "underline",
      textUnderlineOffset: 3,
      cursor: "pointer",
      padding: 0,
      fontSize: 13,
    },

    link: {
      color: "#D1D5DB",
      textDecoration: "underline",
      textUnderlineOffset: 3,
      fontSize: 13,
    },

    errorBox: {
      background: "rgba(127, 29, 29, 0.25)",
      border: "1px solid rgba(127, 29, 29, 0.45)",
      color: "#FCA5A5",
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      fontSize: 13,
    },

    infoBox: {
      background: "rgba(6, 78, 59, 0.25)",
      border: "1px solid rgba(6, 78, 59, 0.45)",
      color: "#A7F3D0",
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      fontSize: 13,
    },

    securityBox: {
      marginTop: 16,
      background: "#070707",
      border: "1px solid #1f1f1f",
      borderRadius: 18,
      padding: 14,
    },

    securityTitle: { fontSize: 13, fontWeight: 950, color: "#D1D5DB" },

    securityText: {
      marginTop: 6,
      fontSize: 12,
      color: "#9CA3AF",
      lineHeight: 1.5,
    },

    footer: {
      maxWidth: 1120,
      margin: "0 auto",
      padding: "0 20px 26px",
      fontSize: 12,
      color: "#4B5563",
      textAlign: "center",
    },
  };
}

const featurePill = {
  background: "#070707",
  border: "1px solid #1f1f1f",
  borderRadius: 18,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const featureDot = {
  width: 8,
  height: 8,
  borderRadius: 99,
  background: "#22d3ee",
  boxShadow: "0 0 0 4px rgba(34,211,238,0.12)",
};

const featureText = { fontWeight: 800, fontSize: 13, color: "#E5E7EB" };
