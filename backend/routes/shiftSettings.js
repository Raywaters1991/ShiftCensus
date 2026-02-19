// backend/routes/shiftSettings.js
const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

// who can change shift settings
function canManageShiftSettings(req) {
  const r = String(req.role || "").toLowerCase();
  return ["superadmin", "admin", "don", "ed"].includes(r);
}

// =====================================================
// GET /shift-settings  (ORG SAFE)
// =====================================================
router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { data, error } = await supabaseAdmin
      .from("shift_settings")
      .select("*")
      .eq("org_code", orgCode)
      .order("role", { ascending: true })
      .order("shift_type", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("SHIFT_SETTINGS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// POST /shift-settings  (ORG SAFE)
// body: { role, shift_type, start_local, end_local }
// =====================================================
router.post("/", async (req, res) => {
  try {
    if (!canManageShiftSettings(req)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const orgCode = req.orgCode || req.org_code;
    const { role, shift_type, start_local, end_local } = req.body || {};

    if (!role || !shift_type || !start_local || !end_local) {
      return res.status(400).json({
        error: "Missing required fields: role, shift_type, start_local, end_local",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("shift_settings")
      .insert({
        org_code: orgCode,
        role,
        shift_type,
        start_local,
        end_local,
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("SHIFT_SETTINGS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// PATCH /shift-settings/:id  (ORG SAFE)
// =====================================================
router.patch("/:id", async (req, res) => {
  try {
    if (!canManageShiftSettings(req)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const orgCode = req.orgCode || req.org_code;
    const { id } = req.params;

    const { role, shift_type, start_local, end_local } = req.body || {};

    if (!role || !shift_type || !start_local || !end_local) {
      return res.status(400).json({
        error: "Missing required fields: role, shift_type, start_local, end_local",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("shift_settings")
      .update({ role, shift_type, start_local, end_local })
      .eq("id", id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });

    res.json(data);
  } catch (err) {
    console.error("SHIFT_SETTINGS PATCH ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// DELETE /shift-settings/:id  (ORG SAFE)
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    if (!canManageShiftSettings(req)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const orgCode = req.orgCode || req.org_code;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("shift_settings")
      .delete()
      .eq("id", id)
      .eq("org_code", orgCode);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("SHIFT_SETTINGS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
