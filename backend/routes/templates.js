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
    const { data: template, error } = await supabaseAdmin.from("schedule_templates").insert([{name,role,shift_type,unit,assignment_number,days_of_week,org_code:orgCode}]).select().single();
    if (error) throw error;
    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const { data: validStaff, error: staffCheckErr } = await supabaseAdmin.from("staff").select("id").eq("org_code", orgCode).in("id", staff_ids);
      if (staffCheckErr) throw staffCheckErr;
      if ((validStaff || []).length !== new Set(staff_ids.map(String)).size) return res.status(400).json({ error: "One or more staff members do not belong to this organization" });
      const { error: staffErr } = await supabaseAdmin.from("schedule_template_staff").insert(staff_ids.map(staff_id => ({template_id:template.id,staff_id})));
      if (staffErr) throw staffErr;
    }
    res.json(template);
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
    if (Array.isArray(staff_ids) && staff_ids.length > 0) {
      const { data: validStaff, error: staffCheckErr } = await supabaseAdmin.from("staff").select("id").eq("org_code", orgCode).in("id", staff_ids);
      if (staffCheckErr) throw staffCheckErr;
      if ((validStaff || []).length !== new Set(staff_ids.map(String)).size) return res.status(400).json({ error: "One or more staff members do not belong to this organization" });
    }
    const { data: updated, error } = await supabaseAdmin.from("schedule_templates").update({name,role,shift_type,unit,assignment_number,days_of_week}).eq("id",id).eq("org_code",orgCode).select().single();
    if (error) throw error;
    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id",id);
    if (Array.isArray(staff_ids) && staff_ids.length > 0) await supabaseAdmin.from("schedule_template_staff").insert(staff_ids.map(staff_id=>({template_id:id,staff_id})));
    res.json(updated);
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
