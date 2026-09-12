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
function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}
async function validateStaffIds(orgCode, staffIds) {
  if (!Array.isArray(staffIds) || staffIds.length === 0) return { valid: false, ids: [] };
  const raw = staffIds.map(String);
  const ids = [...new Set(staffIds.map(Number).filter(Number.isFinite))];
  if (ids.length !== new Set(raw).size) return { valid: false, ids: [] };
  const { data, error } = await supabaseAdmin.from("staff").select("id").eq("org_code", orgCode).in("id", ids);
  if (error) throw error;
  return { valid: (data || []).length === ids.length, ids };
}
function publicTemplate(t, staffIds) {
  return { id:t.id, name:t.name, role:t.role, shift_type:t.shift_type, days_of_week:t.days_of_week || [], staff_ids:staffIds || [] };
}

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { data: templates, error: templateErr } = await supabaseAdmin.from("schedule_templates").select("id,name,role,shift_type,days_of_week").eq("org_code", orgCode).order("id", { ascending: true });
    if (templateErr) throw templateErr;
    if (!templates?.length) return res.json([]);
    const ids = templates.map(t => t.id);
    const { data: links, error } = await supabaseAdmin.from("schedule_template_staff").select("template_id,staff_id").in("template_id", ids);
    if (error) throw error;
    res.json(templates.map(t => publicTemplate(t, (links||[]).filter(x=>x.template_id===t.id).map(x=>x.staff_id))));
  } catch (err) { console.error("TEMPLATE GET ERROR:", err); res.status(500).json({ error:"Failed to load templates" }); }
});

router.post("/", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error:"Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const { name, role, shift_type, staff_ids } = req.body || {};
    const days = normalizeDays(req.body?.days_of_week);
    if (!String(name||"").trim() || !String(shift_type||"").trim() || !days.length) return res.status(400).json({ error:"Name, shift type, and at least one day are required" });
    const check = await validateStaffIds(orgCode, staff_ids);
    if (!check.valid) return res.status(400).json({ error:"Select valid staff from this organization" });
    const { data: workers, error: workerErr } = await supabaseAdmin.from("staff").select("id,role").eq("org_code",orgCode).in("id",check.ids);
    if (workerErr) throw workerErr;
    const roles = [...new Set((workers||[]).map(w=>String(w.role||"")))];
    const storedRole = roles.length === 1 ? roles[0] : (String(role||"").trim() || "Mixed");
    const { data:t, error } = await supabaseAdmin.from("schedule_templates").insert([{name:String(name).trim(),role:storedRole,shift_type,days_of_week:days,unit:null,assignment_number:null,org_code:orgCode}]).select().single();
    if (error) throw error;
    const { error:linkErr } = await supabaseAdmin.from("schedule_template_staff").insert(check.ids.map(staff_id=>({template_id:t.id,staff_id})));
    if (linkErr) { await supabaseAdmin.from("schedule_templates").delete().eq("id",t.id).eq("org_code",orgCode); throw linkErr; }
    res.json(publicTemplate(t, check.ids));
  } catch (err) { console.error("TEMPLATE CREATE ERROR:", err); res.status(500).json({ error:"Failed to create template" }); }
});

router.put("/:id", async (req, res) => {
  try {
    if (!canManageTemplates(req)) return res.status(403).json({ error:"Not allowed" });
    const orgCode = req.orgCode || req.org_code, id=req.params.id;
    const { data:owned, error:ownErr } = await supabaseAdmin.from("schedule_templates").select("id").eq("id",id).eq("org_code",orgCode).maybeSingle();
    if (ownErr) throw ownErr;
    if (!owned) return res.status(404).json({ error:"Template not found in this organization" });
    const { name, role, shift_type, staff_ids } = req.body || {};
    const days=normalizeDays(req.body?.days_of_week);
    if (!String(name||"").trim() || !String(shift_type||"").trim() || !days.length) return res.status(400).json({ error:"Name, shift type, and at least one day are required" });
    const check=await validateStaffIds(orgCode,staff_ids);
    if(!check.valid) return res.status(400).json({ error:"Select valid staff from this organization" });
    const { data:workers, error:workerErr }=await supabaseAdmin.from("staff").select("id,role").eq("org_code",orgCode).in("id",check.ids);
    if(workerErr) throw workerErr;
    const roles=[...new Set((workers||[]).map(w=>String(w.role||"")))];
    const storedRole=roles.length===1?roles[0]:(String(role||"").trim()||"Mixed");
    const { data:t,error }=await supabaseAdmin.from("schedule_templates").update({name:String(name).trim(),role:storedRole,shift_type,days_of_week:days,unit:null,assignment_number:null}).eq("id",id).eq("org_code",orgCode).select().single();
    if(error) throw error;
    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id",id);
    const { error:linkErr }=await supabaseAdmin.from("schedule_template_staff").insert(check.ids.map(staff_id=>({template_id:id,staff_id})));
    if(linkErr) throw linkErr;
    res.json(publicTemplate(t,check.ids));
  } catch(err){ console.error("TEMPLATE UPDATE ERROR:",err); res.status(500).json({error:"Failed to update template"}); }
});

router.delete("/:id", async (req,res)=>{
  try{
    if(!canManageTemplates(req)) return res.status(403).json({error:"Not allowed"});
    const orgCode=req.orgCode||req.org_code,id=req.params.id;
    const {data:owned,error}=await supabaseAdmin.from("schedule_templates").select("id").eq("id",id).eq("org_code",orgCode).maybeSingle();
    if(error) throw error;if(!owned) return res.status(404).json({error:"Template not found in this organization"});
    await supabaseAdmin.from("schedule_template_staff").delete().eq("template_id",id);
    await supabaseAdmin.from("schedule_templates").delete().eq("id",id).eq("org_code",orgCode);
    res.json({success:true});
  }catch(err){console.error("TEMPLATE DELETE ERROR:",err);res.status(500).json({error:"Failed to delete template"});}
});
module.exports=router;
