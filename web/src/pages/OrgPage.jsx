import { useState } from "react";

export default function OrgPage({ onOrgSelect }) {
  const [orgCode, setOrgCode] = useState("");
  const [error, setError] = useState("");

  const validateOrg = () => {
    if (!orgCode.trim()) {
      setError("Please enter your organization code.");
      return;
    }

    // Later: Validate against Supabase (org table)
    onOrgSelect(orgCode.trim());
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "#0d0d0d",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
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
          style={{ width: "160px", marginBottom: "20px" }}
        />

        <h2>Enter Organization Code</h2>

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

        <input
          value={orgCode}
          onChange={(e) => setOrgCode(e.target.value)}
          placeholder="Example: NSPA01"
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "20px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#222",
            color: "white",
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
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
