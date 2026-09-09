// backend/routes/staff.js
const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const crypto = require("crypto");

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function accessForStaffRole(staffRole) {
  const key = normalizeRole(staffRole);

  if (["admin", "administrator"].includes(key)) {
    return {
      role: "admin",
      is_admin: true,
      can_manage_admins: true,
      can_schedule_read: true,
      can_schedule_write: true,
      can_census_read: true,
      can_census_write: true,
    };
  }

  if (["don", "directorofnursing"].includes(key)) {
    return {
      role: "don",
      is_admin: true,
      can_manage_admins: true,
      can_schedule_read: true,
      can_schedule_write: true,
      can_census_read: true,
      can_census_write: true,
    };
  }

  if (["ed", "executivedirector"].includes(key)) {
    return {
      role: "ed",
      is_admin: true,
      can_manage_admins: true,
      can_schedule_read: true,
      can_schedule_write: true,
      can_census_read: true,
      can_census_write: true,
    };
  }

  if (["scheduler", "staffingscheduler"].includes(key)) {
    return {
      role: "scheduler",
      is_admin: false,
      can_manage_admins: false,
      can_schedule_read: true,
      can_schedule_write: true,
      can_census_read: true,
      can_census_write: false,
    };
  }

  if (["admissions", "admissionsdirector", "admissionscoordinator"].includes(key)) {
    return {
      role: "admissions",
      is_admin: false,
      can_manage_admins: false,
      can_schedule_read: true,
      can_schedule_write: false,
      can_census_read: true,
      can_census_write: true,
    };
  }

  if (key === "wallboard") {
    return {
      role: "wallboard",
      is_admin: false,
      can_manage_admins: false,
      can_schedule_read: true,
      can_schedule_write: false,
      can_census_read: true,
      can_census_write: false,
    };
  }

  return {
    role: "staff",
    is_admin: false,
    can_manage_admins: false,
    can_schedule_read: true,
    can_schedule_write: false,
    can_census_read: true,
    can_census_write: false,
  };
}

async function getAuthUserByEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;

  if (supabaseAdmin?.auth?.admin?.getUserByEmail) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(e);
    if (!error && data?.user) return data.user;
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
  if (error) return null;
  return (data?.users || []).find((u) => String(u.email || "").toLowerCase() === e) || null;
}

async function getMyMembership(req) {
  if (req._myMembership) return req._myMembership;

  const userId = req.user?.id || req.userId;
  const orgId = req.orgId;
  if (!userId || !orgId) return null;

  const { data, error } = await supabaseAdmin
    .from("org_memberships")
    .select(
      "role,is_active,is_admin,can_manage_admins,can_schedule_write,can_schedule_read,can_census_write,can_census_read,department_id,department_locked"
    )
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("GET MY MEMBERSHIP ERROR:", error);
    return null;
  }

  req._myMembership = data || null;
  return req._myMembership;
}

async function canManageStaff(req) {
  const globalRole = String(req.role || "").toLowerCase();
  if (globalRole === "superadmin") return true;

  const mem = await getMyMembership(req);
  if (!mem || mem.is_active === false) return false;

  const r = String(mem.role || "").toLowerCase();
  if (["admin", "don", "ed"].includes(r)) return true;
  if (mem.is_admin) return true;
  if (mem.can_schedule_write) return true;
  return false;
}

async function ensureProfileAndMembership({
  userId,
  orgId,
  orgCode,
  staffRole,
  departmentId = null,
}) {
  const { data: existingProfile, error: profileReadError } = await supabaseAdmin
    .from("profiles")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();

  if (profileReadError) throw profileReadError;

  if (!existingProfile) {
    const { error: insertProfileError } = await supabaseAdmin.from("profiles").insert([
      {
        id: userId,
        role: "staff",
        org_code: orgCode || null,
        active_org_id: orgId || null,
      },
    ]);
    if (insertProfileError) throw insertProfileError;
  } else {
    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({ org_code: orgCode || null, active_org_id: orgId || null })
      .eq("id", userId);
    if (updateProfileError) throw updateProfileError;
  }

  const access = accessForStaffRole(staffRole);
  const { data: membership, error: memErr } = await supabaseAdmin
    .from("org_memberships")
    .upsert(
      [
        {
          user_id: userId,
          org_id: orgId,
          ...access,
          is_active: true,
          department_id: departmentId,
          department_locked: false,
        },
      ],
      { onConflict: "user_id,org_id" }
    )
    .select()
    .single();

  if (memErr) throw memErr;
  return membership;
}

async function getOrCreateAuthUserByEmail(email, orgCode, staffId) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) throw new Error("Email required");

  const existing = await getAuthUserByEmail(e);
  if (existing?.id) return existing;

  const tempPassword = crypto.randomBytes(24).toString("base64url");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: e,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      org_code: orgCode,
      staff_id: staffId,
      setup_pending: true,
    },
  });

  if (error) throw error;
  return data?.user || null;
}

// Public account-state check used only to decide whether the login UI should
// start the first-login setup flow. Unknown/active accounts intentionally share
// the same response so this endpoint does not reveal whether an arbitrary email exists.
router.get("/account-status", async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim().toLowerCase();
    if (!email) return res.json({ setup_required: false });

    const user = await getAuthUserByEmail(email);
    const setupRequired = user?.user_metadata?.setup_pending === true;
    return res.json({ setup_required: setupRequired });
  } catch (e) {
    console.error("ACCOUNT STATUS ERROR:", e);
    return res.json({ setup_required: false });
  }
});

router.use(requireAuth);
router.use(requireOrg);

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("*")
      .eq("org_code", orgCode)
      .order("name");

    if (error) {
      console.error("STAFF GET ERROR:", error);
      return res.status(500).json({ error: "Failed to load staff" });
    }

    let authUsers = [];
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
      authUsers = usersData?.users || [];
    } catch {}

    const authById = new Map(authUsers.map((u) => [String(u.id), u]));
    const rows = (data || []).map((s) => {
      const authUser = s.user_id ? authById.get(String(s.user_id)) : null;
      return {
        ...s,
        setup_pending: authUser?.user_metadata?.setup_pending === true,
      };
    });

    return res.json(rows);
  } catch (e) {
    console.error("STAFF GET ERROR:", e);
    return res.status(500).json({ error: "Failed to load staff" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!(await canManageStaff(req))) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const orgId = req.orgId;
    const { name, role, email, phone, department_id } = req.body || {};

    if (!orgId) return res.status(400).json({ error: "Org ID missing (orgGuard)" });
    if (!name || !role) return res.status(400).json({ error: "Name and role required" });

    const cleanedEmail = String(email || "").trim().toLowerCase() || null;

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .insert([
        {
          name,
          role,
          email: cleanedEmail,
          phone: phone || null,
          org_code: orgCode,
          org_id: orgId,
          department_id: department_id || null,
        },
      ])
      .select()
      .single();

    if (staffErr) {
      console.error("STAFF POST ERROR:", staffErr);
      return res.status(500).json({ error: "Failed to create staff" });
    }

    if (!cleanedEmail) {
      return res.json({ ...staff, login_created: false, setup_pending: false });
    }

    let user;
    try {
      user = await getOrCreateAuthUserByEmail(cleanedEmail, orgCode, staff.id);
    } catch (e) {
      console.error("AUTH USER CREATE/FIND ERROR:", e);
      return res.status(500).json({ error: "Failed to create/find auth user" });
    }

    const userId = user?.id || null;
    if (!userId) return res.status(500).json({ error: "Auth user id missing" });

    const { data: linkedStaff, error: linkStaffErr } = await supabaseAdmin
      .from("staff")
      .update({ user_id: userId, org_id: orgId })
      .eq("id", staff.id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (linkStaffErr) {
      console.error("STAFF LINK USER ERROR:", linkStaffErr);
      return res.status(500).json({ error: "Staff created, but login could not be linked" });
    }

    try {
      await ensureProfileAndMembership({
        userId,
        orgId,
        orgCode,
        staffRole: role,
        departmentId: department_id || null,
      });
    } catch (e) {
      console.error("PROFILE/MEMBERSHIP ERROR:", e);
      return res.status(500).json({ error: "Staff created, but permissions could not be initialized" });
    }

    return res.json({
      ...linkedStaff,
      login_created: true,
      setup_pending: user?.user_metadata?.setup_pending === true,
      note: user?.user_metadata?.setup_pending === true
        ? "Account created. Employee should go to ShiftCensus and enter their email to finish setup."
        : "Existing ShiftCensus account linked to this facility.",
    });
  } catch (e) {
    console.error("STAFF POST ERROR:", e);
    return res.status(500).json({ error: "Failed to create staff" });
  }
});

router.post("/:id/provision-login", async (req, res) => {
  try {
    if (!(await canManageStaff(req))) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const orgId = req.orgId;

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("*")
      .eq("id", req.params.id)
      .eq("org_code", orgCode)
      .maybeSingle();

    if (staffErr) return res.status(500).json({ error: "Failed to load staff member" });
    if (!staff) return res.status(404).json({ error: "Staff member not found" });
    if (staff.user_id) return res.status(409).json({ error: "Staff member already has a linked login" });

    const email = String(staff.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Add an email address before creating a login" });

    const user = await getOrCreateAuthUserByEmail(email, orgCode, staff.id);
    const userId = user?.id;
    if (!userId) return res.status(500).json({ error: "Auth user id missing" });

    const { data: linkedStaff, error: linkErr } = await supabaseAdmin
      .from("staff")
      .update({ user_id: userId, org_id: orgId })
      .eq("id", staff.id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (linkErr) return res.status(500).json({ error: "Failed to link login to staff member" });

    await ensureProfileAndMembership({
      userId,
      orgId,
      orgCode,
      staffRole: staff.role,
      departmentId: staff.department_id || null,
    });

    return res.json({
      ...linkedStaff,
      login_created: true,
      setup_pending: user?.user_metadata?.setup_pending === true,
      note: user?.user_metadata?.setup_pending === true
        ? "Account created. Employee should go to ShiftCensus and enter their email to finish setup."
        : "Existing ShiftCensus account linked to this facility.",
    });
  } catch (e) {
    console.error("PROVISION STAFF LOGIN ERROR:", e);
    return res.status(500).json({ error: e?.message || "Failed to provision staff login" });
  }
});

async function handleUpdate(req, res) {
  try {
    if (!(await canManageStaff(req))) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const orgId = req.orgId;
    const { name, role, email, phone, department_id } = req.body || {};

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (email !== undefined) updates.email = email ? String(email).trim().toLowerCase() : null;
    if (phone !== undefined) updates.phone = phone || null;
    if (department_id !== undefined) updates.department_id = department_id || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No staff fields supplied" });
    }

    const { data, error } = await supabaseAdmin
      .from("staff")
      .update(updates)
      .eq("id", req.params.id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (error) {
      console.error("STAFF UPDATE ERROR:", error);
      return res.status(500).json({ error: "Failed to update staff" });
    }

    if (data?.user_id && (role !== undefined || department_id !== undefined)) {
      await ensureProfileAndMembership({
        userId: data.user_id,
        orgId,
        orgCode,
        staffRole: data.role,
        departmentId: data.department_id || null,
      });
    }

    return res.json(data);
  } catch (e) {
    console.error("STAFF UPDATE ERROR:", e);
    return res.status(500).json({ error: "Failed to update staff" });
  }
}

router.put("/:id", handleUpdate);
router.patch("/:id", handleUpdate);

router.delete("/:id", async (req, res) => {
  try {
    if (!(await canManageStaff(req))) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const { error } = await supabaseAdmin
      .from("staff")
      .delete()
      .eq("id", req.params.id)
      .eq("org_code", orgCode);

    if (error) {
      console.error("STAFF DELETE ERROR:", error);
      return res.status(500).json({ error: "Failed to delete staff" });
    }
    return res.json({ success: true });
  } catch (e) {
    console.error("STAFF DELETE ERROR:", e);
    return res.status(500).json({ error: "Failed to delete staff" });
  }
});

module.exports = router;
