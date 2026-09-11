const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const date = String(req.query?.date || "").trim();

    let shiftQuery = supabaseAdmin
      .from("shifts")
      .select("id")
      .eq("org_code", orgCode);

    if (date) shiftQuery = shiftQuery.eq("shift_date", date);

    const { data: shifts, error: shiftErr } = await shiftQuery;
    if (shiftErr) throw shiftErr;

    const ids = (shifts || []).map((s) => s.id);
    if (!ids.length) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from("shift_assignments")
      .select("*")
      .eq("org_code", orgCode)
      .in("shift_id", ids)
      .order("shift_id", { ascending: true });

    if (error) throw error;
    return res.json(data || []);
  } catch (e) {
    console.error("SHIFT ASSIGNMENTS GET ERROR:", e);
    return res.status(500).json({ error: "Failed to load daily assignments" });
  }
});

router.put("/:shiftId", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const shiftId = Number(req.params.shiftId);
    const { unit_id, unit, assignment_number } = req.body || {};

    if (!Number.isFinite(shiftId)) return res.status(400).json({ error: "Invalid shift id" });
    if (!unit && !unit_id) return res.status(400).json({ error: "Unit is required" });

    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from("shifts")
      .select("id,staff_id,role,shift_date")
      .eq("id", shiftId)
      .eq("org_code", orgCode)
      .maybeSingle();

    if (shiftErr || !shift) return res.status(404).json({ error: "Shift not found in this facility" });

    let resolvedUnit = unit ? String(unit).trim() : null;
    let resolvedUnitId = unit_id ?? null;

    if (resolvedUnitId) {
      const { data: unitRow, error: unitErr } = await supabaseAdmin
        .from("units")
        .select("id,name")
        .eq("id", resolvedUnitId)
        .eq("org_code", orgCode)
        .maybeSingle();
      if (unitErr || !unitRow) return res.status(400).json({ error: "Invalid unit" });
      resolvedUnit = unitRow.name;
      resolvedUnitId = unitRow.id;
    } else if (resolvedUnit) {
      const { data: unitRow } = await supabaseAdmin
        .from("units")
        .select("id,name")
        .eq("name", resolvedUnit)
        .eq("org_code", orgCode)
        .maybeSingle();
      if (unitRow) resolvedUnitId = unitRow.id;
    }

    const payload = {
      org_code: orgCode,
      shift_id: shiftId,
      unit_id: resolvedUnitId,
      unit: resolvedUnit,
      assignment_number: assignment_number === "" || assignment_number == null ? null : Number(assignment_number),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("shift_assignments")
      .upsert(payload, { onConflict: "shift_id" })
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (e) {
    console.error("SHIFT ASSIGNMENTS PUT ERROR:", e);
    return res.status(500).json({ error: "Failed to save daily assignment" });
  }
});

router.delete("/:shiftId", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const shiftId = Number(req.params.shiftId);
    if (!Number.isFinite(shiftId)) return res.status(400).json({ error: "Invalid shift id" });

    const { error } = await supabaseAdmin
      .from("shift_assignments")
      .delete()
      .eq("shift_id", shiftId)
      .eq("org_code", orgCode);

    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    console.error("SHIFT ASSIGNMENTS DELETE ERROR:", e);
    return res.status(500).json({ error: "Failed to clear daily assignment" });
  }
});

module.exports = router;
