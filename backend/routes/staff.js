// backend/routes/staff.js
const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { sendSms } = require("../services/twilio");
const crypto = require("crypto");

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function normalizePhone(p) {
  if (!p) return null;
  const s = String(p).trim();
  return s.startsWith("+") ? s : null; // require E.164 +1...
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Load the caller's org_memberships row (org-scoped permissions)
async function getMyMembership(req) {
  // cache per-request
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

// ✅ Org-scoped permission check (NOT global profiles.role)
async function canManageStaff(req) {
  const globalRole = String(req.role || "").toLowerCase();
  if (globalRole === "superadmin") return true;

  const mem = await getMyMembership(req);
  if (!mem || mem.is_active === false) return false;

  const r = String(mem.role || "").toLowerCase();

  // Pick your rules. This is a sensible default:
  // - org "admin/don/ed" can manage staff
  // - OR anyone with schedule write can manage staff directory
  // - OR explicit admin flag
  if (["admin", "don", "ed"].includes(r)) return true;
  if (mem.is_admin) return true;
  if (mem.can_schedule_write) return true;

  return false;
}

// -----------------------------------------------------
// Enterprise model helpers
// -----------------------------------------------------
async function ensureProfileAndMembership({ userId, orgId, orgCode, departmentId = null }) {
  // 1) profiles upsert
  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .upsert(
      [
        {
          id: userId,
          role: "staff", // keep generic; org_memberships controls perms
          org_code: orgCode || null,
          active_org_id: orgId || null,
        },
      ],
      { onConflict: "id" }
    );

  if (profErr) throw profErr;

  // 2) org_memberships upsert (PK = user_id + org_id)
  const { data: membership, error: memErr } = await supabaseAdmin
    .from("org_memberships")
    .upsert(
      [
        {
          user_id: userId,
          org_id: orgId,
          role: "staff",
          is_active: true,

          // defaults
          is_admin: false,
          can_manage_admins: false,

          // staff reads by default, no writes
          can_schedule_read: true,
          can_schedule_write: false,
          can_census_read: true,
          can_census_write: false,

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

  // Prefer getUserByEmail if available
  if (supabaseAdmin?.auth?.admin?.getUserByEmail) {
    const { data: found, error: foundErr } = await supabaseAdmin.auth.admin.getUserByEmail(e);
    if (foundErr) throw foundErr;
    if (found?.user?.id) return found.user;
  }

  // Create user (password is temporary; user will set password via recovery link)
  const tempPassword = crypto.randomBytes(12).toString("base64url");

  const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: e,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { org_code: orgCode, staff_id: staffId },
  });

  if (!createErr) return createData?.user;

  // If create failed because it already exists, try again to fetch
  if (supabaseAdmin?.auth?.admin?.getUserByEmail) {
    const { data: found2, error: foundErr2 } = await supabaseAdmin.auth.admin.getUserByEmail(e);
    if (!foundErr2 && found2?.user?.id) return found2.user;
  }

  // last-resort fallback (rare)
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) throw createErr;

  const existing = (listData?.users || []).find((u) => String(u.email || "").toLowerCase() === e);
  if (existing?.id) return existing;

  throw createErr;
}

// -----------------------------------------------------
// Middleware
// -----------------------------------------------------
router.use(requireAuth);
router.use(requireOrg);

// =====================================================
// GET STAFF (ORG-SCOPED)
// =====================================================
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

    return res.json(data || []);
  } catch (e) {
    console.error("STAFF GET ERROR:", e);
    return res.status(500).json({ error: "Failed to load staff" });
  }
});

// =====================================================
// ADD STAFF (ORG-SCOPED) + CREATE LOGIN + OPTIONAL SMS LINK
// =====================================================
router.post("/", async (req, res) => {
  try {
    if (!(await canManageStaff(req))) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const orgId = req.orgId;

    const { name, role, email, phone, department_id } = req.body || {};

    if (!orgId) return res.status(400).json({ error: "Org ID missing (orgGuard)" });
    if (!name || !role) return res.status(400).json({ error: "Name and role required" });

    // 1) Create staff row
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .insert([
        {
          name,
          role,
          email: email || null,
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

    // If no email, we can't create a Supabase password login (recovery link requires email).
    // We still keep staff record.
    const cleanedEmail = String(email || "").trim().toLowerCase() || null;
    if (!cleanedEmail) {
      return res.json({ ...staff, login_created: false, invite_sent: false });
    }

    // 2) Create/find auth user
    let user;
    try {
      user = await getOrCreateAuthUserByEmail(cleanedEmail, orgCode, staff.id);
    } catch (e) {
      console.error("AUTH USER CREATE/FIND ERROR:", e);
      return res.status(500).json({ error: "Failed to create/find auth user" });
    }

    const userId = user?.id || null;
    if (!userId) return res.status(500).json({ error: "Auth user id missing" });

    // 3) Link staff.user_id (best-effort)
    try {
      await supabaseAdmin
        .from("staff")
        .update({ user_id: userId, org_id: orgId })
        .eq("id", staff.id)
        .eq("org_code", orgCode);
    } catch (e) {
      console.warn("STAFF LINK USER WARN:", e?.message || e);
    }

    // 4) Create profiles + org_memberships defaults (enterprise model)
    try {
      await ensureProfileAndMembership({
        userId,
        orgId,
        orgCode,
        departmentId: staff.department_id || null,
      });
    } catch (e) {
      console.error("PROFILE/MEMBERSHIP ERROR:", e);
      // continue; login still exists
    }

    // 5) Generate set-password link (recovery)
    const redirectTo = `${process.env.APP_PUBLIC_URL}/accept-invite`;

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: cleanedEmail,
      options: {
        redirectTo,
        data: {
          org_code: orgCode,
          org_id: orgId,
          staff_id: staff.id,
        },
      },
    });

    if (linkErr) {
      console.error("GENERATE LINK ERROR:", linkErr);
      return res.json({
        ...staff,
        user_id: userId,
        login_created: true,
        invite_sent: false,
        error: "Link failed",
      });
    }

    const actionLink = linkData?.properties?.action_link || null;

    // 6) Store invite record (optional, best-effort)
    try {
      const toPhone = normalizePhone(phone);
      const token = makeToken();
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

      await supabaseAdmin.from("user_invites").insert([
        {
          org_code: orgCode,
          staff_id: staff.id,
          user_id: userId,
          email: cleanedEmail,
          phone: toPhone,
          token,
          action_link: actionLink,
          expires_at: expires.toISOString(),
        },
      ]);
    } catch (e) {
      console.warn("INVITE STORE WARN:", e?.message || e);
    }

    // 7) Send SMS if we have E.164 phone; otherwise return link so admin can copy it
    const toPhone = normalizePhone(phone);
    if (!toPhone) {
      return res.json({
        ...staff,
        user_id: userId,
        login_created: true,
        invite_sent: false,
        actionLink, // ✅ lets your Admin UI show a "Copy Invite Link" button
        note: "No E.164 phone provided; invite link returned instead of SMS.",
      });
    }

    try {
      const msg = `Welcome to ShiftCensus.\nSet your password (expires in 24h):\n${actionLink}`;
      await sendSms(toPhone, msg);
    } catch (smsErr) {
      console.error("TWILIO SMS ERROR:", smsErr);
      return res.json({
        ...staff,
        user_id: userId,
        login_created: true,
        invite_sent: false,
        actionLink,
        error: "SMS failed",
      });
    }

    return res.json({
      ...staff,
      user_id: userId,
      login_created: true,
      invite_sent: true,
    });
  } catch (e) {
    console.error("STAFF POST ERROR:", e);
    return res.status(500).json({ error: "Failed to create staff" });
  }
});

// =====================================================
// UPDATE STAFF (ORG-SCOPED) - supports PATCH and PUT
// =====================================================
async function handleUpdate(req, res) {
  try {
    if (!(await canManageStaff(req))) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const { name, role, email, phone, department_id } = req.body || {};

    const { data, error } = await supabaseAdmin
      .from("staff")
      .update({
        name,
        role,
        email: email ?? null,
        phone: phone ?? null,
        department_id: department_id ?? null,
      })
      .eq("id", req.params.id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (error) {
      console.error("STAFF UPDATE ERROR:", error);
      return res.status(500).json({ error: "Failed to update staff" });
    }

    return res.json(data);
  } catch (e) {
    console.error("STAFF UPDATE ERROR:", e);
    return res.status(500).json({ error: "Failed to update staff" });
  }
}

router.put("/:id", handleUpdate);
router.patch("/:id", handleUpdate);

// =====================================================
// DELETE STAFF (ORG-SCOPED)
// =====================================================
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
