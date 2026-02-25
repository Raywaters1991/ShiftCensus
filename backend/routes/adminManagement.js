// backend/routes/adminManagement.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

// -----------------------------
// helpers
// -----------------------------
function pickAllowedPatch(body) {
  const b = body || {};
  const out = {};

  // allow these fields to be changed by admin managers
  const allowed = [
    "role",
    "is_active",
    "is_admin",
    "can_manage_admins",
    "can_schedule_read",
    "can_schedule_write",
    "can_census_read",
    "can_census_write",
    "department_id",
    "department_locked",
  ];

  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
  }

  // normalize empties
  if (out.department_id === "") out.department_id = null;

  return out;
}

async function canManageAdmins(req) {
  // superadmin always allowed
  if (String(req.role || "").toLowerCase() === "superadmin") return true;

  // check the caller’s membership flag in THIS org
  const orgId = req.orgId;
  const userId = req.user?.id;
  if (!orgId || !userId) return false;

  const { data, error } = await supabaseAdmin
    .from("org_memberships")
    .select("can_manage_admins, is_admin, role, is_active")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  if (data.is_active === false) return false;

  return !!data.can_manage_admins || !!data.is_admin || ["admin", "don", "ed"].includes(String(data.role || "").toLowerCase());
}

// -----------------------------
// middleware
// -----------------------------
router.use(requireAuth);
router.use(requireOrg);

// =====================================================
// GET /list  -> memberships + staff info (org-scoped)
// =====================================================
router.get("/list", async (req, res) => {
  try {
    const ok = await canManageAdmins(req);
    if (!ok) return res.status(403).json({ error: "Not allowed" });

    const orgId = req.orgId;
    const orgCode = req.orgCode || req.org_code;
    if (!orgId) return res.status(400).json({ error: "Missing orgId (orgGuard)" });

    // 1) memberships
    const { data: mems, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select(
        [
          "user_id",
          "org_id",
          "role",
          "is_active",
          "is_admin",
          "can_manage_admins",
          "can_schedule_read",
          "can_schedule_write",
          "can_census_read",
          "can_census_write",
          "department_id",
          "department_locked",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (memErr) {
      console.error("ADMIN MGMT LIST memberships error:", memErr);
      return res.status(500).json({ error: "Failed to load memberships" });
    }

    const memberships = Array.isArray(mems) ? mems : [];
    const userIds = memberships.map((m) => m.user_id).filter(Boolean);

    // 2) staff rows for those users (best-effort)
    let staffRows = [];
    if (userIds.length && orgCode) {
      const { data: st, error: stErr } = await supabaseAdmin
        .from("staff")
        .select("id, user_id, name, role, email, phone, department_id")
        .eq("org_code", orgCode)
        .in("user_id", userIds);

      if (stErr) {
        console.warn("ADMIN MGMT LIST staff join warn:", stErr);
      } else {
        staffRows = Array.isArray(st) ? st : [];
      }
    }

    const staffByUser = new Map(staffRows.map((s) => [String(s.user_id), s]));

    // 3) normalize to what AdminPage expects:
    // - expose `id` (use user_id as stable identifier within org)
    const enriched = memberships.map((m) => {
      const st = staffByUser.get(String(m.user_id)) || null;

      return {
        id: m.user_id, // ✅ important: frontend uses m.id as membership id
        user_id: m.user_id,
        org_id: m.org_id,

        role: m.role,
        is_active: m.is_active,
        is_admin: m.is_admin,
        can_manage_admins: m.can_manage_admins,
        can_schedule_read: m.can_schedule_read,
        can_schedule_write: m.can_schedule_write,
        can_census_read: m.can_census_read,
        can_census_write: m.can_census_write,

        department_id: m.department_id ?? st?.department_id ?? null,
        department_locked: m.department_locked,

        staff_name: st?.name || null,
        staff_role: st?.role || null,
        email: st?.email || null,
        phone: st?.phone || null,

        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    });

    return res.json({ memberships: enriched });
  } catch (e) {
    console.error("ADMIN MGMT LIST ERROR:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// PATCH /:id  (id = user_id)
// =====================================================
router.patch("/:id", async (req, res) => {
  try {
    const ok = await canManageAdmins(req);
    if (!ok) return res.status(403).json({ error: "Not allowed" });

    const orgId = req.orgId;
    const orgCode = req.orgCode || req.org_code;
    const userId = String(req.params.id || "").trim();

    if (!orgId) return res.status(400).json({ error: "Missing orgId (orgGuard)" });
    if (!userId) return res.status(400).json({ error: "Missing user id" });

    const patch = pickAllowedPatch(req.body);

    // if turning off admin, force off manage_admins
    if (Object.prototype.hasOwnProperty.call(patch, "is_admin") && !patch.is_admin) {
      patch.can_manage_admins = false;
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("org_memberships")
      .update(patch)
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .select()
      .single();

    if (upErr) {
      console.error("ADMIN MGMT PATCH ERROR:", upErr);
      return res.status(500).json({ error: "Failed to update membership" });
    }

    // best-effort include staff display info
    let staff = null;
    if (orgCode) {
      const { data: st } = await supabaseAdmin
        .from("staff")
        .select("name, role, email, phone, department_id")
        .eq("org_code", orgCode)
        .eq("user_id", userId)
        .maybeSingle();

      staff = st || null;
    }

    return res.json({
      membership: {
        id: updated.user_id,
        user_id: updated.user_id,
        org_id: updated.org_id,
        role: updated.role,
        is_active: updated.is_active,
        is_admin: updated.is_admin,
        can_manage_admins: updated.can_manage_admins,
        can_schedule_read: updated.can_schedule_read,
        can_schedule_write: updated.can_schedule_write,
        can_census_read: updated.can_census_read,
        can_census_write: updated.can_census_write,
        department_id: updated.department_id ?? staff?.department_id ?? null,
        department_locked: updated.department_locked,
        staff_name: staff?.name || null,
        staff_role: staff?.role || null,
        email: staff?.email || null,
        phone: staff?.phone || null,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (e) {
    console.error("ADMIN MGMT PATCH ERROR:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
