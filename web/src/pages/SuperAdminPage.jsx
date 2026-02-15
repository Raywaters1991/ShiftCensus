// src/pages/SuperAdminPage.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import supabase from "../services/supabaseClient"; // ✅ default export

function safeSet(storage, key, value) {
  try {
    if (!storage) return;
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

function persistOrgContext({ orgId, orgCode, orgName }) {
  // Session (primary)
  safeSet(sessionStorage, "active_org_id", orgId);
  safeSet(sessionStorage, "org_id", orgId);
  safeSet(sessionStorage, "orgId", orgId);
  safeSet(sessionStorage, "activeOrgId", orgId);

  safeSet(sessionStorage, "org_code", orgCode);
  safeSet(sessionStorage, "active_org_code", orgCode);
  safeSet(sessionStorage, "orgCode", orgCode);
  safeSet(sessionStorage, "activeOrgCode", orgCode);

  safeSet(sessionStorage, "active_org_name", orgName);

  // Local (fallback)
  safeSet(localStorage, "active_org_id", orgId);
  safeSet(localStorage, "org_id", orgId);
  safeSet(localStorage, "orgId", orgId);
  safeSet(localStorage, "activeOrgId", orgId);

  safeSet(localStorage, "org_code", orgCode);
  safeSet(localStorage, "active_org_code", orgCode);
  safeSet(localStorage, "orgCode", orgCode);
  safeSet(localStorage, "activeOrgCode", orgCode);

  safeSet(localStorage, "active_org_name", orgName);
}

export default function SuperAdminPage() {
  const [orgs, setOrgs] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  const canAdd = useMemo(() => {
    return newCode.trim() && newName.trim() && !uploading;
  }, [newCode, newName, uploading]);

  const loadOrgs = async () => {
    try {
      const data = await api.get("/organizations");
      setOrgs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Load orgs error:", e);
    }
  };

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  async function uploadLogo(orgCode) {
    if (!logoFile) return null;

    const maxBytes = 2 * 1024 * 1024; // 2MB
    if (logoFile.size > maxBytes) throw new Error("Logo too large (max 2MB).");

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(logoFile.type)) {
      throw new Error("Unsupported file type. Use PNG/JPG/WebP/SVG.");
    }

    setUploading(true);

    const safeCode = orgCode.trim().toUpperCase();
    const ext = (logoFile.name.split(".").pop() || "png").toLowerCase();
    const filePath = `${safeCode}/logo.${ext}`;

    const { error } = await supabase.storage
      .from("org-logos")
      .upload(filePath, logoFile, { upsert: true });

    if (error) {
      setUploading(false);
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from("org-logos").getPublicUrl(filePath);
    setUploading(false);

    return data?.publicUrl || null;
  }

  function manageOrg(o) {
    persistOrgContext({ orgId: o.id, orgCode: o.org_code, orgName: o.name });
    window.location.href = "/admin";
  }

  async function addOrg({ goManage = false } = {}) {
    const org_code = newCode.trim().toUpperCase();
    const name = newName.trim();

    if (!org_code || !name) return alert("Missing fields");

    try {
      const logo_url = await uploadLogo(org_code);

      const created = await api.post("/organizations", {
        org_code,
        name,
        logo_url: logo_url || null,
      });

      setNewCode("");
      setNewName("");
      setLogoFile(null);
      setLogoPreview(null);

      await loadOrgs();

      if (goManage && created?.id) {
        manageOrg(created);
      }
    } catch (e) {
      alert("Failed: " + (e?.message || "Unknown error"));
    }
  }

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h1>Shift Census Console</h1>
      <h3>Super Admin</h3>

      <div style={{ marginTop: 30 }}>
        <h2>Organizations</h2>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            placeholder="Org Code (e.g., NV-TTC)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ padding: 10, minWidth: 220 }}
          />

          <input
            placeholder="Org Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ padding: 10, minWidth: 260 }}
          />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 10,
              border: "1px solid #444",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            <span style={{ opacity: 0.9 }}>Choose logo</span>
            {logoFile ? (
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                {logoFile.name} ({Math.round(logoFile.size / 1024)} KB)
              </span>
            ) : (
              <span style={{ fontSize: 12, opacity: 0.6 }}>optional</span>
            )}
          </label>

          {logoPreview && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 10px",
                border: "1px solid #333",
                borderRadius: 6,
                background: "#111",
              }}
            >
              <img
                src={logoPreview}
                alt="preview"
                style={{ height: 38, width: 120, objectFit: "contain" }}
              />
              <button
                onClick={() => {
                  setLogoFile(null);
                  setLogoPreview(null);
                }}
                style={{ padding: "6px 10px", background: "#444", color: "white" }}
              >
                Clear
              </button>
            </div>
          )}

          <button
            onClick={() => addOrg({ goManage: false })}
            disabled={!canAdd}
            style={{
              padding: "10px 20px",
              background: canAdd ? "#28a745" : "#2b5b36",
              opacity: canAdd ? 1 : 0.6,
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
          >
            {uploading ? "Uploading..." : "Add"}
          </button>

          <button
            onClick={() => addOrg({ goManage: true })}
            disabled={!canAdd}
            style={{
              padding: "10px 20px",
              background: canAdd ? "#1f6feb" : "#123a6b",
              opacity: canAdd ? 1 : 0.6,
              cursor: canAdd ? "pointer" : "not-allowed",
              border: "none",
              borderRadius: 6,
            }}
          >
            {uploading ? "Uploading..." : "Add & Manage"}
          </button>
        </div>

        <table style={{ width: "100%", marginTop: 10 }}>
          <thead>
            <tr>
              <th style={th}>Logo</th>
              <th style={th}>Code</th>
              <th style={th}>Name</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {orgs.map((o) => (
              <tr key={o.org_code}>
                <td style={td}>
                  {o.logo_url ? (
                    <img
                      src={o.logo_url}
                      alt={`${o.org_code} logo`}
                      style={{ height: 40, width: 140, objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ opacity: 0.6 }}>—</span>
                  )}
                </td>
                <td style={td}>{o.org_code}</td>
                <td style={td}>{o.name}</td>
                <td style={td}>
                  <button
                    onClick={() => manageOrg(o)}
                    style={{
                      padding: "6px 10px",
                      background: "#1f6feb",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          Selecting an org sets <code>x-org-id</code> + <code>x-org-code</code> automatically via{" "}
          <code>src/services/api.js</code>.
        </div>
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
