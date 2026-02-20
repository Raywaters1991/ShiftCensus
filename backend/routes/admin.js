// backend/routes/admin.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");

/**
 * Prefer the app role that your requireAuth middleware sets (from profiles.role).
 * Fallback to auth metadata only if needed.
 */
function resolveAppRole(req) {
  const fromReq = req?.role ? String(req.role).toLowerCase() : "";
  if (fromReq) return fromReq;

  const user = req?.user;
  const meta = user?.app_metadata?.role || user?.user_metadata?.role || "";
  const lower = String(meta || "").toLowerCase();

  // Supabase default role isn't your app role
  if (!lower || lower === "authenticated") return null;

  return lower;
}

router.get("/profile", requireAuth, async (req, res) => {
  // ✅ prevent 304 cache causing stale role/org in UI
  res.set("Cache-Control", "no-store");

  try {
    const user = req.user;
    const role = resolveAppRole(req);

    const headerOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]).trim() : "";
    const headerOrgCode = req.headers["x-org-code"] ? String(req.headers["x-org-code"]).trim() : "";
    const metaOrgCode = user?.user_metadata?.org_code ? String(user.user_metadata.org_code).trim() : "";

    const profile = {
      email: user.email,
      uid: user.id,
      role, // ✅ will now be "superadmin" if profiles.role says so
      org_code: null,
      org_name: null,
      org_logo: null,
    };

    // If the client sent org context, resolve org display info
    const shouldLookupOrg = !!headerOrgId || !!headerOrgCode || !!metaOrgCode;

    if (shouldLookupOrg) {
      let query = supabaseAdmin.from("orgs").select("id, org_code, name, logo_url");

      if (headerOrgId) query = query.eq("id", headerOrgId).maybeSingle();
      else if (headerOrgCode) query = query.eq("org_code", headerOrgCode).maybeSingle();
      else query = query.eq("org_code", metaOrgCode).maybeSingle();

      const { data: org, error } = await query;

      if (!error && org?.id) {
        profile.org_code = org.org_code || null;
        profile.org_name = org.name || null;
        profile.org_logo = org.logo_url || null;
      } else {
        // If lookup fails, at least echo what we were given
        profile.org_code = headerOrgCode || metaOrgCode || null;
      }
    }

    return res.json(profile);
  } catch (err) {
    console.error("ADMIN /profile ERROR:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

module.exports = router;
