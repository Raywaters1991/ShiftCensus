import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import StaffEditModal from "../components/StaffEditModal";

export default function StaffManagementPage() {
  const { orgName, orgCode, orgId, role } = useUser();
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [invite, setInvite] = useState(null);

  async function load() {
    if (!orgId) return;
    setLoading(true);
    try {
      const [staffData, deptData] = await Promise.all([
        api.get("/staff"),
        api.get("/departments"),
      ]);
      setStaff(Array.isArray(staffData) ? staffData : []);
      setDepartments(Array.isArray(deptData) ? deptData : []);
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to load staff.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) =>
      [s.name, s.role, s.email, s.phone, s.employee_no]
        .some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [staff, search]);

  function departmentName(id) {
    return departments.find((d) => String(d.id) === String(id))?.name || "—";
  }

  async function saveStaff(staffId, payload) {
    try {
      const updated = await api.patch(`/staff/${staffId}`, payload);
      setStaff((prev) => prev.map((s) => (s.id === staffId ? updated : s)));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to save staff member.");
      throw e;
    }
  }

  async function provisionLogin(staffId) {
    try {
      const result = await api.post(`/staff/${staffId}/provision-login`);
      setStaff((prev) => prev.map((s) => (s.id === staffId ? { ...s, ...result } : s)));
      setEditing((prev) => (prev?.id === staffId ? { ...prev, ...result } : prev));
      setInvite({
        name: result?.name,
        email: result?.email,
        actionLink: result?.actionLink,
        note: result?.note || "Login created.",
      });
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to create login.");
      throw e;
    }
  }

  async function deleteStaff(id) {
    if (!window.confirm("Delete this staff member?")) return;
    try {
      await api.delete(`/staff/${id}`);
      setStaff((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to delete staff member.");
    }
  }

  async function copy(text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    alert("Invite link copied.");
  }

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div>
          <div style={ui.title}>Staff Management</div>
          <div style={ui.sub}>{orgName || "No facility selected"}{orgCode ? ` • ${orgCode}` : ""} • Role: {String(role || "").toUpperCase()}</div>
        </div>
        <button style={ui.ghost} onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {!orgId ? (
        <div style={ui.notice}>Select a facility first.</div>
      ) : (
        <>
          <input style={ui.search} placeholder="Search name, role, email, phone, employee #" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={ui.card}>
            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Staff</th>
                    <th style={ui.th}>Department</th>
                    <th style={ui.th}>Contact</th>
                    <th style={ui.th}>Login</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id}>
                      <td style={ui.td}><b>{s.name || "—"}</b><div style={ui.muted}>{s.role || "—"}</div>{s.employee_no ? <div style={ui.muted}>Employee #: {s.employee_no}</div> : null}</td>
                      <td style={ui.td}>{departmentName(s.department_id)}</td>
                      <td style={ui.td}><div>{s.email || "—"}</div><div style={ui.muted}>{s.phone || "—"}</div></td>
                      <td style={ui.td}>{s.user_id ? <span style={ui.linked}>Linked</span> : <span style={ui.unlinked}>No login</span>}</td>
                      <td style={{ ...ui.td, textAlign: "right" }}>
                        <div style={ui.actions}>
                          <button style={ui.ghost} onClick={() => setEditing(s)}>Edit</button>
                          {!s.user_id ? <button style={ui.primary} onClick={() => provisionLogin(s.id)}>Create Login</button> : null}
                          <button style={ui.danger} onClick={() => deleteStaff(s.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 ? <tr><td style={ui.empty} colSpan={5}>No staff found.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editing ? (
        <StaffEditModal
          staff={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSave={(payload) => saveStaff(editing.id, payload)}
          onProvisionLogin={() => provisionLogin(editing.id)}
        />
      ) : null}

      {invite ? (
        <div style={ui.overlay} onMouseDown={() => setInvite(null)}>
          <div style={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={ui.title}>Login Created</div>
            <div style={ui.notice}>{invite.note}</div>
            <div style={{ marginTop: 10 }}>{invite.name || "Staff member"}{invite.email ? ` • ${invite.email}` : ""}</div>
            {invite.actionLink ? <><input style={{ ...ui.search, width: "100%", marginTop: 12 }} readOnly value={invite.actionLink} /><button style={{ ...ui.primary, marginTop: 10 }} onClick={() => copy(invite.actionLink)}>Copy Invite Link</button></> : null}
            <div style={ui.actions}><button style={ui.ghost} onClick={() => setInvite(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ui = {
  page: { padding: 18, color: "white", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 },
  title: { fontSize: 20, fontWeight: 1000 },
  sub: { color: "#9CA3AF", fontSize: 12, marginTop: 4 },
  search: { height: 42, borderRadius: 12, padding: "8px 12px", background: "rgba(0,0,0,.35)", color: "white", border: "1px solid rgba(255,255,255,.15)", minWidth: 280, marginBottom: 12 },
  card: { borderRadius: 16, border: "1px solid rgba(255,255,255,.1)", background: "rgba(0,0,0,.25)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: 10, textAlign: "left", color: "#9CA3AF", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,.1)" },
  td: { padding: 10, borderBottom: "1px solid rgba(255,255,255,.08)", verticalAlign: "top" },
  muted: { color: "#9CA3AF", fontSize: 12, marginTop: 3 },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 8 },
  primary: { height: 38, borderRadius: 10, padding: "0 12px", border: 0, fontWeight: 900, cursor: "pointer" },
  ghost: { height: 38, borderRadius: 10, padding: "0 12px", border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.05)", color: "white", fontWeight: 900, cursor: "pointer" },
  danger: { height: 38, borderRadius: 10, padding: "0 12px", border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.12)", color: "white", fontWeight: 900, cursor: "pointer" },
  linked: { color: "#86efac", fontWeight: 900 },
  unlinked: { color: "#fca5a5", fontWeight: 900 },
  empty: { padding: 18, textAlign: "center", color: "#9CA3AF" },
  notice: { padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", padding: 16, zIndex: 10000 },
  modal: { width: "min(760px,100%)", padding: 16, borderRadius: 18, background: "#111", border: "1px solid rgba(255,255,255,.15)" },
};
