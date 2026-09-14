const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

function monthRange(monthKey) {
  const [yStr, mStr] = String(monthKey || "").split("-");
  const y = Number(yStr), m = Number(mStr);
  if (!y || m < 1 || m > 12) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function isNurseRole(value) {
  return ["RN", "LPN", "NURSE"].includes(String(value || "").trim().toUpperCase());
}

router.use(requireAuth);
router.use(requireOrg);

router.get("/home-summary", async (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const orgCode = req.orgCode || req.org_code;
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id,role")
      .eq("org_code", orgCode)
      .eq("user_id", req.userId)
      .maybeSingle();
    if (staffErr) throw staffErr;

    const staffId = staff?.id || null;
    let myShifts = [];
    let timeOff = [];
    let pending = [];

    if (staffId) {
      const [shiftResult, timeOffResult, pendingResult] = await Promise.all([
        supabaseAdmin
          .from("shifts")
          .select("id,org_code,staff_id,role,shift_date,start_local,end_local,timezone,shift_type")
          .eq("org_code", orgCode)
          .eq("staff_id", staffId)
          .gte("shift_date", range.start)
          .lt("shift_date", range.end)
          .order("shift_date", { ascending: true }),
        supabaseAdmin
          .from("shift_requests")
          .select("id,start_date,end_date,status,reason,decided_at,decision_note")
          .eq("org_code", orgCode)
          .eq("staff_id", staffId)
          .eq("request_type", "time_off")
          .eq("status", "approved")
          .lt("start_date", range.end)
          .gte("end_date", range.start)
          .order("start_date", { ascending: true }),
        supabaseAdmin
          .from("shift_requests")
          .select("id,request_type,shift_id,start_date,end_date,status,reason,created_at")
          .eq("org_code", orgCode)
          .eq("staff_id", staffId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);

      if (shiftResult.error) throw shiftResult.error;
      if (timeOffResult.error) throw timeOffResult.error;
      if (pendingResult.error) throw pendingResult.error;

      const shifts = shiftResult.data || [];
      const shiftIds = shifts.map((s) => s.id).filter(Boolean);
      let assignmentByShift = new Map();
      if (shiftIds.length) {
        const { data: assignmentRows, error: assignmentErr } = await supabaseAdmin
          .from("shift_assignments")
          .select("shift_id,unit")
          .eq("org_code", orgCode)
          .in("shift_id", shiftIds);
        if (assignmentErr) throw assignmentErr;
        assignmentByShift = new Map((assignmentRows || []).map((a) => [String(a.shift_id), a.unit || null]));
      }

      myShifts = shifts.map((s) => ({
        ...s,
        date: s.shift_date,
        unit_name: assignmentByShift.get(String(s.id)) || null,
      }));
      timeOff = timeOffResult.data || [];
      pending = pendingResult.data || [];
    }

    let openQuery = supabaseAdmin
      .from("shifts")
      .select("id,org_code,staff_id,role,shift_date,start_local,end_local,timezone,shift_type")
      .eq("org_code", orgCode)
      .is("staff_id", null)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end)
      .order("shift_date", { ascending: true });

    if (staff?.role) {
      if (isNurseRole(staff.role)) openQuery = openQuery.in("role", ["Nurse", "RN", "LPN"]);
      else openQuery = openQuery.eq("role", staff.role);
    } else {
      openQuery = openQuery.limit(0);
    }

    const { data: openRows, error: openErr } = await openQuery;
    if (openErr) throw openErr;

    return res.json({
      myShifts,
      openShifts: (openRows || []).map((s) => ({ ...s, date: s.shift_date })),
      pending,
      timeOff,
      staffId,
      activeOrg: { id: req.orgId, org_code: orgCode, name: req.orgName || null },
      isSuperadmin: String(req.role || "").toLowerCase() === "superadmin",
    });
  } catch (e) {
    console.error("ME HOME SUMMARY V2 ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
