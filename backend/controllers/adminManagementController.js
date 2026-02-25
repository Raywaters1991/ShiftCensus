// controllers/adminManagementController.js
import { supabaseAdmin } from "../supabaseAdmin.js";

export async function listAdminManagement(req, res) {
  const orgId = req.org.id;
  const q = String(req.query.q || "").trim().toLowerCase();

  // 1) Staff
  let staffQuery = supabaseAdmin
    .from("staff")
    .select("id, name, role, email, phone, department_id, user_id, org_id, employee_no")
    .eq("org_id", orgId)
    .order("name", { ascending: true });

  // optional search (client can also filter, but server-side is nicer)
  if (q) {
    // Supabase filter: use `or` across fields
    // NOTE: ilike needs %...%
    const like = `%${q.replace(/%/g, "")}%`;
    staffQuery = staffQuery.or(
      [
        `name.ilike.${like}`,
        `role.ilike.${like}`,
        `email.ilike.${like}`,
        `phone.ilike.${like}`,
        `employee_no.ilike.${like}`,
      ].join(",")
    );
  }

  const { data: staff, error: staffErr } = await staffQuery;
  if (staffErr) return res.status(500).json({ error: staffErr.message });

  // 2) Memberships for this org
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("org_memberships")
    .select(
      "user_id, org_id, role, is_active, is_admin, can_manage_admins, can_schedule_read, can_schedule_write, can_census_read, can_census_write, department_id, department_locked"
    )
    .eq("org_id", orgId);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const memByUserId = new Map((memberships || []).map((m) => [String(m.user_id), m]));

  // 3) Merge
  const items = (staff || []).map((s) => {
    const uid = s.user_id ? String(s.user_id) : null;
    return {
      staff_id: s.id,
      name: s.name,
      staff_role: s.role,
      email: s.email,
      phone: s.phone,
      employee_no: s.employee_no,
      department_id: s.department_id,
      user_id: uid,
      membership: uid ? memByUserId.get(uid) || null : null,
    };
  });

  return res.json({ items });
}
