import { useState } from "react";

export default function OrgPage({ onOrgSelect }) {
  const [orgCode, setOrgCode] = useState("");
  const [error, setError] = useState("");

  const validateOrg = () => {
    if (!orgCode.trim()) {
      setError("Please enter your organization code.");
      return;
    }

    const cleaned = orgCode.trim().toUpperCase();

    // Save org to localStorage (critical for backend requests)
    localStorage.setItem("orgCode", cleaned);

    // Tell parent App.jsx if needed
    if (onOrgSelect) onOrgSelect(cleaned);
  };

  return (
    <div
      style={{
        height: "100vh",
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
          padding: "40px",
          borderRadius: "16px",
          width: "90%",
          maxWidth: "420px",
          boxShadow: "0 0 25px rgba(0,150,255,0.3)",
          textAlign: "center",
          color: "white",
        }}
      >
        <img
          src="/logo.png"
          alt="ShiftCensus Logo"
          style={{ width: "170px", marginBottom: "25px" }}
        />

        <h2 style={{ marginBottom: "10px" }}>Enter Organization Code</h2>
        <p style={{ fontSize: "14px", opacity: 0.8 }}>
          Your organization code is provided by your facility administrator.
        </p>

        {error && (
          <div
            style={{
              background: "#330000",
              color: "#ff4444",
              padding: "10px",
              borderRadius: "8px",
              marginTop: "15px",
              marginBottom: "10px",
            }}
          >
            {error}
          </div>
        )}

        <input
          value={orgCode}
          onChange={(e) => {
            setOrgCode(e.target.value);
            if (error) setError("");
          }}
          placeholder="Example: NSPA01"
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "20px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#222",
            color: "white",
            fontSize: "16px",
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        />

        <button
          onClick={validateOrg}
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "20px",
            background: "#008cff",
            borderRadius: "8px",
            border: "none",
            color: "white",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: "bold",
            transition: "0.2s",
          }}
          onMouseOver={(e) => (e.target.style.background = "#0aa1ff")}
          onMouseOut={(e) => (e.target.style.background = "#008cff")}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
