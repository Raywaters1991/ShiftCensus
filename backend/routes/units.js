// backend/routes/units.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

// All routes require auth + org context
router.use(requireAuth);
router.use(requireOrg);

// GET — all units for active org
router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode; // always resolved now

    const { data, error } = await supabase
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
    const orgCode = req.orgCode;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: "Unit name required" });

    const { data, error } = await supabase
      .from("units")
      .insert([{ name, org_code: orgCode }])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("UNITS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT — update unit (ORG SAFE)
router.put("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode;
    const { name } = req.body;

    const { data, error } = await supabase
      .from("units")
      .update({ name })
      .eq("id", req.params.id)
      .eq("org_code", orgCode)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("UNITS PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE — remove unit (ORG SAFE)
router.delete("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode;

    const { error } = await supabase
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
