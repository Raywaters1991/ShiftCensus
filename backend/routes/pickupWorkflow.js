const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { notifyScheduleEditors } = require("../services/notificationService");

router.use(requireAuth);
router.use(requireOrg);

const isNurseRole = (value) => ["RN", "LPN", "NURSE"].includes(String(value || "").trim().toUpperCase());
const compatibleRole=(group,role)=>group==="Nurse"?isNurseRole(role):String(group||"").toUpperCase()===String(role||"").toUpperCase();

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
    const { shift_id, coverage_gap } = req.body || {};
    const staff = await currentStaff(req);
    if (!staff) return res.status(400).json({ error: "Your login is not linked to a staff record" });
    if (!staff.department_id) return res.status(400).json({ error: "Your staff profile is not assigned to a department" });
    if (!(await hasScheduleEditor(req, staff.department_id))) {
      return res.status(409).json({ error: "Your department does not have anyone with Edit Schedule permission to review requests yet" });
    }

    let materializedShiftId=null;
    if (coverage_gap) {
      const date=String(coverage_gap.shift_date||""),group=String(coverage_gap.role_group||""),shiftType=String(coverage_gap.shift_type||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!["Nurse","CNA"].includes(group)||!["Day","Evening","Night"].includes(shiftType))return res.status(400).json({error:"Invalid coverage gap"});
      if(!compatibleRole(group,staff.role))return res.status(400).json({error:`This coverage need is for ${group}`});
      const[{data:reqRow,error:re},{data:settings,error:se},{data:existing,error:ee}]=await Promise.all([
        supabaseAdmin.from("schedule_coverage_requirements").select("required_count").eq("org_id",req.orgId).eq("role_group",group).eq("shift_type",shiftType).maybeSingle(),
        supabaseAdmin.from("shift_settings").select("role,start_local,end_local").eq("org_code",orgCode).eq("shift_type",shiftType),
        supabaseAdmin.from("shifts").select("id,role").eq("org_code",orgCode).eq("shift_date",date).eq("shift_type",shiftType)
      ]);
      if(re)throw re;if(se)throw se;if(ee)throw ee;
      const required=Number(reqRow?.required_count||0),covered=(existing||[]).filter(x=>compatibleRole(group,x.role)).length;
      if(required<=covered)return res.status(409).json({error:"This minimum coverage need has already been filled"});
      const options=(settings||[]).filter(x=>compatibleRole(group,x.role));
      if(!options.length)return res.status(409).json({error:`No shift times are configured for ${group} ${shiftType}`});
      const times=[...new Set(options.map(x=>`${String(x.start_local).slice(0,5)}|${String(x.end_local).slice(0,5)}`))];
      if(times.length!==1)return res.status(409).json({error:`${group} ${shiftType} has multiple configured shift times; management must create this opening manually`});
      const [startLocal,endLocal]=times[0].split("|");
      const start=new Date(`${date}T${startLocal}:00Z`),end=new Date(`${date}T${endLocal}:00Z`);if(end<=start)end.setUTCDate(end.getUTCDate()+1);
      if(await hasApprovedTimeOff(orgCode,staff.id,date))return res.status(409).json({error:"You have approved time off on this date"});
      const{data:preConflicts,error:pce}=await supabaseAdmin.from("shifts").select("id").eq("org_code",orgCode).eq("staff_id",staff.id).lt("start_time",end.toISOString()).gt("end_time",start.toISOString()).limit(1);if(pce)throw pce;if(preConflicts?.length)return res.status(409).json({error:"You are already scheduled for an overlapping shift"});
      const {data:created,error:ce}=await supabaseAdmin.from("shifts").insert({staff_id:null,role:group,unit:null,assignment_number:null,shift_date:date,shift_type:shiftType,start_local:startLocal,end_local:endLocal,start_time:start.toISOString(),end_time:end.toISOString(),org_code:orgCode,department_id:staff.department_id,open_reason:"minimum_coverage"}).select("id").single();
      if(ce)throw ce;materializedShiftId=created.id;
    }

    const { data: shift, error: shiftError } = await supabaseAdmin
      .from("shifts")
      .select("id,staff_id,role,shift_date,shift_type,start_local,end_local,department_id")
      .eq("id", materializedShiftId || shift_id)
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
    const { data: conflicts, error: conflictError } = await supabaseAdmin
      .from("shifts")
      .select("id,start_time,end_time")
      .eq("org_code", orgCode)
      .eq("staff_id", staff.id)
      .neq("id", shift.id)
      .lt("start_time", shift.end_time)
      .gt("end_time", shift.start_time)
      .limit(1);
    if (conflictError) throw conflictError;
    if (conflicts?.length) return res.status(409).json({ error: "You are already scheduled for an overlapping shift" });

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
