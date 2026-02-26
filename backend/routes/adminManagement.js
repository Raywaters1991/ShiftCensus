// backend/routes/adminManagement.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

function isPrivileged(role) {
  const r = String(role || "").toLowerCase();
  return ["superadmin", "admin", "don", "ed"].includes(r);
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

// GET /api/adminmanagement/list
// ✅ Returns ALL staff for the org + membership overlay (if staff.user_id exists)
router.get("/list", async (req, res) => {
  const orgId = req.orgId;
  const orgCode = req.orgCode; // should be set by requireOrg
  const q = String(req.query.q || "").trim().toLowerCase();

  try {
    // 1) Load staff for org (prefer org_id, but fall back to org_code since org_id may be null on older rows)
    let staffQuery = supabaseAdmin.from("staff").select("*");

    if (orgId && orgCode) {
      // OR filter: org_id = orgId OR org_code = orgCode
      staffQuery = staffQuery.or(`org_id.eq.${orgId},org_code.eq.${orgCode}`);
    } else if (orgId) {
      staffQuery = staffQuery.eq("org_id", orgId);
    } else if (orgCode) {
      staffQuery = staffQuery.eq("org_code", orgCode);
    }

    const { data: staffRows, error: staffErr } = await staffQuery.order("name", { ascending: true });
    if (staffErr) throw staffErr;

    // 2) Load memberships for org
    const { data: memberships, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true);

    if (memErr) throw memErr;

    const membershipByUser = new Map(
      (memberships || []).map((m) => [String(m.user_id), m])
    );

    // 3) Build rows for UI
    let rows = (staffRows || []).map((s) => {
      const mem = s.user_id ? membershipByUser.get(String(s.user_id)) : null;

      return {
        user_id: s.user_id || null,
        staff_id: s.id,
        staff_name: s.name || "—",
        staff_role: s.role || "—",
        staff_department_id: s.department_id || null,
        email: s.email || null,
        phone: s.phone || null,
        employee_no: s.employee_no || null,
        membership: mem || {
          user_id: s.user_id || null,
          org_id: orgId,
          role: "staff",
          is_active: true,
          is_admin: false,
          can_manage_admins: false,
          can_schedule_read: false,
          can_schedule_write: false,
          can_census_read: false,
          can_census_write: false,
          department_id: null,
          department_locked: false,
        },
      };
    });

    // 4) Search filter
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.staff_name} ${r.staff_role} ${r.email || ""} ${r.phone || ""} ${r.employee_no || ""}`
          .toLowerCase();
        return hay.includes(q);
      });
    }

    res.json({ memberships: rows });
  } catch (err) {
    console.error("ADMIN LIST ERROR:", err);
    res.status(500).json({ error: "Failed to load staff settings list" });
  }
});

// PATCH /api/adminmanagement/:userId
router.patch("/:userId", async (req, res) => {
  const orgId = req.orgId;
  const userId = String(req.params.userId || "").trim();

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  if (!isPrivileged(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const patch = req.body || {};
  const is_admin = toBool(patch.is_admin, false);

  const payload = {
    is_admin,
    can_manage_admins: is_admin ? toBool(patch.can_manage_admins, false) : false,
    can_schedule_read: is_admin ? toBool(patch.can_schedule_read, false) : false,
    can_schedule_write: is_admin ? toBool(patch.can_schedule_write, false) : false,
    can_census_read: is_admin ? toBool(patch.can_census_read, false) : false,
    can_census_write: is_admin ? toBool(patch.can_census_write, false) : false,
    department_id: patch.department_id ? String(patch.department_id) : null,
    department_locked: toBool(patch.department_locked, false),
  };

  const { data, error } = await supabaseAdmin
    .from("org_memberships")
    .update(payload)
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select(
      "user_id,org_id,role,is_active,is_admin,can_manage_admins,can_schedule_read,can_schedule_write,can_census_read,can_census_write,department_id,department_locked,created_at"
    )
    .maybeSingle();

  if (error) {
    console.error("ADMINMGMT PATCH ERROR:", error);
    return res.status(500).json({ error: "Failed to update membership" });
  }

  if (!data) {
    return res.status(404).json({ error: "Membership not found for this org/user" });
  }

  res.json({ membership: data });
});

module.exports = router;
