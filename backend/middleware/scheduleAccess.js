const supabaseAdmin = require("../supabaseAdmin");

async function requireScheduleAccess(req, res, next) {
  try {
    const role = String(req.role || "").toLowerCase();
    if (role === "superadmin") return next();

    const userId = req.user?.id || req.userId;
    const orgId = req.orgId || req.org_id;
    if (!userId || !orgId) return res.status(401).json({ error: "Missing auth or org context" });

    // Prefer the membership row already verified by requireOrg for this same request.
    // Fall back to a fresh lookup only if this middleware is ever used without it.
    let membership = req.orgMembership || null;
    if (!membership) {
      const { data, error } = await supabaseAdmin
        .from("org_memberships")
        .select("is_active, can_schedule_read, can_schedule_write")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) {
        console.error("SCHEDULE ACCESS LOOKUP ERROR:", error);
        return res.status(500).json({ error: "Failed to verify schedule access" });
      }
      membership = data;
    }

    if (!membership || membership.is_active === false) return res.status(403).json({ error: "No access to this organization" });

    const method = String(req.method || "GET").toUpperCase();
    const write = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (write && !membership.can_schedule_write) return res.status(403).json({ error: "Schedule write permission required" });
    if (!write && !membership.can_schedule_read && !membership.can_schedule_write) return res.status(403).json({ error: "Schedule read permission required" });

    req.schedulePermissions = {
      canRead: !!membership.can_schedule_read || !!membership.can_schedule_write,
      canWrite: !!membership.can_schedule_write,
    };
    return next();
  } catch (e) {
    console.error("requireScheduleAccess middleware error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = { requireScheduleAccess };
