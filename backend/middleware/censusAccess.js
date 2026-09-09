const supabaseAdmin = require("../supabaseAdmin");

async function requireCensusAccess(req, res, next) {
  try {
    const role = String(req.role || "").toLowerCase();
    if (role === "superadmin") return next();

    const orgId = req.orgId || req.org_id || null;
    const userId = req.userId || req.user?.id || null;
    if (!orgId || !userId) return res.status(403).json({ error: "CENSUS_FORBIDDEN", message: "No Census access for this organization." });

    const { data, error } = await supabaseAdmin
      .from("org_memberships")
      .select("can_census_read, can_census_write, is_active")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("CENSUS ACCESS ERROR:", error);
      return res.status(500).json({ error: "CENSUS_ACCESS_CHECK_FAILED" });
    }

    const canRead = !!data?.can_census_read || !!data?.can_census_write;
    const canWrite = !!data?.can_census_write;
    const isMutation = !["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase());

    if (isMutation && !canWrite) {
      return res.status(403).json({
        error: "CENSUS_WRITE_REQUIRED",
        message: "Census Write permission is required to make changes.",
      });
    }

    if (!isMutation && !canRead) {
      return res.status(403).json({
        error: "CENSUS_READ_REQUIRED",
        message: "Census Read permission is required to view the census.",
      });
    }

    req.censusPermissions = { canRead, canWrite };
    return next();
  } catch (e) {
    console.error("CENSUS ACCESS MIDDLEWARE ERROR:", e);
    return res.status(500).json({ error: "CENSUS_ACCESS_CHECK_FAILED" });
  }
}

module.exports = { requireCensusAccess };
