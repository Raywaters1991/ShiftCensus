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

// GET /api/adminmanagement/list?q=...
router.get("/list", async (req, res) => {
  const orgId = req.orgId;

  // Gate: only privileged roles for now (you can tighten later to can_manage_admins)
  if (!isPrivileged(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const q = String(req.query?.q || "").trim().toLowerCase();

  // Load memberships for org
  const { data: memberships, error: mErr } = await supabaseAdmin
    .from("org_memberships")
    .select(
      "user_id,org_id,role,is_active,is_admin,can_manage_admins,can_schedule_read,can_schedule_write,can_census_read,can_census_write,department_id,department_locked,created_at"
    )
    .eq("org_id", orgId);

  if (mErr) {
    console.error("ADMINMGMT LIST memberships ERROR:", mErr);
    return res.status(500).json({ error: "Failed to load memberships" });
  }

  // Load staff for org
  const { data: staff, error: sErr } = await supabaseAdmin
    .from("staff")
    .select("id,name,role,email,phone,department_id,user_id,org_id,org_code,employee_no")
    .eq("org_id", orgId);

  if (sErr) {
    console.error("ADMINMGMT LIST staff ERROR:", sErr);
    return res.status(500).json({ error: "Failed to load staff" });
  }

  const memByUser = new Map((memberships || []).map((m) => [String(m.user_id), m]));

  // Combine: prioritize staff rows, but include memberships even if no staff row exists
  const combined = [];

  (staff || []).forEach((st) => {
    const uid = st.user_id ? String(st.user_id) : null;
    const mem = uid ? memByUser.get(uid) : null;

    combined.push({
      // staff identity
      staff_id: st.id,
      staff_name: st.name,
      staff_role: st.role,
      email: st.email,
      phone: st.phone,
      staff_department_id: st.department_id ?? null,
      employee_no: st.employee_no ?? null,

      // membership identity
      user_id: st.user_id ?? null,
      membership: mem
        ? {
            ...mem,
            is_admin: mem.is_admin ?? false,
            can_manage_admins: mem.can_manage_admins ?? false,
            can_schedule_read: mem.can_schedule_read ?? false,
            can_schedule_write: mem.can_schedule_write ?? false,
            can_census_read: mem.can_census_read ?? false,
            can_census_write: mem.can_census_write ?? false,
            department_locked: mem.department_locked ?? false,
          }
        : null,
    });
  });

  // Add memberships not tied to staff
  (memberships || []).forEach((m) => {
    const uid = String(m.user_id);
    const already = combined.some((x) => String(x.user_id || "") === uid);
    if (already) return;

    combined.push({
      staff_id: null,
      staff_name: null,
      staff_role: null,
      email: null,
      phone: null,
      staff_department_id: null,
      employee_no: null,
      user_id: m.user_id,
      membership: {
        ...m,
        is_admin: m.is_admin ?? false,
        can_manage_admins: m.can_manage_admins ?? false,
        can_schedule_read: m.can_schedule_read ?? false,
        can_schedule_write: m.can_schedule_write ?? false,
        can_census_read: m.can_census_read ?? false,
        can_census_write: m.can_census_write ?? false,
        department_locked: m.department_locked ?? false,
      },
    });
  });

  const filtered = !q
    ? combined
    : combined.filter((x) => {
        const hay = [
          x.staff_name,
          x.staff_role,
          x.email,
          x.phone,
          x.employee_no,
          x.user_id,
          x.staff_id,
          x.membership?.role,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      });

  res.json({ memberships: filtered });
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

  // If is_admin is false, force all perms off
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
