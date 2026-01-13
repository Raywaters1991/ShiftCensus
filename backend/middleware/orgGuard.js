// backend/middleware/orgGuard.js
const supabase = require("../supabase");

async function requireOrg(req, res, next) {
  try {
    const user = req.user;
    const orgId = req.headers["x-org-id"];

    if (!user) return res.status(401).json({ error: "Missing auth context" });
    if (!orgId) return res.status(400).json({ error: "Missing org context (x-org-id)" });

    const isSuperAdmin = user?.app_metadata?.role === "superadmin";
    if (isSuperAdmin) {
      req.orgId = String(orgId);
      req.role = "superadmin";

      // try to resolve org_code if possible (non-fatal)
      const { data: org } = await supabase.from("orgs").select("org_code").eq("id", orgId).maybeSingle();
      req.org_code = org?.org_code || null;

      return next();
    }

    // confirm membership + role
    const { data: mem, error: memErr } = await supabase
      .from("org_memberships")
      .select("role, org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .single();

    if (memErr || !mem) return res.status(403).json({ error: "No access to this org" });

    // load org_code
    const { data: org, error: orgErr } = await supabase
      .from("orgs")
      .select("org_code")
      .eq("id", orgId)
      .single();

    if (orgErr || !org?.org_code) {
      return res.status(400).json({ error: "Invalid org (cannot resolve org_code)" });
    }

    req.orgId = String(orgId);
    req.org_code = org.org_code;
    req.role = mem.role;

    next();
  } catch (e) {
    console.error("requireOrg middleware error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireOrg };
