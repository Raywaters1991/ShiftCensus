// src/pages/SuperAdminPage.jsx
import { useEffect, useState } from "react";
import api from "../services/api";

export default function SuperAdminPage() {
  const [orgs, setOrgs] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const loadOrgs = async () => {
    try {
      const data = await api.get("/organizations");
      setOrgs(data);
    } catch (e) {
      console.error("Load orgs error:", e);
    }
  };

  useEffect(() => {
    loadOrgs();
  }, []);

  async function addOrg() {
    if (!newCode || !newName) return alert("Missing fields");

    try {
      await api.post("/organizations", {
        org_code: newCode.trim(),
        name: newName.trim(),
      });

      setNewCode("");
      setNewName("");
      loadOrgs();
    } catch (e) {
      alert("Failed: " + e.message);
    }
  }

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h1>Shift Census Console</h1>
      <h3>Super Admin</h3>

      <div style={{ marginTop: 30 }}>
        <h2>Organizations</h2>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <input
            placeholder="Org Code"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ padding: 10 }}
          />

          <input
            placeholder="Org Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ padding: 10 }}
          />

          <button
            onClick={addOrg}
            style={{ padding: "10px 20px", background: "#28a745" }}
          >
            Add
          </button>
        </div>

        <table style={{ width: "100%", marginTop: 10 }}>
          <thead>
            <tr>
              <th style={th}>Code</th>
              <th style={th}>Name</th>
            </tr>
          </thead>

          <tbody>
            {orgs.map((o) => (
              <tr key={o.org_code}>
                <td style={td}>{o.org_code}</td>
                <td style={td}>{o.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #444",
};

const td = {
  padding: "10px",
  borderBottom: "1px solid #333",
};
