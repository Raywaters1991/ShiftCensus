// backend/routes/admin.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");

function resolveAppRole(req) {
  const fromReq = req?.role ? String(req.role).toLowerCase() : "";
  if (fromReq) return fromReq;
  const user = req?.user;
  const meta = user?.app_metadata?.role || user?.user_metadata?.role || "";
  const lower = String(meta || "").toLowerCase();
  if (!lower || lower === "authenticated") return null;
  return lower;
}

router.get("/profile", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const user = req.user;
    const role = resolveAppRole(req);
    const superadmin = role === "superadmin";

    const headerOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]).trim() : "";
    const headerOrgCode = req.headers["x-org-code"] ? String(req.headers["x-org-code"]).trim() : "";
    const metaOrgCode = user?.user_metadata?.org_code ? String(user.user_metadata.org_code).trim() : "";

    const { data: profileRow } = await supabaseAdmin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    let displayName = profileRow?.full_name || null;
    if (!displayName) {
      let staffQuery = supabaseAdmin.from("staff").select("name,org_code").eq("user_id", user.id);
      if (headerOrgCode) staffQuery = staffQuery.eq("org_code", headerOrgCode);
      const { data: staffRows } = await staffQuery.limit(1);
      displayName = staffRows?.[0]?.name || null;
    }

    const profile = {
      email: user.email,
      uid: user.id,
      role,
      full_name: displayName,
      org_code: null,
      org_name: null,
      org_logo: null,
    };

    const shouldLookupOrg = !!headerOrgId || !!headerOrgCode || !!metaOrgCode;
    if (!shouldLookupOrg) return res.json(profile);

    let query = supabaseAdmin.from("orgs").select("id, org_code, name, logo_url");
    if (headerOrgId) query = query.eq("id", headerOrgId).maybeSingle();
    else if (headerOrgCode) query = query.eq("org_code", headerOrgCode).maybeSingle();
    else query = query.eq("org_code", metaOrgCode).maybeSingle();

    const { data: org, error } = await query;
    if (error || !org?.id) return res.json(profile);

    if (!superadmin) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("org_memberships")
        .select("org_id,is_active")
        .eq("user_id", user.id)
        .eq("org_id", org.id)
        .eq("is_active", true)
        .maybeSingle();

      if (membershipError) {
        console.error("ADMIN /profile membership lookup error:", membershipError);
        return res.status(500).json({ error: "Failed to verify organization access" });
      }

      if (!membership) {
        if (headerOrgId || headerOrgCode) return res.status(403).json({ error: "No access to this organization" });
        return res.json(profile);
      }
    }

    profile.org_code = org.org_code || null;
    profile.org_name = org.name || null;
    profile.org_logo = org.logo_url || null;
    return res.json(profile);
  } catch (err) {
    console.error("ADMIN /profile ERROR:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

module.exports = router;
