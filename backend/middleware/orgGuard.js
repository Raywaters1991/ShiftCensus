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
    if (!orgId && !orgCode) return res.status(400).json({ error: "Missing org context (x-org-id or x-org-code)" });
    if (orgId && !isUuid(orgId)) return res.status(400).json({ error: "Invalid org id" });

    let orgQuery = supabaseAdmin.from("orgs").select("id, org_code");
    if (orgId) orgQuery = orgQuery.eq("id", orgId);
    if (orgCode) orgQuery = orgQuery.eq("org_code", orgCode);

    const { data: org, error: orgErr } = await orgQuery.maybeSingle();
    if (orgErr) return res.status(500).json({ error: "Failed to resolve org" });
    if (!org?.id || !org?.org_code) return res.status(400).json({ error: "Invalid or mismatched org context" });

    orgId = String(org.id);
    orgCode = String(org.org_code);

    req.orgId = orgId;
    req.orgCode = orgCode;
    req.org_id = orgId;
    req.org_code = orgCode;

    if (role === "superadmin") {
      req.membershipRole = "superadmin";
      req.orgMembership = null;
      return next();
    }

    // Verify membership once and retain the verified row only for this request.
    // Downstream permission middleware can reuse it without weakening revocation behavior
    // across requests or introducing any cross-user cache.
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select("role, org_id, is_active, is_admin, can_manage_admins, can_dashboard_read, can_schedule_read, can_schedule_write, can_census_read, can_census_write, department_id, department_locked")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();

    if (memErr || !mem) return res.status(403).json({ error: "No access to this org" });

    req.membershipRole = mem.role || null;
    req.orgMembership = mem;
    return next();
  } catch (e) {
    console.error("requireOrg middleware error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireOrg };
