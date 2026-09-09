import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../services/supabaseClient";
import api from "../services/api";
import { useUser } from "../contexts/UserContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useUser();

  const [stage, setStage] = useState("email"); // email | password | otp | setpw
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupReason, setSetupReason] = useState("first_login");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

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

  function resetMessages() {
    setErrorMsg("");
    setInfoMsg("");
  }

  async function sendSetupCode(cleanedEmail, reason = "first_login") {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanedEmail,
      options: {
        shouldCreateUser: false,
      },
    });
    if (error) throw error;

    setSetupReason(reason);
    setOtp("");
    setStage("otp");
    setInfoMsg(`We sent a 6-digit verification code to ${cleanedEmail}.`);
  }

  async function handleEmailContinue(e) {
    e?.preventDefault?.();
    resetMessages();

    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail) {
      setErrorMsg("Enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const status = await api.get(`/staff/account-status?email=${encodeURIComponent(cleanedEmail)}`);
      if (status?.setup_required) {
        await sendSetupCode(cleanedEmail, "first_login");
      } else {
        setStage("password");
      }
    } catch (err) {
      console.error("ACCOUNT STATUS ERROR:", err);
      // Do not block established users if the status helper is temporarily unavailable.
      setStage("password");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    resetMessages();

    if (!email.trim() || !password) {
      setErrorMsg("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;

      sessionStorage.removeItem("token");
      localStorage.removeItem("token");

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
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    resetMessages();

    const cleanedEmail = email.trim().toLowerCase();
    const token = String(otp || "").replace(/\D/g, "");
    if (token.length !== 6) {
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: cleanedEmail,
        token,
        type: "email",
      });
      if (error) throw error;

      setStage("setpw");
      setInfoMsg(
        setupReason === "reset"
          ? "Identity verified. Create your new password."
          : "Email verified. Create your ShiftCensus password."
      );
    } catch (err) {
      setErrorMsg("That code is invalid or expired. Request a new code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    resetMessages();

    if (newPassword.length < 10) {
      setErrorMsg("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { setup_pending: false },
      });
      if (error) throw error;

      sessionStorage.removeItem("token");
      localStorage.removeItem("token");
      await refreshUser();
      navigate("/");
    } catch (err) {
      console.error("SET PASSWORD ERROR:", err);
      setErrorMsg("Unable to save your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    resetMessages();
    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail) {
      setStage("email");
      setErrorMsg("Enter your email address first, then choose Forgot password.");
      return;
    }

    setLoading(true);
    try {
      await sendSetupCode(cleanedEmail, "reset");
    } catch (err) {
      console.error("PASSWORD RESET OTP ERROR:", err);
      setInfoMsg("If that email has a ShiftCensus account, a verification code was requested.");
    } finally {
      setLoading(false);
    }
  }

  const handleContact = () => {
    const subject = encodeURIComponent("ShiftCensus — Request Demo / Access");
    const body = encodeURIComponent(
      `Hi ShiftCensus,\n\nI’d like to get started.\n\nFacility:\nContact Name:\nPhone:\nEmail:\n`
    );
    window.location.href = `mailto:hello@shiftcensus.com?subject=${subject}&body=${body}`;
  };

  const backToEmail = () => {
    resetMessages();
    setStage("email");
    setPassword("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brandWrap}>
          <img src="/icon-black.png" alt="ShiftCensus" style={styles.logo} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={styles.brandName}>ShiftCensus</div>
            <div style={styles.brandTag}>Staffing + census clarity for SNFs</div>
          </div>
        </div>

        <button type="button" style={styles.headerBtn} onClick={handleContact}>
          Contact Sales
        </button>
      </header>

      <main style={styles.container}>
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

        <section style={styles.card}>
          <div style={{ marginBottom: 18 }}>
            <div style={styles.h2}>
              {stage === "setpw" ? "Create password" : stage === "otp" ? "Verify email" : "Log in"}
            </div>
            <div style={styles.sub}>
              {stage === "email" && "Enter your work email. New employees will be guided through account setup automatically."}
              {stage === "password" && `Signing in as ${email.trim().toLowerCase()}.`}
              {stage === "otp" && `Enter the verification code sent to ${email.trim().toLowerCase()}.`}
              {stage === "setpw" && "Choose a password you’ll use for future ShiftCensus logins."}
            </div>
          </div>

          {errorMsg ? <div style={styles.errorBox}>{errorMsg}</div> : null}
          {infoMsg ? <div style={styles.infoBox}>{infoMsg}</div> : null}

          {stage === "email" ? (
            <form onSubmit={handleEmailContinue} style={styles.form}>
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
              <button type="submit" style={styles.loginBtn(loading)} disabled={loading}>
                {loading ? "Checking account..." : "Continue"}
              </button>
            </form>
          ) : null}

          {stage === "password" ? (
            <form onSubmit={handleLogin} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Password</label>
                <input
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
              <button type="submit" style={styles.loginBtn(loading)} disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <div style={styles.rowBetween}>
                <button type="button" style={styles.linkBtn} onClick={handleForgotPassword} disabled={loading}>
                  Forgot password?
                </button>
                <button type="button" style={styles.linkBtn} onClick={backToEmail} disabled={loading}>
                  Use another email
                </button>
              </div>
            </form>
          ) : null}

          {stage === "otp" ? (
            <form onSubmit={handleVerifyOtp} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>6-digit verification code</label>
                <input
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ ...styles.input, letterSpacing: 5, fontSize: 20, textAlign: "center" }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <button type="submit" style={styles.loginBtn(loading)} disabled={loading}>
                {loading ? "Verifying..." : "Verify Code"}
              </button>
              <div style={styles.rowBetween}>
                <button
                  type="button"
                  style={styles.linkBtn}
                  onClick={() => sendSetupCode(email.trim().toLowerCase(), setupReason).catch(() => setErrorMsg("Unable to resend code right now."))}
                  disabled={loading}
                >
                  Resend code
                </button>
                <button type="button" style={styles.linkBtn} onClick={backToEmail} disabled={loading}>
                  Use another email
                </button>
              </div>
            </form>
          ) : null}

          {stage === "setpw" ? (
            <form onSubmit={handleSetPassword} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>New password</label>
                <input
                  type="password"
                  placeholder="At least 10 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Confirm password</label>
                <input
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={styles.input}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" style={styles.loginBtn(loading)} disabled={loading}>
                {loading ? "Saving password..." : "Create Password & Continue"}
              </button>
            </form>
          ) : null}

          <div style={styles.securityBox}>
            <div style={styles.securityTitle}>Employee account setup</div>
            <div style={styles.securityText}>
              Your manager creates your account. You only need your work email. On your first visit,
              ShiftCensus verifies your email and asks you to create your own password.
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        © {new Date().getFullYear()} Battle Born Technologies LLC, a Nevada-based Technology company
      </footer>
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

function makeStyles(isWide) {
  return {
    page: { minHeight: "100vh", background: "#050505", color: "white" },
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
    logo: { width: isWide ? 100 : 80, height: isWide ? 100 : 80, imageRendering: "auto", filter: "drop-shadow(0 14px 32px rgba(0,0,0,0.65))" },
    brandName: { fontSize: isWide ? 22 : 20, fontWeight: 950, letterSpacing: "-0.015em" },
    brandTag: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
    headerBtn: { background: "white", color: "#0b0b0b", border: "none", borderRadius: 14, padding: "10px 14px", fontWeight: 900, cursor: "pointer" },
    container: { maxWidth: 1120, margin: "0 auto", padding: "0 20px 30px", display: "grid", gridTemplateColumns: isWide ? "1.15fr 0.85fr" : "1fr", gap: 18 },
    card: { background: "#0c0c0c", border: "1px solid #1f1f1f", borderRadius: 28, padding: isWide ? 32 : 22, boxShadow: "0 18px 60px rgba(0,0,0,0.55)" },
    pill: { display: "inline-flex", alignItems: "center", padding: "7px 10px", borderRadius: 999, fontSize: 12, color: "#D1D5DB", background: "#131313", border: "1px solid #232323" },
    h1: { marginTop: 14, fontSize: 34, lineHeight: 1.1, fontWeight: 950, letterSpacing: "-0.02em" },
    lead: { marginTop: 12, color: "#C7CBD1", fontSize: 15, lineHeight: 1.6, maxWidth: 560 },
    featureStack: { marginTop: 18, display: "grid", gap: 10 },
    ctaRow: { marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" },
    primaryCta: { background: "white", color: "#0b0b0b", border: "none", borderRadius: 18, padding: "12px 16px", fontWeight: 950, cursor: "pointer" },
    h2: { fontSize: 26, fontWeight: 950, letterSpacing: "-0.02em" },
    sub: { marginTop: 6, fontSize: 13, color: "#9CA3AF", lineHeight: 1.5 },
    form: { display: "grid", gap: 12 },
    field: { display: "grid", gap: 8 },
    label: { fontSize: 13, color: "#D1D5DB" },
    input: { width: "100%", padding: "12px 12px", background: "#070707", color: "white", border: "1px solid #262626", borderRadius: 16, outline: "none" },
    loginBtn: (busy) => ({ width: "100%", padding: "12px 14px", background: "white", color: "#0b0b0b", border: "none", borderRadius: 18, fontWeight: 950, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1, marginTop: 6 }),
    rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 10 },
    linkBtn: { background: "transparent", border: "none", color: "#D1D5DB", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", padding: 0, fontSize: 13 },
    errorBox: { background: "rgba(127, 29, 29, 0.25)", border: "1px solid rgba(127, 29, 29, 0.45)", color: "#FCA5A5", borderRadius: 16, padding: 12, marginBottom: 12, fontSize: 13 },
    infoBox: { background: "rgba(6, 78, 59, 0.25)", border: "1px solid rgba(6, 78, 59, 0.45)", color: "#A7F3D0", borderRadius: 16, padding: 12, marginBottom: 12, fontSize: 13 },
    securityBox: { marginTop: 16, background: "#070707", border: "1px solid #1f1f1f", borderRadius: 18, padding: 14 },
    securityTitle: { fontSize: 13, fontWeight: 950, color: "#D1D5DB" },
    securityText: { marginTop: 6, fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 },
    footer: { maxWidth: 1120, margin: "0 auto", padding: "0 20px 26px", fontSize: 12, color: "#4B5563", textAlign: "center" },
  };
}

const featurePill = { background: "#070707", border: "1px solid #1f1f1f", borderRadius: 18, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 };
const featureDot = { width: 8, height: 8, borderRadius: 99, background: "#22d3ee", boxShadow: "0 0 0 4px rgba(34,211,238,0.12)" };
const featureText = { fontWeight: 800, fontSize: 13, color: "#E5E7EB" };
