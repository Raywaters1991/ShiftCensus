const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

const ROLE_GROUPS = ["Nurse", "CNA"];
const SHIFT_TYPES = ["Day", "Evening", "Night"];
const validDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function coverageDefaults() {
  const rows = [];
  for (const role_group of ROLE_GROUPS) {
    for (const shift_type of SHIFT_TYPES) rows.push({ role_group, shift_type, required_count: 0 });
  }
  return rows;
}

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

router.get("/", async (req, res) => {
  const started = Date.now();
  try {
    const orgCode = req.orgCode || req.org_code;
    const orgId = req.orgId;
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");

    if (!validDate(from) || !validDate(to) || from > to) {
      return res.status(400).json({ error: "Valid from/to dates are required" });
    }

    const [shiftResult, staffResult, leaveResult, coverageResult] = await Promise.all([
      supabaseAdmin
        .from("shifts")
        .select("id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,timezone,department_id,is_published,published_at,open_reason,original_staff_id,bonus_enabled,bonus_type,bonus_amount,bonus_note,called_off_at")
        .eq("org_code", orgCode)
        .gte("shift_date", from)
        .lte("shift_date", to)
        .order("start_time"),
      supabaseAdmin
        .from("staff")
        .select("id,name,role")
        .eq("org_code", orgCode)
        .order("name"),
      supabaseAdmin
        .from("shift_requests")
        .select("id,staff_id,start_date,end_date,reason,decided_at")
        .eq("org_code", orgCode)
        .eq("request_type", "time_off")
        .eq("status", "approved")
        .lte("start_date", to)
        .gte("end_date", from)
        .order("start_date"),
      supabaseAdmin
        .from("schedule_coverage_requirements")
        .select("role_group,shift_type,required_count")
        .eq("org_id", orgId),
    ]);

    if (shiftResult.error) throw shiftResult.error;
    if (staffResult.error) throw staffResult.error;
    if (leaveResult.error) throw leaveResult.error;
    if (coverageResult.error) throw coverageResult.error;

    const coverageMap = new Map(
      (coverageResult.data || []).map((row) => [`${row.role_group}|${row.shift_type}`, row])
    );
    const requirements = coverageDefaults().map(
      (row) => coverageMap.get(`${row.role_group}|${row.shift_type}`) || row
    );

    return res.json({
      from,
      to,
      shifts: shiftResult.data || [],
      staff: staffResult.data || [],
      pto: leaveResult.data || [],
      requirements,
      meta: { server_ms: Date.now() - started },
    });
  } catch (err) {
    console.error("SCHEDULE VIEW ERROR:", err);
    return res.status(500).json({ error: "Failed to load schedule" });
  }
});

module.exports = router;
