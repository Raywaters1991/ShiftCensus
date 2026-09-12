// backend/routes/templates.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

function canManageTemplates(req) {
  if (String(req.role || "").toLowerCase() === "superadmin") return true;
  return !!req.schedulePermissions?.canWrite;
}

async function validateStaffIds(orgCode, staffIds) {
  if (!Array.isArray(staffIds) || staffIds.length === 0) return { valid: true, ids: [] };
  const ids = [...new Set(staffIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (ids.length !== new Set(staffIds.map(String)).size) return { valid: false, ids: [] };
  const { data, error } = await supabaseAdmin.from("staff").select("id").eq("org_code", orgCode).in("id", ids);
  if (error) throw error;
  return { valid: (data || []).length === ids.length, ids };
}

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { data: templates, error: templateErr } = await supabaseAdmin.from("schedule_templates").select("*").eq("org_code", orgCode).order("id", { ascending: true });
    if (templateErr) throw templateErr;
    if (!templates || templates.length === 0) return res.json([]);
    const templateIds = templates.map(t => t.id);
    const { data: staffLinks, error: staffErr } = await supabaseAdmin.from("schedule_template_staff").select("template_id, staff_id").in("template_id", templateIds);
    if (staffErr) throw staffErr;
    res.json(templates.map(t => ({...t, staff_ids:(staffLinks||[]).filter(s=>s.template_id===t.id).map(s=>s.staff_id)})));
  } catch (err) {
    console.error("TEMPLATE GET ERROR:", err);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const { name, role, shift_type, unit, assignment_number, days_of_week, staff_ids } = req.body || {};

    // Validate every referenced employee before creating the template so an invalid
    // cross-org staff id cannot leave behind an orphan/partial template row.
    const staffCheck = await validateStaffIds(orgCode, staff_ids);
    if (!staffCheck.valid) return res.status(400).json({ error: "One or more staff members do not belong to this organization" });

    const { data: template, error } = await supabaseAdmin.from("schedule_templates").insert([{name,role,shift_type,unit,assignment_number,days_of_week,org_code:orgCode}]).select().single();
    if (error) throw error;

    if (staffCheck.ids.length > 0) {
      const { error: staffErr } = await supabaseAdmin.from("schedule_template_staff").insert(staffCheck.ids.map(staff_id => ({template_id:template.id,staff_id})));
      if (staffErr) {
        // Best-effort cleanup keeps failed creates from persisting partial rows.
        await supabaseAdmin.from("schedule_templates").delete().eq("id", template.id).eq("org_code", orgCode);
        throw staffErr;
      }
    }
    res.json({...template, staff_ids:staffCheck.ids});
  } catch (err) {
    console.error("TEMPLATE CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const id = req.params.id;
    const { data: owned, error: ownErr } = await supabaseAdmin.from("schedule_templates").select("id").eq("id",id).eq("org_code",orgCode).maybeSingle();
    if (ownErr) throw ownErr;
    if (!owned) return res.status(404).json({ error: "Template not found in this organization" });
    const { name, role, shift_type, unit, assignment_number, days_of_week, staff_ids } = req.body || {};

    const staffCheck = await validateStaffIds(orgCode, staff_ids);
    if (!staffCheck.valid) return res.status(400).json({ error: "One or more staff members do not belong to this organization" });

    const { data: updated, error } = await supabaseAdmin.from("schedule_templates").update({name,role,shift_type,unit,assignment_number,days_of_week}).eq("id",id).eq("org_code",orgCode).select().single();
    if (error) throw error;
    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id",id);
    if (staffCheck.ids.length > 0) {
      const { error: linkErr } = await supabaseAdmin.from("schedule_template_staff").insert(staffCheck.ids.map(staff_id=>({template_id:id,staff_id})));
      if (linkErr) throw linkErr;
    }
    res.json({...updated, staff_ids:staffCheck.ids});
  } catch (err) {
    console.error("TEMPLATE UPDATE ERROR:", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const id = req.params.id;
    const { data: owned, error: ownErr } = await supabaseAdmin.from("schedule_templates").select("id").eq("id",id).eq("org_code",orgCode).maybeSingle();
    if (ownErr) throw ownErr;
    if (!owned) return res.status(404).json({ error: "Template not found in this organization" });
    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id",id);
    await supabaseAdmin.from("schedule_templates").delete().eq("id",id).eq("org_code",orgCode);
    res.json({ success: true });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

module.exports = router;
