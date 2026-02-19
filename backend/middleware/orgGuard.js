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

    if (!user) return res.status(401).json({ error: "Missing auth context" });

    const headerOrgIdRaw = req.headers["x-org-id"];
    const headerOrgCodeRaw = req.headers["x-org-code"];

    // ✅ only trust orgId if it's a UUID
    let orgId = headerOrgIdRaw && isUuid(String(headerOrgIdRaw)) ? String(headerOrgIdRaw) : "";
    let orgCode = headerOrgCodeRaw ? String(headerOrgCodeRaw).trim() : "";

    if (!orgId && !orgCode) {
      return res.status(400).json({ error: "Missing org context (x-org-id or x-org-code)" });
    }

    // Resolve org from orgCode if orgId missing
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

    // ✅ superadmin bypass
    if (role === "superadmin") {
      req.orgId = String(orgId);
      req.orgCode = orgCode || null;

      // compat
      req.org_id = req.orgId;
      req.org_code = req.orgCode;

      req.membershipRole = "superadmin";
      return next();
    }

    const { data: mem, error: memErr } = await supabase
      .from("org_memberships")
      .select("role, org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .single();

    if (memErr || !mem) return res.status(403).json({ error: "No access to this org" });

    if (!orgCode) {
      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("org_code")
        .eq("id", orgId)
        .single();

      if (orgErr || !org?.org_code) {
        return res.status(400).json({ error: "Invalid org (cannot resolve org_code)" });
      }
      orgCode = org.org_code;
    }

    req.orgId = String(orgId);
    req.orgCode = orgCode;
    req.membershipRole = mem.role;

    // compat
    req.org_id = req.orgId;
    req.org_code = req.orgCode;

    next();
  } catch (e) {
    console.error("requireOrg middleware error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireOrg };
