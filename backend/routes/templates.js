// backend/routes/templates.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// -----------------------------------------------------
// ORG CONTEXT
// -----------------------------------------------------
function getOrg(req) {
  return req.headers["x-org-code"] || null;
}

function isSuperAdmin(req) {
  return req.user?.app_metadata?.role === "superadmin";
}

// ---------------------------------------------------------------------------
// GET ALL TEMPLATES (ORG SAFE)
// ---------------------------------------------------------------------------
router.get("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    if (!org && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context" });
    }

    // Load templates for org
    let templateQuery = supabase
      .from("schedule_templates")
      .select("*")
      .order("id", { ascending: true });

    if (!isSuperAdmin(req)) {
      templateQuery = templateQuery.eq("org_code", org);
    }

    const { data: templates, error: templateErr } = await templateQuery;
    if (templateErr) throw templateErr;

    if (!templates || templates.length === 0) {
      return res.json([]);
    }

    const templateIds = templates.map(t => t.id);

    // Load staff links ONLY for these templates
    const { data: staffLinks, error: staffErr } = await supabase
      .from("schedule_template_staff")
      .select("template_id, staff_id")
      .in("template_id", templateIds);

    if (staffErr) throw staffErr;

    const grouped = templates.map(t => ({
      ...t,
      staff_ids: staffLinks
        .filter(s => s.template_id === t.id)
        .map(s => s.staff_id),
    }));

    res.json(grouped);
  } catch (err) {
    console.error("TEMPLATE GET ERROR:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

// ---------------------------------------------------------------------------
// CREATE TEMPLATE (ORG SAFE)
// ---------------------------------------------------------------------------
router.post("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    if (!org && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context" });
    }

    const {
      name,
      role,
      shift_type,
      unit,
      assignment_number,
      days_of_week,
      staff_ids,
    } = req.body;

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

    // Insert staff links (ORG SAFE — staff already org-scoped)
    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const rows = staff_ids.map(staff_id => ({
        template_id: template.id,
        staff_id,
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
// UPDATE TEMPLATE (ORG SAFE)
// ---------------------------------------------------------------------------
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    const id = req.params.id;

    let ownershipCheck = supabase
      .from("schedule_templates")
      .select("id")
      .eq("id", id);

    if (!isSuperAdmin(req)) {
      ownershipCheck = ownershipCheck.eq("org_code", org);
    }

    const { data: owned } = await ownershipCheck.single();
    if (!owned) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const {
      name,
      role,
      shift_type,
      unit,
      assignment_number,
      days_of_week,
      staff_ids,
    } = req.body;

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

    // Reset staff links
    await supabase
      .from("schedule_template_staff")
      .delete()
      .eq("template_id", id);

    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const rows = staff_ids.map(staff_id => ({
        template_id: id,
        staff_id,
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
// DELETE TEMPLATE (ORG SAFE)
// ---------------------------------------------------------------------------
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    const id = req.params.id;

    let ownershipCheck = supabase
      .from("schedule_templates")
      .select("id")
      .eq("id", id);

    if (!isSuperAdmin(req)) {
      ownershipCheck = ownershipCheck.eq("org_code", org);
    }

    const { data: owned } = await ownershipCheck.single();
    if (!owned) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await supabase
      .from("schedule_template_staff")
      .delete()
      .eq("template_id", id);

    await supabase
      .from("schedule_templates")
      .delete()
      .eq("id", id);

    res.json({ success: true });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

module.exports = router;
