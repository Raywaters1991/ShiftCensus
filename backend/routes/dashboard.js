const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

router.use(requireAuth);
router.use(requireOrg);

router.get("/", async (req, res) => {
  try {
    const orgId = req.orgId;
    const orgCode = req.orgCode || req.org_code;
    const date = String(req.query.date || "");

    if (!validDate(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    if (String(req.role || "").toLowerCase() !== "superadmin") {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("org_memberships")
        .select("can_dashboard_read,is_active")
        .eq("user_id", req.userId)
        .eq("org_id", orgId)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.is_active || !membership?.can_dashboard_read) {
        return res.status(403).json({ error: "Dashboard access required" });
      }
    }

    const [shiftResult, bedResult] = await Promise.all([
      supabaseAdmin
        .from("shifts")
        .select("id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,timezone")
        .eq("org_code", orgCode)
        .eq("shift_date", date)
        .order("start_time", { ascending: true }),
      supabaseAdmin
        .from("facility_beds")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true),
    ]);

    if (shiftResult.error) throw shiftResult.error;
    if (bedResult.error) throw bedResult.error;

    const shifts = shiftResult.data || [];
    const activeBeds = bedResult.data || [];
    const staffIds = [...new Set(shifts.map((s) => s.staff_id).filter(Boolean))];
    const shiftIds = shifts.map((s) => s.id).filter(Boolean);
    const bedIds = activeBeds.map((b) => b.id).filter(Boolean);

    const [staffResult, assignmentResult, censusResult] = await Promise.all([
      staffIds.length
        ? supabaseAdmin
            .from("staff")
            .select("id,name,role")
            .eq("org_code", orgCode)
            .in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
      shiftIds.length
        ? supabaseAdmin
            .from("shift_assignments")
            .select("shift_id,unit_id,unit")
            .eq("org_code", orgCode)
            .in("shift_id", shiftIds)
        : Promise.resolve({ data: [], error: null }),
      bedIds.length
        ? supabaseAdmin
            .from("census")
            .select("facility_bed_id,status")
            .eq("org_id", orgId)
            .in("facility_bed_id", bedIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (assignmentResult.error) throw assignmentResult.error;
    if (censusResult.error) throw censusResult.error;

    let occupied = 0;
    let leave = 0;
    for (const row of censusResult.data || []) {
      const status = String(row.status || "empty").toLowerCase();
      if (status === "occupied") occupied += 1;
      else if (status === "leave") leave += 1;
    }

    const total = activeBeds.length;
    const empty = Math.max(total - occupied - leave, 0);

    return res.json({
      date,
      census: { occupied, leave, empty, total },
      shifts,
      staff: staffResult.data || [],
      assignments: assignmentResult.data || [],
    });
  } catch (err) {
    console.error("DASHBOARD GET ERROR:", err);
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
});

module.exports = router;
