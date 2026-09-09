// src/components/OrgSwitcher.jsx
import { useMemo } from "react";
import { useUser } from "../contexts/UserContext";

export default function OrgSwitcher({ open, onClose, onOrgChanged }) {
  const { orgMemberships, activeOrg, switchOrg, isSuperadmin } = useUser();

  const list = useMemo(() => {
    return (orgMemberships || [])
      .map((m) => ({
        role: m.role,
        id: m.orgs?.id,
        code: m.orgs?.org_code,
        name: m.orgs?.name,
        logo_url: m.orgs?.logo_url || null,
      }))
      .filter((o) => o.id);
  }, [orgMemberships]);

  async function chooseOrg(orgId) {
    if (!orgId || String(orgId) === String(activeOrg?.id || "")) return;
    await switchOrg(orgId);
    onOrgChanged?.();
    onClose?.();
  }

  // When no explicit `open` prop is supplied, render the compact selector used
  // inside the global menu. For superadmins this list represents every facility
  // they can impersonate/support; it does not make them a facility employee.
  if (open === undefined) {
    if (list.length === 0) {
      return <div style={ui.inlineEmpty}>No facilities available</div>;
    }

    return (
      <select
        value={activeOrg?.id || ""}
        onChange={(e) => chooseOrg(e.target.value)}
        style={ui.select}
        aria-label={isSuperadmin ? "Act as facility" : "Organization"}
      >
        <option value="" disabled>
          {isSuperadmin ? "Choose facility" : "Choose organization"}
        </option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name || o.code || "Unnamed facility"}
          </option>
        ))}
      </select>
    );
  }

  if (!open) return null;

  return (
    <div
      style={ui.overlay}
      onMouseDown={() => onClose?.()}
      role="dialog"
      aria-modal="true"
    >
      <div style={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={ui.title}>{isSuperadmin ? "Act as Facility" : "Choose Facility"}</div>
        <div style={ui.sub}>
          {isSuperadmin
            ? "Select the facility you want to view and manage as the developer superadmin."
            : "Switch the active organization for Units, Staff, Rooms, and other facility data."}
        </div>

        <div style={ui.list}>
          {list.map((o) => {
            const isActive = String(activeOrg?.id) === String(o.id);
            return (
              <button
                key={o.id}
                type="button"
                style={ui.row(isActive)}
                onClick={() => chooseOrg(o.id)}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div style={ui.logoBox}>
                    {o.logo_url ? (
                      <img src={o.logo_url} alt="" style={ui.logoImg} />
                    ) : (
                      <div style={ui.logoFallback}>{(o.code || "SC").slice(0, 2)}</div>
                    )}
                  </div>

                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={ui.name}>
                      {o.name || "Unnamed Org"}{" "}
                      {isActive ? <span style={ui.activePill}>Active</span> : null}
                    </div>
                    <div style={ui.meta}>
                      <span style={{ opacity: 0.9 }}>{o.code}</span>
                      <span style={{ opacity: 0.5, margin: "0 8px" }}>•</span>
                      <span style={{ opacity: 0.75 }}>{String(o.role || "").toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {list.length === 0 ? (
            <div style={ui.empty}>No facilities available for this account.</div>
          ) : null}
        </div>

        <div style={ui.actions}>
          <button style={ui.btnGhost} onClick={() => onClose?.()} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const ui = {
  select: {
    width: "100%",
    minWidth: 190,
    height: 40,
    borderRadius: 12,
    padding: "0 10px",
    background: "var(--surface-glass)",
    color: "var(--nav-text)",
    border: "1px solid var(--border)",
    fontWeight: 800,
    outline: "none",
  },
  inlineEmpty: {
    color: "var(--nav-text)",
    opacity: 0.65,
    fontSize: 12,
    textAlign: "right",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal: {
    width: "min(860px, 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.9)",
    boxShadow: "0 30px 120px rgba(0,0,0,0.75)",
    padding: 16,
  },
  title: { color: "white", fontWeight: 1000, fontSize: 18 },
  sub: { color: "#9CA3AF", marginTop: 6, fontSize: 13, lineHeight: 1.35 },
  list: { display: "grid", gap: 10, marginTop: 14, maxHeight: "60vh", overflow: "auto" },
  row: (active) => ({
    width: "100%",
    textAlign: "left",
    borderRadius: 16,
    padding: 12,
    border: active ? "1px solid rgba(255,255,255,0.26)" : "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
    cursor: "pointer",
  }),
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    flex: "0 0 auto",
  },
  logoImg: { width: "100%", height: "100%", objectFit: "contain" },
  logoFallback: { color: "white", fontWeight: 1000, opacity: 0.9 },
  name: { color: "white", fontWeight: 1000, fontSize: 14, display: "flex", gap: 10, alignItems: "center" },
  meta: { color: "#9CA3AF", marginTop: 4, fontSize: 12 },
  activePill: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(34,197,94,0.35)",
    background: "rgba(34,197,94,0.12)",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
  },
  empty: { color: "#9CA3AF", padding: 14, textAlign: "center" },
  actions: { display: "flex", justifyContent: "flex-end", marginTop: 14 },
  btnGhost: {
    height: 40,
    borderRadius: 14,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    fontWeight: 900,
  },
};
