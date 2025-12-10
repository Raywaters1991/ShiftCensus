// backend/routes/templates.js

const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// GET ALL TEMPLATES (with staff IDs)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];

    const { data: templates, error: templateErr } = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("org_code", org)
      .order("id", { ascending: true });

    if (templateErr) throw templateErr;

    // Load staff for each template
    const { data: staffLinks, error: staffErr } = await supabase
      .from("schedule_template_staff")
      .select("*");

    if (staffErr) throw staffErr;

    const grouped = templates.map((t) => ({
      ...t,
      staff_ids: staffLinks
        .filter((s) => s.template_id === t.id)
        .map((s) => s.staff_id),
    }));

    res.json(grouped);
  } catch (err) {
    console.error("TEMPLATE GET ERROR:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

// ---------------------------------------------------------------------------
// CREATE TEMPLATE
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const org = req.headers["x-org-code"];
    const {
      name,
      role,
      shift_type,
      unit,
      assignment_number,
      days_of_week,
      staff_ids,
    } = req.body;

    // Create template
    const { data: template, error } = await supabase
      .from("schedule_templates")
      .insert([
        {
          name,
          role,
          shift_type,
          unit,
          assignment_number,
          days_of_week,
          org_code: org,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Insert staff links
    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const rows = staff_ids.map((sid) => ({
        template_id: template.id,
        staff_id: sid,
      }));

      const { error: staffErr } = await supabase
        .from("schedule_template_staff")
        .insert(rows);

      if (staffErr) throw staffErr;
    }

    res.json(template);
  } catch (err) {
    console.error("TEMPLATE CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// ---------------------------------------------------------------------------
// UPDATE TEMPLATE
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const {
      name,
      role,
      shift_type,
      unit,
      assignment_number,
      days_of_week,
      staff_ids,
    } = req.body;

    // Update template row
    const { data: updated, error } = await supabase
      .from("schedule_templates")
      .update({
        name,
        role,
        shift_type,
        unit,
        assignment_number,
        days_of_week,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Clear old staff links
    await supabase
      .from("schedule_template_staff")
      .delete()
      .eq("template_id", id);

    // Add new links
    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const rows = staff_ids.map((sid) => ({
        template_id: id,
        staff_id: sid,
      }));

      await supabase.from("schedule_template_staff").insert(rows);
    }

    res.json(updated);
  } catch (err) {
    console.error("TEMPLATE UPDATE ERROR:", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// ---------------------------------------------------------------------------
// DELETE TEMPLATE
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Delete staff links
    await supabase
      .from("schedule_template_staff")
      .delete()
      .eq("template_id", id);

    // Delete template itself
    await supabase.from("schedule_templates").delete().eq("id", id);

    res.json({ success: true });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

module.exports = router;
