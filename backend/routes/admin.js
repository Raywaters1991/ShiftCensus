const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

function pickRole(user) {
  const r =
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    null;

  if (!r) return null;
  const lower = String(r).toLowerCase();
  // Supabase default "authenticated" isn't an app role
  if (lower === "authenticated") return null;
  return lower;
}

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const user = req.user;

    const role = pickRole(user);

    // For non-superadmins, you may still have a "home org" in metadata,
    // but we prefer the actively selected org via headers if provided.
    const headerOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]) : null;
    const headerOrgCode = req.headers["x-org-code"] ? String(req.headers["x-org-code"]) : null;

    const metaOrgCode = user?.user_metadata?.org_code ? String(user.user_metadata.org_code) : null;

    const profile = {
      email: user.email,
      uid: user.id,
      role,               // ✅ FIXED: superadmin will now show up here
      org_code: null,
      org_name: null,
      org_logo: null,
    };

    // SUPERADMIN: don't force an org. Just echo selected org if headers provided.
    // Non-superadmin: allow either header selection or metadata org_code.
    const shouldLookupOrg =
      !!headerOrgId ||
      !!headerOrgCode ||
      (!!metaOrgCode && role !== "superadmin");

    if (shouldLookupOrg) {
      let query = supabase.from("orgs").select("id, org_code, name, logo_url");

      if (headerOrgId) query = query.eq("id", headerOrgId).maybeSingle();
      else if (headerOrgCode) query = query.eq("org_code", headerOrgCode).maybeSingle();
      else query = query.eq("org_code", metaOrgCode).maybeSingle();

      const { data: org, error } = await query;

      if (!error && org?.id) {
        profile.org_code = org.org_code;
        profile.org_name = org.name;
        profile.org_logo = org.logo_url;
      }
    } else {
      // fallback to metadata org_code if present (optional)
      if (metaOrgCode) profile.org_code = metaOrgCode;
    }

    return res.json(profile);
  } catch (err) {
    console.error("ADMIN /profile ERROR:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

module.exports = router;
