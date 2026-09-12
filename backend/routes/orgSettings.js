// backend/routes/orgSettings.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

function canManagePrivacy(role) {
  const r = String(role || "").toLowerCase();
  return ["admin", "don", "ed", "superadmin"].includes(r);
}
function canManageLayout(role) { return canManagePrivacy(role); }
function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function validTimezone(value) {
  const timezone = String(value || "").trim();
  if (!timezone) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); return true; }
  catch { return false; }
}
function normalizeWeekStart(value) {
  const v = String(value || "Sunday").trim().toLowerCase();
  return v === "monday" ? "Monday" : "Sunday";
}

router.get("/", async (req, res) => {
  const orgId = req.orgId;
  const { data, error } = await supabaseAdmin.from("org_settings").select("*").eq("org_id", orgId).maybeSingle();
  if (error || !data) {
    return res.json({org_id:orgId,show_patient_identifiers:false,identifier_format:"first_last_initial",identifiers_acknowledged_at:null,identifiers_acknowledged_by:null,updated_at:null,room_count:null,beds_per_room:null,lunch_break_minutes:30,pay_period_length_days:14,pay_period_anchor_date:null,timezone:"America/Los_Angeles"});
  }
  res.json({...data,room_count:data.room_count??null,beds_per_room:data.beds_per_room??null,lunch_break_minutes:data.lunch_break_minutes??30,pay_period_length_days:data.pay_period_length_days??14,pay_period_anchor_date:data.pay_period_anchor_date??null,timezone:data.timezone||"America/Los_Angeles"});
});

// One facility-operations contract for the settings that affect scheduling/reporting behavior.
router.get("/operations", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("org_settings").select("timezone,lunch_break_minutes,pay_period_length_days,pay_period_anchor_date,pay_period").eq("org_id", req.orgId).maybeSingle();
    if (error) throw error;
    const p = data?.pay_period && typeof data.pay_period === "object" ? data.pay_period : {};
    return res.json({
      timezone: data?.timezone || "America/Los_Angeles",
      lunch_break_minutes: Number(data?.lunch_break_minutes ?? 30),
      pay_period_length_days: Number(data?.pay_period_length_days ?? p.length_days ?? 14),
      pay_period_anchor_date: data?.pay_period_anchor_date || p.anchor_date || null,
      week_starts_on: normalizeWeekStart(p.week_starts_on),
    });
  } catch (err) {
    console.error("ORG OPERATIONS GET ERROR:", err);
    return res.status(500).json({ error: "Failed to load facility operations settings" });
  }
});

router.put("/operations", async (req, res) => {
  try {
    if (!canManageLayout(req.role)) return res.status(403).json({ error: "Insufficient role" });
    const timezone = String(req.body?.timezone || "").trim();
    if (!validTimezone(timezone)) return res.status(400).json({ error: "Invalid IANA timezone" });
    const lunch_break_minutes = clampInt(req.body?.lunch_break_minutes, 0, 180, 30);
    const pay_period_length_days = clampInt(req.body?.pay_period_length_days, 7, 31, 14);
    const week_starts_on = normalizeWeekStart(req.body?.week_starts_on);
    const rawAnchor = req.body?.pay_period_anchor_date ?? null;
    let pay_period_anchor_date = null;
    if (rawAnchor) {
      const s = String(rawAnchor).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return res.status(400).json({ error: "pay_period_anchor_date must be YYYY-MM-DD or null" });
      pay_period_anchor_date = s;
    }
    const payload = {
      org_id:req.orgId, timezone, lunch_break_minutes, pay_period_length_days, pay_period_anchor_date,
      pay_period:{ length_days:pay_period_length_days, week_starts_on, anchor_date:pay_period_anchor_date },
      updated_at:new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from("org_settings").upsert(payload).select("timezone,lunch_break_minutes,pay_period_length_days,pay_period_anchor_date,pay_period").single();
    if (error) throw error;
    return res.json({timezone:data.timezone,lunch_break_minutes:Number(data.lunch_break_minutes??30),pay_period_length_days:Number(data.pay_period_length_days??14),pay_period_anchor_date:data.pay_period_anchor_date||null,week_starts_on:normalizeWeekStart(data.pay_period?.week_starts_on)});
  } catch (err) {
    console.error("ORG OPERATIONS PUT ERROR:", err);
    return res.status(500).json({ error: "Failed to save facility operations settings" });
  }
});

router.put("/identifiers", async (req, res) => {
  if (!canManagePrivacy(req.role)) return res.status(403).json({ error: "Insufficient role" });
  const orgId = req.orgId; const { enabled, format, acknowledged } = req.body || {}; const enable = !!enabled;
  const fmt = format === "initials" || format === "first_last_initial" ? format : "first_last_initial";
  if (enable && acknowledged !== true) return res.status(400).json({ error: "Acknowledgment required to enable identifiers" });
  const payload={org_id:orgId,show_patient_identifiers:enable,identifier_format:fmt,identifiers_acknowledged_at:enable?new Date().toISOString():null,identifiers_acknowledged_by:enable?req.user.id:null,updated_at:new Date().toISOString()};
  const {data,error}=await supabaseAdmin.from("org_settings").upsert(payload).select().single();
  if(error){console.error("ORG SETTINGS UPDATE ERROR:",error);return res.status(500).json({error:"Failed to update org settings"});} res.json(data);
});

router.get("/layout", async (req,res)=>{const{data,error}=await supabaseAdmin.from("org_settings").select("room_count,beds_per_room").eq("org_id",req.orgId).maybeSingle();if(error)return res.status(500).json({error:"Failed to load layout"});res.json({room_count:data?.room_count??null,beds_per_room:data?.beds_per_room??null});});
router.put("/layout", async (req,res)=>{if(!canManageLayout(req.role))return res.status(403).json({error:"Insufficient role"});const payload={org_id:req.orgId,room_count:clampInt(req.body?.room_count,1,200,10),beds_per_room:clampInt(req.body?.beds_per_room,1,6,2),updated_at:new Date().toISOString()};const{data,error}=await supabaseAdmin.from("org_settings").upsert(payload).select("room_count,beds_per_room").single();if(error)return res.status(500).json({error:"Failed to save layout"});res.json(data);});
router.get("/lunch-break",async(req,res)=>{const{data,error}=await supabaseAdmin.from("org_settings").select("lunch_break_minutes").eq("org_id",req.orgId).maybeSingle();if(error)return res.status(500).json({error:"Failed to load lunch break setting"});res.json({lunch_break_minutes:data?.lunch_break_minutes??30});});
router.put("/lunch-break",async(req,res)=>{if(!canManageLayout(req.role))return res.status(403).json({error:"Insufficient role"});const payload={org_id:req.orgId,lunch_break_minutes:clampInt(req.body?.lunch_break_minutes,0,180,30),updated_at:new Date().toISOString()};const{data,error}=await supabaseAdmin.from("org_settings").upsert(payload).select("lunch_break_minutes").single();if(error)return res.status(500).json({error:"Failed to save lunch break setting"});res.json(data);});
router.get("/pay-period",async(req,res)=>{const{data,error}=await supabaseAdmin.from("org_settings").select("pay_period_length_days,pay_period_anchor_date").eq("org_id",req.orgId).maybeSingle();if(error)return res.status(500).json({error:"Failed to load pay period"});res.json({pay_period_length_days:data?.pay_period_length_days??14,pay_period_anchor_date:data?.pay_period_anchor_date??null});});
router.put("/pay-period",async(req,res)=>{if(!canManageLayout(req.role))return res.status(403).json({error:"Insufficient role"});const n=clampInt(req.body?.pay_period_length_days,7,31,14),raw=req.body?.pay_period_anchor_date??null;let anchor=null;if(raw){const s=String(raw).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return res.status(400).json({error:"pay_period_anchor_date must be YYYY-MM-DD or null"});anchor=s;}const payload={org_id:req.orgId,pay_period_length_days:n,pay_period_anchor_date:anchor,updated_at:new Date().toISOString()};const{data,error}=await supabaseAdmin.from("org_settings").upsert(payload).select("pay_period_length_days,pay_period_anchor_date").single();if(error)return res.status(500).json({error:"Failed to save pay period"});res.json(data);});

module.exports = router;
