// backend/routes/shifts.js
const express = require("express");
const router = express.Router();
require("dotenv").config();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

function buildDateTime(shift_date, timeStr, timezone) {
  const localString = `${shift_date}T${timeStr}`;
  const localDate = new Date(new Date(localString).toLocaleString("en-US", { timeZone: timezone }));
  if (isNaN(localDate.getTime())) throw new Error("Invalid datetime conversion");
  return localDate.toISOString();
}
function computeShiftTimes(shift_date, setting, timezone) {
  const startUtc = buildDateTime(shift_date, setting.start_local, timezone);
  let endUtc = buildDateTime(shift_date, setting.end_local, timezone);
  if (setting.end_local < setting.start_local) {
    const d = new Date(endUtc); d.setUTCDate(d.getUTCDate() + 1); endUtc = d.toISOString();
  }
  return { startUtc, endUtc };
}
function validDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }
async function getFacilityTimezone(orgId) {
  const { data, error } = await supabaseAdmin.from("org_settings").select("timezone").eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  let timezone = String(data?.timezone || "America/Los_Angeles");
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); }
  catch { timezone = "America/Los_Angeles"; }
  return timezone;
}
async function approvedTimeOff(orgCode, staffId, shiftDate) {
  if (!staffId || !shiftDate) return null;
  const { data, error } = await supabaseAdmin
    .from("shift_requests")
    .select("id,start_date,end_date,reason")
    .eq("org_code", orgCode)
    .eq("staff_id", staffId)
    .eq("request_type", "time_off")
    .eq("status", "approved")
    .lte("start_date", shiftDate)
    .gte("end_date", shiftDate)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const date = req.query.date ? String(req.query.date) : "";
    const from = req.query.from ? String(req.query.from) : "";
    const to = req.query.to ? String(req.query.to) : "";
    if ((date && !validDate(date)) || (from && !validDate(from)) || (to && !validDate(to))) return res.status(400).json({ error: "Invalid date filter" });
    let query = supabaseAdmin.from("shifts").select("id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,timezone").eq("org_code", orgCode);
    if (date) query = query.eq("shift_date", date);
    else { if (from) query = query.gte("shift_date", from); if (to) query = query.lte("shift_date", to); }
    const { data, error } = await query.order("start_time", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { console.error("SHIFT GET ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

router.post("/open", async (req,res)=>{
  try{
    const orgCode=req.orgCode||req.org_code;
    const { role, shift_date, shiftType }=req.body||{};
    if(!role||!shift_date||!shiftType) return res.status(400).json({error:"Missing required fields: role, shift_date, shiftType"});
    if(!validDate(shift_date)) return res.status(400).json({error:"Invalid shift_date"});
    const facilityTimezone=await getFacilityTimezone(req.orgId);
    const {data:setting,error:settingErr}=await supabaseAdmin.from("shift_settings").select("*").eq("org_code",orgCode).eq("role",role).eq("shift_type",shiftType).maybeSingle();
    if(settingErr||!setting) return res.status(400).json({error:`No shift settings found for ${role} ${shiftType}`});
    const {startUtc,endUtc}=computeShiftTimes(shift_date,setting,facilityTimezone);
    const {data,error}=await supabaseAdmin.from("shifts").insert([{staff_id:null,role,unit:null,assignment_number:null,shift_date,shift_type:shiftType,start_local:setting.start_local,end_local:setting.end_local,start_time:startUtc,end_time:endUtc,timezone:facilityTimezone,org_code:orgCode}]).select();
    if(error) throw error;
    res.json(data?.[0]||null);
  }catch(err){console.error("OPEN SHIFT POST ERROR:",err);res.status(500).json({error:"Server error"})}
});

router.post("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { staff_id, shift_date, shiftType } = req.body || {};
    if (!staff_id || !shift_date || !shiftType) return res.status(400).json({ error: "Missing required fields: staff_id, shift_date, shiftType" });
    if (!validDate(shift_date)) return res.status(400).json({ error: "Invalid shift_date" });
    const leave = await approvedTimeOff(orgCode, staff_id, shift_date);
    if (leave) return res.status(409).json({ error: "This employee has approved time off on this date.", code: "APPROVED_TIME_OFF", time_off: leave });
    const facilityTimezone = await getFacilityTimezone(req.orgId);
    const { data: staffData, error: staffErr } = await supabaseAdmin.from("staff").select("role").eq("id", staff_id).eq("org_code", orgCode).maybeSingle();
    if (staffErr || !staffData) return res.status(400).json({ error: "Invalid staff_id" });
    const role = staffData.role;
    const { data: setting, error: settingErr } = await supabaseAdmin.from("shift_settings").select("*").eq("org_code", orgCode).eq("role", role).eq("shift_type", shiftType).maybeSingle();
    if (settingErr || !setting) return res.status(400).json({ error: `No shift settings found for ${role} ${shiftType}` });
    const { startUtc, endUtc } = computeShiftTimes(shift_date, setting, facilityTimezone);
    const { data, error } = await supabaseAdmin.from("shifts").insert([{staff_id,role,unit:null,assignment_number:null,shift_date,shift_type:shiftType,start_local:setting.start_local,end_local:setting.end_local,start_time:startUtc,end_time:endUtc,timezone:facilityTimezone,org_code:orgCode}]).select();
    if (error) throw error;
    res.json(data?.[0] || null);
  } catch (err) { console.error("SHIFT POST ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

router.put("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const id = req.params.id;
    const { staff_id, shift_date, shiftType } = req.body || {};
    if (!staff_id || !shift_date || !shiftType) return res.status(400).json({ error: "Missing required fields: staff_id, shift_date, shiftType" });
    if (!validDate(shift_date)) return res.status(400).json({ error: "Invalid shift_date" });
    const leave = await approvedTimeOff(orgCode, staff_id, shift_date);
    if (leave) return res.status(409).json({ error: "This employee has approved time off on this date.", code: "APPROVED_TIME_OFF", time_off: leave });
    const facilityTimezone = await getFacilityTimezone(req.orgId);
    const { data: staffData } = await supabaseAdmin.from("staff").select("role").eq("id", staff_id).eq("org_code", orgCode).maybeSingle();
    if (!staffData) return res.status(400).json({ error: "Invalid staff_id" });
    const role = staffData.role;
    const { data: setting } = await supabaseAdmin.from("shift_settings").select("*").eq("org_code", orgCode).eq("role", role).eq("shift_type", shiftType).maybeSingle();
    if (!setting) return res.status(400).json({ error: `No shift settings found for ${role} ${shiftType}` });
    const { startUtc, endUtc } = computeShiftTimes(shift_date, setting, facilityTimezone);
    const { data, error } = await supabaseAdmin.from("shifts").update({staff_id,role,unit:null,assignment_number:null,shift_date,shift_type:shiftType,start_local:setting.start_local,end_local:setting.end_local,start_time:startUtc,end_time:endUtc,timezone:facilityTimezone}).eq("id", id).eq("org_code", orgCode).select();
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Shift not found in this organization" });
    res.json(data[0]);
  } catch (err) { console.error("SHIFT PUT ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { data, error } = await supabaseAdmin.from("shifts").delete().eq("id", req.params.id).eq("org_code", orgCode).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Shift not found in this organization" });
    res.json({ message: "Shift deleted" });
  } catch (err) { console.error("SHIFT DELETE ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
