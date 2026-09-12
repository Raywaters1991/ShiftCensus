const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}
function dateInTimeZone(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get=(type)=>parts.find((p)=>p.type===type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

router.get("/", async (req, res) => {
  try {
    const orgId = req.orgId;
    const orgCode = req.orgCode || req.org_code;
    const requestedDate = String(req.query?.date || "").trim();
    if (requestedDate && !validDate(requestedDate)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("org_settings").select("timezone").eq("org_id",orgId).maybeSingle();
    if (settingsError) throw settingsError;
    let timezone=String(settings?.timezone||"America/Los_Angeles");
    try{new Intl.DateTimeFormat("en-US",{timeZone:timezone}).format(new Date());}catch{timezone="America/Los_Angeles";}
    const date=requestedDate||dateInTimeZone(timezone);

    const [shiftResult, unitResult] = await Promise.all([
      supabaseAdmin
        .from("shifts")
        .select("id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,timezone")
        .eq("org_code", orgCode)
        .eq("shift_date", date)
        .order("start_time", { ascending: true }),
      supabaseAdmin
        .from("units")
        .select("id,name")
        .eq("org_code", orgCode)
        .order("name", { ascending: true }),
    ]);

    if (shiftResult.error) throw shiftResult.error;
    if (unitResult.error) throw unitResult.error;

    const shifts = shiftResult.data || [];
    const shiftIds = shifts.map((s) => s.id).filter(Boolean);
    const staffIds = [...new Set(shifts.map((s)=>s.staff_id).filter(Boolean))];

    const [staffResult, assignmentResult] = await Promise.all([
      staffIds.length
        ? supabaseAdmin.from("staff").select("id,name,role").eq("org_code",orgCode).in("id",staffIds).order("name",{ascending:true})
        : Promise.resolve({data:[],error:null}),
      shiftIds.length
        ? supabaseAdmin.from("shift_assignments").select("id,shift_id,unit_id,unit,assignment_number,updated_at").eq("org_code",orgCode).in("shift_id",shiftIds).order("shift_id",{ascending:true})
        : Promise.resolve({data:[],error:null}),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (assignmentResult.error) throw assignmentResult.error;

    return res.json({
      date,
      timezone,
      shifts,
      staff: staffResult.data || [],
      units: unitResult.data || [],
      assignments: assignmentResult.data || [],
    });
  } catch (e) {
    console.error("OPERATIONS SNAPSHOT GET ERROR:", e);
    return res.status(500).json({ error: "Failed to load operations snapshot" });
  }
});

module.exports = router;
