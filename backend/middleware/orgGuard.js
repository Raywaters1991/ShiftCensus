// backend/middleware/orgGuard.js
const supabase = require("../supabase");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

async function requireOrg(req, res, next) {
  try {
    const user = req.user;
    const role = String(req.role || "").toLowerCase();

    const headerOrgId = req.headers["x-org-id"];
    const headerOrgCode = req.headers["x-org-code"];

    if (!user) return res.status(401).json({ error: "Missing auth context" });

    let orgId = headerOrgId ? String(headerOrgId).trim() : "";
    let orgCode = headerOrgCode ? String(headerOrgCode).trim() : "";

    if (!orgId && !orgCode) {
      return res
        .status(400)
        .json({ error: "Missing org context (x-org-id or x-org-code)" });
    }

    // Resolve orgId from orgCode if needed
    if (!orgId && orgCode) {
      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("id, org_code")
        .eq("org_code", orgCode)
        .maybeSingle();

      if (orgErr) return res.status(500).json({ error: "Failed to resolve org" });
      if (!org?.id) return res.status(400).json({ error: "Invalid org code" });

      orgId = org.id;
      orgCode = org.org_code || orgCode;
    }

    if (orgId && !isUuid(orgId)) {
      return res.status(400).json({ error: "Invalid org id" });
    }

    // Resolve orgCode from orgId if needed
    if (orgId && !orgCode) {
      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("org_code")
        .eq("id", orgId)
        .maybeSingle();

      if (orgErr) return res.status(500).json({ error: "Failed to resolve org" });
      if (!org?.org_code) return res.status(400).json({ error: "Invalid org (cannot resolve org_code)" });

      orgCode = org.org_code;
    }

    // ✅ Superadmin bypass (global)
    if (role === "superadmin") {
      req.orgId = String(orgId);
      req.orgCode = orgCode || null;
      req.membershipRole = "superadmin";

      // ✅ Back-compat aliases
      req.org_id = req.orgId;
      req.org_code = req.orgCode;

      return next();
    }

    // ✅ Normal users: must be an active member of the org
    const { data: mem, error: memErr } = await supabase
      .from("org_memberships")
      .select("role, org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .single();

    if (memErr || !mem) {
      return res.status(403).json({ error: "No access to this org" });
    }

    req.orgId = String(orgId);
    req.orgCode = orgCode;
    req.membershipRole = mem.role;

    // ✅ Back-compat aliases
    req.org_id = req.orgId;
    req.org_code = req.orgCode;

    return next();
  } catch (e) {
    console.error("requireOrg middleware error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireOrg };
