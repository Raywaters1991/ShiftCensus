// backend/routes/shifts.js
const express = require("express");
const router = express.Router();
require("dotenv").config();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

/* ------------------------------------------------------------------
   Build local → UTC timestamp
------------------------------------------------------------------- */
function buildDateTime(shift_date, timeStr, timezone) {
  const localString = `${shift_date}T${timeStr}`;

  const localDate = new Date(
    new Date(localString).toLocaleString("en-US", {
      timeZone: timezone,
    })
  );

  if (isNaN(localDate.getTime())) {
    console.error("❌ buildDateTime INVALID:", { shift_date, timeStr, timezone });
    throw new Error("Invalid datetime conversion");
  }

  return localDate.toISOString();
}

/* ------------------------------------------------------------------
   Convert start_local + end_local into UTC, including overnight wrap
------------------------------------------------------------------- */
function computeShiftTimes(shift_date, setting, timezone) {
  const startUtc = buildDateTime(shift_date, setting.start_local, timezone);
  let endUtc = buildDateTime(shift_date, setting.end_local, timezone);

  if (setting.end_local < setting.start_local) {
    const d = new Date(endUtc);
    d.setUTCDate(d.getUTCDate() + 1);
    endUtc = d.toISOString();
  }

  return { startUtc, endUtc };
}

// enforce auth + org context
router.use(requireAuth);
router.use(requireOrg);

/* ------------------------------------------------------------------
   GET — fetch all shifts for facility
------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .select("*")
      .eq("org_code", orgCode)
      .order("start_time", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("SHIFT GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------------------------------------------------
   POST — create shift
------------------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { staff_id, shift_date, shiftType, unit, assignment_number, timezone } = req.body;

    if (!staff_id || !shift_date || !shiftType) {
      return res.status(400).json({
        error: "Missing required fields: staff_id, shift_date, shiftType",
      });
    }

    const facilityTimezone = timezone || "America/Los_Angeles";

    const { data: staffData, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("role")
      .eq("id", staff_id)
      .eq("org_code", orgCode)
      .maybeSingle();

    if (staffErr || !staffData) {
      return res.status(400).json({ error: "Invalid staff_id" });
    }

    const role = staffData.role;

    const { data: setting, error: settingErr } = await supabaseAdmin
      .from("shift_settings")
      .select("*")
      .eq("org_code", orgCode)
      .eq("role", role)
      .eq("shift_type", shiftType)
      .maybeSingle();

    if (settingErr || !setting) {
      return res.status(400).json({
        error: `No shift settings found for ${role} ${shiftType}`,
      });
    }

    const { startUtc, endUtc } = computeShiftTimes(shift_date, setting, facilityTimezone);

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .insert([
        {
          staff_id,
          role,
          unit,
          assignment_number,
          shift_date,
          start_local: setting.start_local,
          end_local: setting.end_local,
          start_time: startUtc,
          end_time: endUtc,
          timezone: facilityTimezone,
          org_code: orgCode,
        },
      ])
      .select();

    if (error) throw error;

    res.json(data?.[0] || null);
  } catch (err) {
    console.error("SHIFT POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------------------------------------------------
   PUT — update shift
------------------------------------------------------------------- */
router.put("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const id = req.params.id;

    const { staff_id, shift_date, shiftType, unit, assignment_number, timezone } = req.body;

    if (!staff_id || !shift_date || !shiftType) {
      return res.status(400).json({
        error: "Missing required fields: staff_id, shift_date, shiftType",
      });
    }

    const facilityTimezone = timezone || "America/Los_Angeles";

    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("role")
      .eq("id", staff_id)
      .eq("org_code", orgCode)
      .maybeSingle();

    if (!staffData) return res.status(400).json({ error: "Invalid staff_id" });

    const role = staffData.role;

    const { data: setting } = await supabaseAdmin
      .from("shift_settings")
      .select("*")
      .eq("org_code", orgCode)
      .eq("role", role)
      .eq("shift_type", shiftType)
      .maybeSingle();

    if (!setting) {
      return res.status(400).json({
        error: `No shift settings found for ${role} ${shiftType}`,
      });
    }

    const { startUtc, endUtc } = computeShiftTimes(shift_date, setting, facilityTimezone);

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .update({
        staff_id,
        role,
        unit,
        assignment_number,
        shift_date,
        start_local: setting.start_local,
        end_local: setting.end_local,
        start_time: startUtc,
        end_time: endUtc,
        timezone: facilityTimezone,
      })
      .eq("id", id)
      .eq("org_code", orgCode)
      .select();

    if (error) throw error;

    res.json(data?.[0] || null);
  } catch (err) {
    console.error("SHIFT PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------------------------------------------------------
   DELETE — remove shift
------------------------------------------------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { error } = await supabaseAdmin
      .from("shifts")
      .delete()
      .eq("id", req.params.id)
      .eq("org_code", orgCode);

    if (error) throw error;

    res.json({ message: "Shift deleted" });
  } catch (err) {
    console.error("SHIFT DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
