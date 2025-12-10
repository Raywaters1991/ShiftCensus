// backend/routes/units.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// Get org_code from authenticated user
function getOrg(req) {
  return req.user?.user_metadata?.org_code || null;
}

// -------------------------------------------------------------
// GET all units for facility
// -------------------------------------------------------------
router.get("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { data, error } = await supabase
      .from("units")
      .select("*")
      .eq("org_code", org)
      .order("name");

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("UNITS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// POST — create a new unit
// -------------------------------------------------------------
router.post("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Unit name required" });

    const { data, error } = await supabase
      .from("units")
      .insert([{ name, org_code: org }])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error("UNITS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// PUT — update a unit
// -------------------------------------------------------------
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { name } = req.body;

    const { data, error } = await supabase
      .from("units")
      .update({ name })
      .eq("id", req.params.id)
      .eq("org_code", org)
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error("UNITS PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// DELETE — remove a unit
// -------------------------------------------------------------
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { error } = await supabase
      .from("units")
      .delete()
      .eq("id", req.params.id)
      .eq("org_code", org);

    if (error) throw error;

    res.json({ message: "Unit deleted" });
  } catch (err) {
    console.error("UNITS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
