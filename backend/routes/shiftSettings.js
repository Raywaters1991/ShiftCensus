// backend/routes/shiftSettings.js

const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------
// GET /shift-settings  -> all settings for this org
// ---------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { data, error } = await supabase
      .from("shift_settings")
      .select("*")
      .eq("org_code", org)
      .order("role", { ascending: true })
      .order("shift_type", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("SHIFT_SETTINGS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------
// POST /shift-settings  -> create a new rule for this org
// body: { role, shift_type, start_local, end_local }
// ---------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { role, shift_type, start_local, end_local } = req.body;

    if (!role || !shift_type || !start_local || !end_local) {
      return res
        .status(400)
        .json({ error: "Missing required fields: role, shift_type, start_local, end_local" });
    }

    const { data, error } = await supabase
      .from("shift_settings")
      .insert([
        {
          org_code: org,
          role,
          shift_type,
          start_local,
          end_local,
        },
      ])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error("SHIFT_SETTINGS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------
// PUT /shift-settings/:id  -> update a rule for this org
// body: { role, shift_type, start_local, end_local }
// ---------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const id = req.params.id;
    const { role, shift_type, start_local, end_local } = req.body;

    if (!role || !shift_type || !start_local || !end_local) {
      return res
        .status(400)
        .json({ error: "Missing required fields: role, shift_type, start_local, end_local" });
    }

    const { data, error } = await supabase
      .from("shift_settings")
      .update({
        role,
        shift_type,
        start_local,
        end_local,
      })
      .eq("id", id)
      .eq("org_code", org)
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error("SHIFT_SETTINGS PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------
// DELETE /shift-settings/:id
// ---------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    if (!org) return res.status(400).json({ error: "Missing org_code" });

    const { error } = await supabase
      .from("shift_settings")
      .delete()
      .eq("id", req.params.id)
      .eq("org_code", org);

    if (error) throw error;

    res.json({ message: "Shift setting deleted" });
  } catch (err) {
    console.error("SHIFT_SETTINGS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
