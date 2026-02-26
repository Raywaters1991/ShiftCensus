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

// GET /api/adminmanagement/list?q=
router.get("/list", async (req, res) => {
  const orgId = req.orgId;
  const q = String(req.query.q || "").trim().toLowerCase();

  try {
    if (!isPrivileged(req.role)) {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const { data: memberships, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true);

    if (memErr) throw memErr;
    if (!memberships?.length) return res.json({ memberships: [] });

    const userIds = memberships.map((m) => m.user_id);

    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id,name,role,email,phone,department_id,user_id,employee_no")
      .in("user_id", userIds)
      .eq("org_id", orgId);

    if (staffErr) throw staffErr;

    const staffByUser = new Map((staffRows || []).map((s) => [String(s.user_id), s]));

    const rows = memberships.map((m) => {
      const s = staffByUser.get(String(m.user_id));
      return {
        user_id: m.user_id,
        staff_id: s?.id ?? null,
        staff_name: s?.name ?? "—",
        staff_role: s?.role ?? "—",
        staff_department_id: s?.department_id ?? null,
        email: s?.email ?? null,
        phone: s?.phone ?? null,
        employee_no: s?.employee_no ?? null,
        membership: m,
      };
    });

    const filtered = q
      ? rows.filter((r) => {
          const hay = `${r.staff_name} ${r.staff_role} ${r.email || ""} ${r.phone || ""} ${
            r.employee_no || ""
          }`.toLowerCase();
          return hay.includes(q);
        })
      : rows;

    res.json({ memberships: filtered });
  } catch (err) {
    console.error("ADMIN LIST ERROR:", err);
    res.status(500).json({ error: "Failed to load memberships" });
  }
});

// PATCH /api/adminmanagement/:userId
router.patch("/:userId", async (req, res) => {
  const orgId = req.orgId;
  const userId = String(req.params.userId || "").trim();

  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (!isPrivileged(req.role)) return res.status(403).json({ error: "Insufficient role" });

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
  if (!data) return res.status(404).json({ error: "Membership not found for this org/user" });

  res.json({ membership: data });
});

module.exports = router;
