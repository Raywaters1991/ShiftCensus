const supabaseAdmin = require("../supabaseAdmin");

async function loadMembership(req) {
  if (req._adminAccessMembership !== undefined) return req._adminAccessMembership;

  const role = String(req.role || "").toLowerCase();
  if (role === "superadmin") {
    req._adminAccessMembership = { is_active: true, is_admin: true, can_manage_admins: true };
    return req._adminAccessMembership;
  }

  const userId = req.user?.id || req.userId;
  const orgId = req.orgId || req.org_id;
  if (!userId || !orgId) {
    req._adminAccessMembership = null;
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("org_memberships")
    .select("is_active,is_admin,can_manage_admins")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  req._adminAccessMembership = data || null;
  return req._adminAccessMembership;
}

async function requireOrgAdmin(req, res, next) {
  try {
    if (String(req.role || "").toLowerCase() === "superadmin") return next();
    const mem = await loadMembership(req);
    if (!mem || mem.is_active === false || !mem.is_admin) {
      return res.status(403).json({ error: "Organization admin permission required" });
    }
    return next();
  } catch (e) {
    console.error("ORG ADMIN ACCESS ERROR:", e);
    return res.status(500).json({ error: "Failed to verify admin access" });
  }
}

function requireOrgAdminForWrites(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();
  return requireOrgAdmin(req, res, next);
}

async function requireManageAdmins(req, res, next) {
  try {
    if (String(req.role || "").toLowerCase() === "superadmin") return next();
    const mem = await loadMembership(req);
    if (!mem || mem.is_active === false || !mem.can_manage_admins) {
      return res.status(403).json({ error: "Admin-management permission required" });
    }
    return next();
  } catch (e) {
    console.error("MANAGE ADMINS ACCESS ERROR:", e);
    return res.status(500).json({ error: "Failed to verify admin-management access" });
  }
}

module.exports = { requireOrgAdmin, requireOrgAdminForWrites, requireManageAdmins };
