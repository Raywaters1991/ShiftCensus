import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../services/supabaseClient";

export default function AcceptInvitePage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("verifying"); // verifying | setpw | done | error
  const [error, setError] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // ✅ Prevent “wrong account” updates if someone is already logged in
        await supabase.auth.signOut();

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code"); // PKCE-style links

        let session = null;

        if (code) {
          // ✅ PKCE flow: exchange code for session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data?.session || null;
        } else {
          // ✅ Hash/token flow: parse from URL
          const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
          if (error) throw error;
          session = data?.session || null;
        }

        if (!mounted) return;

        if (!session?.user?.id) {
          setError("No session found in invite link. Try opening the link again.");
          setStage("error");
          setLoading(false);
          return;
        }

        setStage("setpw");
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Invite link invalid/expired.");
        setStage("error");
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function setPassword() {
    setError("");

    if (pw1.length < 10) return setError("Password must be at least 10 characters.");
    if (pw1 !== pw2) return setError("Passwords do not match.");

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      setStage("done");

      // ✅ either send to app or login — your call
      setTimeout(() => nav("/"), 900);
      // setTimeout(() => nav("/login"), 900);
    } catch (e) {
      setError(e?.message || "Failed to set password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={ui.wrap}>
      <div style={ui.card}>
        <div style={ui.title}>ShiftCensus</div>
        <div style={ui.sub}>
          {stage === "verifying" && "Verifying invite link..."}
          {stage === "setpw" && "Set your password to finish setup."}
          {stage === "done" && "Password set. Taking you to the app..."}
          {stage === "error" && "Something went wrong."}
        </div>

        {loading ? <div style={ui.box}>Loading...</div> : null}

        {stage === "setpw" ? (
          <>
            <div style={ui.form}>
              <label style={ui.label}>New password</label>
              <input
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                style={ui.input}
                placeholder="At least 10 characters"
              />

              <label style={ui.label}>Confirm password</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                style={ui.input}
                placeholder="Repeat password"
              />
            </div>

            {error ? <div style={ui.error}>{error}</div> : null}

            <button onClick={setPassword} disabled={saving} style={ui.btn}>
              {saving ? "Saving..." : "Set Password"}
            </button>
          </>
        ) : null}

        {stage === "error" ? (
          <>
            {error ? <div style={ui.error}>{error}</div> : null}
            <button onClick={() => nav("/login")} style={ui.btn}>
              Go to Login
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

const ui = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "#0b0f14",
    color: "white",
  },
  card: {
    width: "min(520px, 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    padding: 18,
    boxShadow: "0 30px 120px rgba(0,0,0,0.65)",
  },
  title: { fontWeight: 1000, fontSize: 20 },
  sub: { marginTop: 6, color: "#9CA3AF", fontSize: 13, lineHeight: 1.35 },
  box: { marginTop: 14, opacity: 0.85 },
  form: { marginTop: 14, display: "grid", gap: 8 },
  label: { fontSize: 12, color: "#9CA3AF", marginTop: 6 },
  input: {
    height: 42,
    borderRadius: 12,
    padding: "0 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.30)",
    color: "white",
    outline: "none",
  },
  btn: {
    marginTop: 14,
    height: 44,
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(31,111,235,0.95)",
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
  },
  error: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.25)",
    color: "white",
    fontSize: 13,
  },
};
