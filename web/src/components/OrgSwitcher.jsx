// src/components/OrgSwitcher.jsx
import { useUser } from "../contexts/UserContext";

export default function OrgSwitcher({ onOrgChanged }) {
  const { orgMemberships, activeOrg, switchOrg } = useUser();

  if (!orgMemberships || orgMemberships.length <= 1) {
    return (
      <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
        {activeOrg?.org_code || "No Org"}
      </span>
    );
  }

  return (
    <select
      value={activeOrg?.id || ""}
      onChange={(e) => {
        const orgId = e.target.value;
        if (!orgId) return;
        if (String(orgId) === String(activeOrg?.id)) return;

        switchOrg(orgId);
        if (typeof onOrgChanged === "function") onOrgChanged(orgId);
      }}
      style={{
        padding: "6px 10px",
        borderRadius: "6px",
        background: "#1f2937",
        color: "white",
        border: "1px solid #374151",
        cursor: "pointer",
      }}
    >
      {orgMemberships.map((m) => (
        <option key={m.orgs.id} value={m.orgs.id}>
          {m.orgs.org_code}
        </option>
      ))}
    </select>
  );
}
