// backend/routes/assignments.js

const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET all assignments for org
router.get("/", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { data, error } = await supabase
      .from("cna_assignments")
      .select("*")
      .eq("org_code", org)
      .order("unit", { ascending: true })
      .order("number", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("ASSIGNMENTS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE assignment
router.post("/", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { unit, number, label } = req.body;

    if (!unit || !number)
      return res.status(400).json({ error: "Missing fields" });

    const { data, error } = await supabase
      .from("cna_assignments")
      .insert([
        {
          org_code: org,
          unit,
          number,
          label: label || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("ASSIGNMENTS POST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE assignment
router.put("/:id", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { id } = req.params;
    const { unit, number, label } = req.body;

    const { data, error } = await supabase
      .from("cna_assignments")
      .update({
        unit,
        number,
        label: label || null,
      })
      .eq("id", id)
      .eq("org_code", org)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("ASSIGNMENTS PUT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE assignment
router.delete("/:id", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { id } = req.params;

    const { error } = await supabase
      .from("cna_assignments")
      .delete()
      .eq("id", id)
      .eq("org_code", org);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("ASSIGNMENTS DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
