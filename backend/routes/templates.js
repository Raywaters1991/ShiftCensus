// backend/routes/templates.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

function canManageTemplates(req) {
  const r = String(req.role || "").toLowerCase();
  return ["superadmin", "admin", "don", "ed"].includes(r);
}

// ---------------------------------------------------------------------------
// GET ALL TEMPLATES (ORG SAFE)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    // Load templates for org
    const { data: templates, error: templateErr } = await supabaseAdmin
      .from("schedule_templates")
      .select("*")
      .eq("org_code", orgCode)
      .order("id", { ascending: true });

    if (templateErr) throw templateErr;

    if (!templates || templates.length === 0) return res.json([]);

    const templateIds = templates.map((t) => t.id);

    // Load staff links ONLY for these templates
    const { data: staffLinks, error: staffErr } = await supabaseAdmin
      .from("schedule_template_staff")
      .select("template_id, staff_id")
      .in("template_id", templateIds);

    if (staffErr) throw staffErr;

    const grouped = templates.map((t) => ({
      ...t,
      staff_ids: (staffLinks || []).filter((s) => s.template_id === t.id).map((s) => s.staff_id),
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
router.post("/", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;

    const {
      name,
      role,
      shift_type,
      unit,
      assignment_number,
      days_of_week,
      staff_ids,
    } = req.body || {};

    const { data: template, error } = await supabaseAdmin
      .from("schedule_templates")
      .insert([
        {
          name,
          role,
          shift_type,
          unit,
          assignment_number,
          days_of_week,
          org_code: orgCode,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const rows = staff_ids.map((staff_id) => ({
        template_id: template.id,
        staff_id,
      }));

      const { error: staffErr } = await supabaseAdmin
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
router.put("/:id", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const id = req.params.id;

    // ownership check
    const { data: owned, error: ownErr } = await supabaseAdmin
      .from("schedule_templates")
      .select("id")
      .eq("id", id)
      .eq("org_code", orgCode)
      .maybeSingle();

    if (ownErr) throw ownErr;
    if (!owned) return res.status(403).json({ error: "Not authorized" });

    const {
      name,
      role,
      shift_type,
      unit,
      assignment_number,
      days_of_week,
      staff_ids,
    } = req.body || {};

    const { data: updated, error } = await supabaseAdmin
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
      .eq("org_code", orgCode)
      .select()
      .single();

    if (error) throw error;

    // Reset staff links
    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id", id);

    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const rows = staff_ids.map((staff_id) => ({
        template_id: id,
        staff_id,
      }));
      await supabaseAdmin.from("schedule_template_staff").insert(rows);
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
router.delete("/:id", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error: "Not allowed" });

    const orgCode = req.orgCode || req.org_code;
    const id = req.params.id;

    // ownership check
    const { data: owned, error: ownErr } = await supabaseAdmin
      .from("schedule_templates")
      .select("id")
      .eq("id", id)
      .eq("org_code", orgCode)
      .maybeSingle();

    if (ownErr) throw ownErr;
    if (!owned) return res.status(403).json({ error: "Not authorized" });

    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id", id);
    await supabaseAdmin.from("schedule_templates").delete().eq("id", id).eq("org_code", orgCode);

    res.json({ success: true });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

module.exports = router;
