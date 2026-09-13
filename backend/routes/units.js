// backend/routes/units.js
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
    const { data, error } = await supabaseAdmin.from("units").select("*").eq("org_code", orgCode).order("name");
    if (error) throw error;
    res.json(data || []);
  } catch (err) { console.error("UNITS GET ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

router.post("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Unit name required" });
    const { data, error } = await supabaseAdmin.from("units").insert([{ name, org_code: orgCode }]).select();
    if (error) throw error;
    res.json(data?.[0] || null);
  } catch (err) { console.error("UNITS POST ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

async function updateUnit(req, res) {
  try {
    const orgCode = req.orgCode || req.org_code;
    const unitId = Number(req.params.id);
    const name = String(req.body?.name || "").trim();
    if (!Number.isFinite(unitId)) return res.status(400).json({ error: "Invalid unit id" });
    if (!name) return res.status(400).json({ error: "Unit name required" });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("units")
      .select("id,name")
      .eq("id", unitId)
      .eq("org_code", orgCode)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ error: "Unit not found" });

    const { data, error } = await supabaseAdmin
      .from("units")
      .update({ name })
      .eq("id", unitId)
      .eq("org_code", orgCode)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: "Unit not found" });

    // shift_assignments stores both unit_id and a display-name snapshot.
    // Keep the snapshot synchronized so dashboards/offline snapshots reflect renames immediately.
    const { error: assignmentError } = await supabaseAdmin
      .from("shift_assignments")
      .update({ unit: name, updated_at: new Date().toISOString() })
      .eq("org_code", orgCode)
      .eq("unit_id", unitId);
    if (assignmentError) throw assignmentError;

    res.json(data[0]);
  } catch (err) { console.error("UNITS UPDATE ERROR:", err); res.status(500).json({ error: "Server error" }); }
}

// Support both verbs: the current Admin UI uses PATCH while older clients used PUT.
router.put("/:id", updateUnit);
router.patch("/:id", updateUnit);

router.delete("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { error } = await supabaseAdmin.from("units").delete().eq("id", req.params.id).eq("org_code", orgCode);
    if (error) throw error;
    res.json({ message: "Unit deleted" });
  } catch (err) { console.error("UNITS DELETE ERROR:", err); res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
