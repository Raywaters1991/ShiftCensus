// controllers/staffController.js
import { supabaseAdmin } from "../supabaseAdmin.js";

export async function createStaff(req, res) {
  const orgId = req.org.id;
  const orgCode = req.org.code;

  const payload = {
    name: String(req.body?.name || "").trim(),
    role: String(req.body?.role || "").trim(),
    email: String(req.body?.email || "").trim() || null,
    phone: String(req.body?.phone || "").trim() || null,
    department_id: req.body?.department_id || null,
    employee_no: req.body?.employee_no || null,
  };

  if (!payload.name || !payload.role) {
    return res.status(400).json({ error: "Name and role are required." });
  }

  // 1) create auth user ONLY if you want logins for this staff member
  let userId = null;

  // If you want to allow staff without login, skip this block when no email/phone.
  if (payload.email || payload.phone) {
    const { data: authData, error: aErr } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email || undefined,
      phone: payload.phone || undefined,
      email_confirm: true,
      phone_confirm: true,
    });

    if (aErr) return res.status(400).json({ error: aErr.message });
    userId = authData.user.id;

    // membership
    const { error: mErr } = await supabaseAdmin
      .from("org_memberships")
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          role: "staff",
          is_active: true,
          department_id: payload.department_id,
        },
        { onConflict: "user_id,org_id" }
      );

    if (mErr) return res.status(500).json({ error: mErr.message });
  }

  // 2) insert staff row
  const { data: staff, error: sErr } = await supabaseAdmin
    .from("staff")
    .insert({
      name: payload.name,
      role: payload.role,
      email: payload.email,
      phone: payload.phone,
      department_id: payload.department_id,
      employee_no: payload.employee_no,
      user_id: userId,
      org_id: orgId,
      org_code: orgCode,
    })
    .select("*")
    .single();

  if (sErr) return res.status(500).json({ error: sErr.message });

  return res.json(staff);
}
