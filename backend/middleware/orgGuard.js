// backend/middleware/orgGuard.js
const supabaseAdmin = require("../supabaseAdmin");

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
      return res.status(400).json({ error: "Missing org context (x-org-id or x-org-code)" });
    }

    if (orgId && !isUuid(orgId)) {
      return res.status(400).json({ error: "Invalid org id" });
    }

    // Resolve a single canonical organization from whichever header(s) were
    // supplied. If both are present they MUST refer to the same row. This
    // prevents a caller from passing an allowed org id with another facility's
    // org code and bypassing org_code-scoped legacy routes.
    let orgQuery = supabaseAdmin.from("orgs").select("id, org_code");
    if (orgId) orgQuery = orgQuery.eq("id", orgId);
    if (orgCode) orgQuery = orgQuery.eq("org_code", orgCode);

    const { data: org, error: orgErr } = await orgQuery.maybeSingle();
    if (orgErr) return res.status(500).json({ error: "Failed to resolve org" });
    if (!org?.id || !org?.org_code) {
      return res.status(400).json({ error: "Invalid or mismatched org context" });
    }

    orgId = String(org.id);
    orgCode = String(org.org_code);

    // Superadmins may select any valid org without requiring a membership row.
    if (role === "superadmin") {
      req.orgId = orgId;
      req.orgCode = orgCode;

      // legacy aliases (older routes use these)
      req.org_id = req.orgId;
      req.org_code = req.orgCode;

      req.membershipRole = "superadmin";
      return next();
    }

    // Membership check (service role to avoid RLS recursion)
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select("role, org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();

    if (memErr || !mem) return res.status(403).json({ error: "No access to this org" });

    req.orgId = orgId;
    req.orgCode = orgCode;

    // legacy aliases
    req.org_id = req.orgId;
    req.org_code = req.orgCode;

    req.membershipRole = mem.role || null;

    next();
  } catch (e) {
    console.error("requireOrg middleware error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireOrg };
