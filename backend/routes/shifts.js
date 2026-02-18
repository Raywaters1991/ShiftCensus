// backend/routes/shifts.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildDateTime(shift_date, timeStr, timezone) {
  const localString = `${shift_date}T${timeStr}`;
  const localDate = new Date(
    new Date(localString).toLocaleString("en-US", { timeZone: timezone })
  );
  if (isNaN(localDate.getTime())) throw new Error("Invalid datetime conversion");
  return localDate.toISOString();
}

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

router.use(requireAuth);
router.use(requireOrg);

function getOrgCode(req) {
  return req.orgCode || req.org_code || null;
}

// GET shifts (optionally by date)
router.get("/", async (req, res) => {
  try {
    const orgCode = getOrgCode(req);
    if (!orgCode) return res.status(400).json({ error: "Missing org_code" });

    const { date } = req.query;

    let q = supabase
      .from("shifts")
      .select("*")
      .eq("org_code", orgCode)
      .order("start_time", { ascending: true });

    if (date) q = q.eq("shift_date", String(date));

    const { data, error } = await q;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("SHIFT GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST create shift
router.post("/", async (req, res) => {
  try {
    const orgCode = getOrgCode(req);
    if (!orgCode) return res.status(400).json({ error: "Missing org_code" });

    const { staff_id, shift_date, shiftType, unit, assignment_number, timezone } =
      req.body;

    if (!staff_id || !shift_date || !shiftType) {
      return res.status(400).json({
        error: "Missing required fields: staff_id, shift_date, shiftType",
      });
    }

    const facilityTimezone = timezone || "America/Los_Angeles";

    // lookup staff role
    const { data: staffData, error: staffErr } = await supabase
      .from("staff")
      .select("role")
      .eq("id", staff_id)
      .eq("org_code", orgCode)
      .single();

    if (staffErr || !staffData) {
      return res.status(400).json({ error: "Invalid staff_id" });
    }

    // normalize role to lower for shift_settings lookup, but store original too if you want
    const staffRole = String(staffData.role || "");
    const roleKey = staffRole.toLowerCase();

    // lookup shift settings by org + role + shift_type
    const { data: setting, error: settingErr } = await supabase
      .from("shift_settings")
      .select("*")
      .eq("org_code", orgCode)
      .eq("role", roleKey)
      .eq("shift_type", shiftType)
      .single();

    if (settingErr || !setting) {
      return res.status(400).json({
        error: `No shift settings found for ${roleKey} ${shiftType}`,
      });
    }

    const { startUtc, endUtc } = computeShiftTimes(
      shift_date,
      setting,
      facilityTimezone
    );

    const { data, error } = await supabase
      .from("shifts")
      .insert([
        {
          staff_id,
          role: staffRole,          // keep display-friendly value (LPN)
          shift_type: shiftType,    // ✅ THIS is what your dashboard needs
          unit: unit || null,
          assignment_number: assignment_number || null,
          shift_date,
          start_local: setting.start_local,
          end_local: setting.end_local,
          start_time: startUtc,
          end_time: endUtc,
          timezone: facilityTimezone,
          org_code: orgCode,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("SHIFT POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT update shift
router.put("/:id", async (req, res) => {
  try {
    const orgCode = getOrgCode(req);
    if (!orgCode) return res.status(400).json({ error: "Missing org_code" });

    const id = req.params.id;
    const { staff_id, shift_date, shiftType, unit, assignment_number, timezone } =
      req.body;

    if (!staff_id || !shift_date || !shiftType) {
      return res.status(400).json({
        error: "Missing required fields: staff_id, shift_date, shiftType",
      });
    }

    const facilityTimezone = timezone || "America/Los_Angeles";

    const { data: staffData } = await supabase
      .from("staff")
      .select("role")
      .eq("id", staff_id)
      .eq("org_code", orgCode)
      .single();

    if (!staffData) return res.status(400).json({ error: "Invalid staff_id" });

    const staffRole = String(staffData.role || "");
    const roleKey = staffRole.toLowerCase();

    const { data: setting } = await supabase
      .from("shift_settings")
      .select("*")
      .eq("org_code", orgCode)
      .eq("role", roleKey)
      .eq("shift_type", shiftType)
      .single();

    if (!setting) {
      return res.status(400).json({
        error: `No shift settings found for ${roleKey} ${shiftType}`,
      });
    }

    const { startUtc, endUtc } = computeShiftTimes(
      shift_date,
      setting,
      facilityTimezone
    );

    const { data, error } = await supabase
      .from("shifts")
      .update({
        staff_id,
        role: staffRole,
        shift_type: shiftType, // ✅
        unit: unit || null,
        assignment_number: assignment_number || null,
        shift_date,
        start_local: setting.start_local,
        end_local: setting.end_local,
        start_time: startUtc,
        end_time: endUtc,
        timezone: facilityTimezone,
      })
      .eq("id", id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("SHIFT PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const orgCode = getOrgCode(req);
    if (!orgCode) return res.status(400).json({ error: "Missing org_code" });

    const { error } = await supabase
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
