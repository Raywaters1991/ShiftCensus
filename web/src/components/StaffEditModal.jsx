import { useEffect, useState } from "react";

export default function StaffEditModal({
  staff,
  departments,
  onClose,
  onSave,
  onProvisionLogin,
  mode = "edit",
}) {
  const isCreate = mode === "create";
  const [form, setForm] = useState({ name: "", role: "", email: "", phone: "", department_id: "" });
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    if (!staff && !isCreate) return;
    setForm({
      name: staff?.name || "",
      role: staff?.role || "",
      email: staff?.email || "",
      phone: staff?.phone || "",
      department_id: staff?.department_id || "",
    });
  }, [staff, isCreate]);

  if (!staff && !isCreate) return null;

  async function save() {
    const payload = {
      name: String(form.name || "").trim(),
      role: String(form.role || "").trim(),
      email: String(form.email || "").trim() || null,
      phone: String(form.phone || "").trim() || null,
      department_id: form.department_id || null,
    };
    if (!payload.name || !payload.role) return alert("Name and role are required.");
    setSaving(true);
    try {
      await onSave?.(payload);
      onClose?.();
    } finally {
      setSaving(false);
    }
  }

  async function provision() {
    const email = String(form.email || "").trim();
    if (!email) return alert("Add and save an email address before creating a login.");
    setProvisioning(true);
    try {
      await onProvisionLogin?.();
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div style={ui.overlay} onMouseDown={() => onClose?.()}>
      <div style={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={ui.title}>{isCreate ? "Add Staff Member" : "Edit Staff Member"}</div>
        <div style={ui.grid}>
          <label style={ui.label}>Name<input style={ui.input} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
          <label style={ui.label}>Role<input style={ui.input} value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} /></label>
          <label style={ui.label}>Department<select style={ui.input} value={form.department_id} onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}><option value="">No department</option>{(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active === false ? " (inactive)" : ""}</option>)}</select></label>
          <label style={ui.label}>Email<input style={ui.input} type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></label>
          <label style={ui.label}>Phone<input style={ui.input} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
        </div>

        {isCreate ? (
          <div style={ui.notice}>If you enter an email address, ShiftCensus will create a login and generate a set-password invite when the staff member is added.</div>
        ) : !staff?.user_id ? (
          <div style={ui.notice}>This staff record does not have a ShiftCensus login yet. Save any email changes first, then use Create Login / Send Invite.</div>
        ) : (
          <div style={ui.good}>Login linked.</div>
        )}

        <div style={ui.actions}>
          {!isCreate && !staff?.user_id ? <button style={ui.secondary} disabled={provisioning} onClick={provision}>{provisioning ? "Creating…" : "Create Login / Send Invite"}</button> : null}
          <button style={ui.ghost} onClick={() => onClose?.()} disabled={saving || provisioning}>Cancel</button>
          <button style={ui.primary} onClick={save} disabled={saving || provisioning}>{saving ? "Saving…" : isCreate ? "Add Staff" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

const ui = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", padding: 16, zIndex: 10000 },
  modal: { width: "min(700px,100%)", borderRadius: 18, padding: 18, background: "#111", border: "1px solid rgba(255,255,255,.15)", color: "white" },
  title: { fontSize: 18, fontWeight: 900, marginBottom: 14 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 },
  label: { display: "grid", gap: 6, fontSize: 12, color: "#cbd5e1" },
  input: { height: 42, borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)", color: "white" },
  notice: { marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.25)", fontSize: 12 },
  good: { marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(34,197,94,.10)", border: "1px solid rgba(34,197,94,.25)", fontSize: 12 },
  actions: { marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },
  primary: { height: 40, borderRadius: 12, padding: "0 14px", border: 0, fontWeight: 900, cursor: "pointer" },
  secondary: { height: 40, borderRadius: 12, padding: "0 14px", border: "1px solid rgba(59,130,246,.35)", background: "rgba(59,130,246,.12)", color: "white", fontWeight: 900, cursor: "pointer" },
  ghost: { height: 40, borderRadius: 12, padding: "0 14px", border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.05)", color: "white", fontWeight: 900, cursor: "pointer" },
};
