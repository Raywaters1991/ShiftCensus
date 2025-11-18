import { useState } from "react";
import api from "../services/api";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    // For now, fake login until backend auth is built
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    // TEMP login (replace later with Supabase auth)
    if (onLogin) onLogin(email);
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        background: "#0d0d0d",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#111",
          borderRadius: "16px",
          padding: "40px",
          width: "100%",
          maxWidth: "420px",
          boxShadow: "0 0 25px rgba(0, 150, 255, 0.3)",
          textAlign: "center",
        }}
      >
        {/* LOGO */}
        <img
          src="/logo.png"
          alt="ShiftCensus Logo"
          style={{ width: "160px", marginBottom: "20px" }}
        />

        <h2 style={{ color: "white", marginBottom: "20px" }}>
          ShiftCensus
        </h2>

        {error && (
          <div
            style={{
              background: "#330000",
              color: "red",
              padding: "10px",
              borderRadius: "8px",
              marginBottom: "15px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ textAlign: "left" }}>
          <label style={{ color: "#bbb" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              margin: "8px 0 16px",
              borderRadius: "8px",
              border: "1px solid #333",
              background: "#222",
              color: "white",
            }}
          />

          <label style={{ color: "#bbb" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              margin: "8px 0 20px",
              borderRadius: "8px",
              border: "1px solid #333",
              background: "#222",
              color: "white",
            }}
          />

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              background: "#008cff",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold",
              transition: "0.2s",
            }}
          >
            Log In
          </button>
        </form>

        <div style={{ marginTop: "15px", color: "#777" }}>
          Forgot your password?
        </div>
      </div>
    </div>
  );
}
