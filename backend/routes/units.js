// backend/routes/units.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

// GET — all units for active org
router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { data, error } = await supabaseAdmin
      .from("units")
      .select("*")
      .eq("org_code", orgCode)
      .order("name");

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("UNITS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST — create unit in active org
router.post("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: "Unit name required" });

    const { data, error } = await supabaseAdmin
      .from("units")
      .insert([{ name, org_code: orgCode }])
      .select();

    if (error) throw error;
    res.json(data?.[0] || null);
  } catch (err) {
    console.error("UNITS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT — update unit (org-scoped)
router.put("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { name } = req.body;

    const { data, error } = await supabaseAdmin
      .from("units")
      .update({ name })
      .eq("id", req.params.id)
      .eq("org_code", orgCode)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Unit not found" });
    }

    res.json(data[0]);
  } catch (err) {
    console.error("UNITS PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE — remove unit (org-scoped)
router.delete("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { error } = await supabaseAdmin
      .from("units")
      .delete()
      .eq("id", req.params.id)
      .eq("org_code", orgCode);

    if (error) throw error;
    res.json({ message: "Unit deleted" });
  } catch (err) {
    console.error("UNITS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
