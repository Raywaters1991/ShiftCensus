// backend/routes/staff.js
const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { sendSms } = require("../services/twilio");
const crypto = require("crypto");

// -----------------------------------------------------
// Permissions
// -----------------------------------------------------
function canManageStaff(req) {
  const r = String(req.role || "").toLowerCase();
  return ["superadmin", "admin", "don", "ed"].includes(r);
}

function normalizePhone(p) {
  if (!p) return null;
  const s = String(p).trim();
  return s.startsWith("+") ? s : null; // require E.164 +1...
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

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

    res.json(data || []);
  } catch (e) {
    console.error("STAFF GET ERROR:", e);
    res.status(500).json({ error: "Failed to load staff" });
  }
});

// =====================================================
// ADD STAFF (ORG-SCOPED) + OPTIONAL INVITE SMS
// =====================================================
router.post("/", async (req, res) => {
  try {
    if (!canManageStaff(req)) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const { name, role, email, phone, department_id } = req.body || {};

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
          department_id: department_id || null,
        },
      ])
      .select()
      .single();

    if (staffErr) {
      console.error("STAFF POST ERROR:", staffErr);
      return res.status(500).json({ error: "Failed to create staff" });
    }

    // 2) If missing email or E.164 phone, return without invite
    const toPhone = normalizePhone(phone);
    if (!email || !toPhone) {
      return res.json({ ...staff, invite_sent: false });
    }

    // 3) Generate invite link (Admin API must use service role client)
    const redirectTo = `${process.env.APP_PUBLIC_URL}/accept-invite`;

    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo,
          data: {
            role: String(role).toLowerCase(),
            org_code: orgCode,
            staff_id: staff.id,
          },
        },
      });

    if (linkErr) {
      console.error("GENERATE LINK ERROR:", linkErr);
      return res.json({ ...staff, invite_sent: false, error: "Invite link failed" });
    }

    const actionLink = linkData?.properties?.action_link || null;
    const invitedUserId = linkData?.user?.id || null;

    // 4) Store invite (best-effort)
    try {
      const token = makeToken();
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

      await supabaseAdmin.from("user_invites").insert([
        {
          org_code: orgCode,
          staff_id: staff.id,
          user_id: invitedUserId,
          email,
          phone: toPhone,
          token,
          action_link: actionLink,
          expires_at: expires.toISOString(),
        },
      ]);
    } catch (e) {
      console.warn("INVITE STORE WARN:", e?.message || e);
    }

    // 5) Link staff.user_id (best-effort)
    if (invitedUserId) {
      try {
        await supabaseAdmin.from("staff").update({ user_id: invitedUserId }).eq("id", staff.id);
      } catch (e) {
        console.warn("STAFF LINK USER WARN:", e?.message || e);
      }
    }

    // 6) Send SMS
    const msg = `Welcome to ShiftCensus: Set your password (expires in 24h):\n${actionLink}`;

    try {
      await sendSms(toPhone, msg);
    } catch (smsErr) {
      console.error("TWILIO SMS ERROR:", smsErr);
      return res.json({ ...staff, invite_sent: false, error: "SMS failed", actionLink });
    }

    return res.json({ ...staff, user_id: invitedUserId, invite_sent: true });
  } catch (e) {
    console.error("STAFF POST ERROR:", e);
    return res.status(500).json({ error: "Failed to create staff" });
  }
});

// =====================================================
// UPDATE STAFF (ORG-SCOPED)
// =====================================================
router.put("/:id", async (req, res) => {
  try {
    if (!canManageStaff(req)) return res.status(403).json({ error: "Not allowed" });

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
      console.error("STAFF PUT ERROR:", error);
      return res.status(500).json({ error: "Failed to update staff" });
    }

    res.json(data);
  } catch (e) {
    console.error("STAFF PUT ERROR:", e);
    res.status(500).json({ error: "Failed to update staff" });
  }
});

// =====================================================
// DELETE STAFF (ORG-SCOPED)
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    if (!canManageStaff(req)) return res.status(403).json({ error: "Not allowed" });

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

    res.json({ success: true });
  } catch (e) {
    console.error("STAFF DELETE ERROR:", e);
    res.status(500).json({ error: "Failed to delete staff" });
  }
});

module.exports = router;
