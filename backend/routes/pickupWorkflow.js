const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { notifyScheduleEditors } = require("../services/notificationService");

router.use(requireAuth);
router.use(requireOrg);

const isNurseRole = (value) => ["RN", "LPN", "NURSE"].includes(String(value || "").trim().toUpperCase());

async function currentStaff(req) {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id,name,role,user_id,department_id")
    .eq("org_code", req.orgCode || req.org_code)
    .eq("user_id", req.userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function hasScheduleEditor(req, departmentId) {
  if (!departmentId || !req.orgId) return false;
  const { count, error } = await supabaseAdmin
    .from("org_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", req.orgId)
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .eq("can_schedule_write", true);
  if (error) throw error;
  return (count || 0) > 0;
}

async function hasApprovedTimeOff(orgCode, staffId, date) {
  const { data, error } = await supabaseAdmin
    .from("shift_requests")
    .select("id")
    .eq("org_code", orgCode)
    .eq("staff_id", staffId)
    .eq("request_type", "time_off")
    .eq("status", "approved")
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1);
  if (error) throw error;
  return !!data?.length;
}

router.post("/pickup", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { shift_id } = req.body || {};
    const staff = await currentStaff(req);
    if (!staff) return res.status(400).json({ error: "Your login is not linked to a staff record" });
    if (!staff.department_id) return res.status(400).json({ error: "Your staff profile is not assigned to a department" });
    if (!(await hasScheduleEditor(req, staff.department_id))) {
      return res.status(409).json({ error: "Your department does not have anyone with Edit Schedule permission to review requests yet" });
    }

    const { data: shift, error: shiftError } = await supabaseAdmin
      .from("shifts")
      .select("id,staff_id,role,shift_date,shift_type,start_local,end_local,department_id")
      .eq("id", shift_id)
      .eq("org_code", orgCode)
      .maybeSingle();
    if (shiftError) throw shiftError;
    if (!shift) return res.status(404).json({ error: "Open shift not found" });
    if (shift.staff_id !== null) return res.status(409).json({ error: "This shift is no longer open" });

    const compatible = isNurseRole(shift.role)
      ? isNurseRole(staff.role)
      : String(staff.role || "").toLowerCase() === String(shift.role || "").toLowerCase();
    if (!compatible) return res.status(400).json({ error: `This open shift is for ${isNurseRole(shift.role) ? "Nurse" : shift.role}` });
    if (await hasApprovedTimeOff(orgCode, staff.id, shift.shift_date)) {
      return res.status(409).json({ error: "You have approved time off on this date" });
    }

    const { data, error } = await supabaseAdmin
      .from("shift_requests")
      .insert({
        org_code: orgCode,
        user_id: req.userId,
        staff_id: staff.id,
        department_id: staff.department_id,
        request_type: "pickup",
        shift_id: shift.id,
        start_date: shift.shift_date,
        end_date: shift.shift_date,
        status: "pending",
      })
      .select()
      .single();
    if (error?.code === "23505") return res.status(409).json({ error: "You already requested this shift" });
    if (error) throw error;

    const notifications = await notifyScheduleEditors({
      orgId: req.orgId,
      orgCode,
      departmentId: staff.department_id,
      type: "pickup_request",
      title: "Open shift pickup request",
      message: `${staff.name || "An employee"} requested the ${shift.shift_date} ${shift.shift_type} shift.`,
      actionPath: "/request-review",
      metadata: { request_id: data.id, shift_id: shift.id, staff_id: staff.id },
    });

    res.json({ ...data, reviewers_notified: notifications.length });
  } catch (e) {
    console.error("PICKUP WORKFLOW ERROR", e);
    res.status(500).json({ error: e?.message || "Unable to request shift" });
  }
});

module.exports = router;
