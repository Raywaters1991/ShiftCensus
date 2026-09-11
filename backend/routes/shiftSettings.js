// backend/routes/shiftSettings.js
const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

function canManageShiftSettings(req) {
  return String(req.role || "").toLowerCase() === "superadmin" || !!req.schedulePermissions?.canWrite;
}

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { data, error } = await supabaseAdmin.from("shift_settings").select("*").eq("org_code",orgCode).order("role",{ascending:true}).order("shift_type",{ascending:true});
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("SHIFT_SETTINGS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!canManageShiftSettings(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const { role, shift_type, start_local, end_local } = req.body || {};
    if (!role || !shift_type || !start_local || !end_local) return res.status(400).json({ error: "Missing required fields: role, shift_type, start_local, end_local" });
    const { data, error } = await supabaseAdmin.from("shift_settings").insert({org_code:orgCode,role,shift_type,start_local,end_local}).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("SHIFT_SETTINGS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!canManageShiftSettings(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const { role, shift_type, start_local, end_local } = req.body || {};
    if (!role || !shift_type || !start_local || !end_local) return res.status(400).json({ error: "Missing required fields: role, shift_type, start_local, end_local" });
    const { data, error } = await supabaseAdmin.from("shift_settings").update({role,shift_type,start_local,end_local}).eq("id",req.params.id).eq("org_code",orgCode).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found in this organization" });
    res.json(data);
  } catch (err) {
    console.error("SHIFT_SETTINGS PATCH ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!canManageShiftSettings(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const { data, error } = await supabaseAdmin.from("shift_settings").delete().eq("id",req.params.id).eq("org_code",orgCode).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Not found in this organization" });
    res.json({ success: true });
  } catch (err) {
    console.error("SHIFT_SETTINGS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
