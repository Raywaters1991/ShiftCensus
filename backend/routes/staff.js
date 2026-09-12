const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

const PERMISSION_KEYS = ["is_admin","can_manage_admins","can_dashboard_read","can_schedule_read","can_schedule_write","can_census_read","can_census_write"];

function normalizeRole(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function accessForStaffRole(staffRole) {
  const key = normalizeRole(staffRole);
  const base = { role: "staff", is_admin: false, can_manage_admins: false, can_dashboard_read: false, can_schedule_read: true, can_schedule_write: false, can_census_read: true, can_census_write: false };
  if (["admin","administrator"].includes(key)) return { ...base, role:"admin", is_admin:true, can_manage_admins:true, can_schedule_write:true, can_census_write:true };
  if (["don","directorofnursing"].includes(key)) return { ...base, role:"don", is_admin:true, can_manage_admins:true, can_schedule_write:true, can_census_write:true };
  if (["ed","executivedirector"].includes(key)) return { ...base, role:"ed", is_admin:true, can_manage_admins:true, can_schedule_write:true, can_census_write:true };
  if (["scheduler","staffingscheduler"].includes(key)) return { ...base, role:"scheduler", can_schedule_write:true };
  if (["admissions","admissionsdirector","admissionscoordinator"].includes(key)) return { ...base, role:"admissions", can_census_write:true };
  if (key === "wallboard") return { ...base, role:"wallboard", can_dashboard_read:true };
  return base;
}
function cleanPermissions(input, defaults) {
  const out = { ...defaults };
  if (!input || typeof input !== "object") return out;
  for (const key of PERMISSION_KEYS) if (input[key] !== undefined) out[key] = !!input[key];
  if (out.can_schedule_write) out.can_schedule_read = true;
  if (out.can_census_write) out.can_census_read = true;
  return out;
}
async function getAuthUserByEmail(email) {
  const e = String(email || "").trim().toLowerCase(); if (!e) return null;
  if (supabaseAdmin?.auth?.admin?.getUserByEmail) { const {data,error}=await supabaseAdmin.auth.admin.getUserByEmail(e); if(!error&&data?.user)return data.user; }
  const {data,error}=await supabaseAdmin.auth.admin.listUsers({perPage:500}); if(error)return null;
  return (data?.users||[]).find(u=>String(u.email||"").toLowerCase()===e)||null;
}
async function getMyMembership(req) {
  if(req.orgMembership)return req.orgMembership;
  if(req._myMembership)return req._myMembership; const userId=req.user?.id||req.userId; if(!userId||!req.orgId)return null;
  const {data,error}=await supabaseAdmin.from("org_memberships").select("role,is_active,is_admin,can_manage_admins,can_dashboard_read,can_schedule_write,can_schedule_read,can_census_write,can_census_read,department_id,department_locked").eq("user_id",userId).eq("org_id",req.orgId).maybeSingle();
  if(error){console.error("GET MY MEMBERSHIP ERROR:",error);return null;} req._myMembership=data||null; return req._myMembership;
}
async function canManageStaff(req) {
  if(String(req.role||"").toLowerCase()==="superadmin")return true; const mem=await getMyMembership(req); if(!mem||mem.is_active===false)return false;
  return !!mem.can_manage_admins;
}
async function ensureProfileAndMembership({userId,orgId,orgCode,staffRole,departmentId=null,permissions=null}) {
  const {data:profile,error:readErr}=await supabaseAdmin.from("profiles").select("id,role").eq("id",userId).maybeSingle(); if(readErr)throw readErr;
  if(!profile){const {error}=await supabaseAdmin.from("profiles").insert([{id:userId,role:"staff",org_code:orgCode||null,active_org_id:orgId||null}]);if(error)throw error;}
  else {const {error}=await supabaseAdmin.from("profiles").update({org_code:orgCode||null,active_org_id:orgId||null}).eq("id",userId);if(error)throw error;}
  const defaults=accessForStaffRole(staffRole); const access=cleanPermissions(permissions,defaults);
  const {data,error}=await supabaseAdmin.from("org_memberships").upsert([{user_id:userId,org_id:orgId,role:defaults.role,...access,is_active:true,department_id:departmentId,department_locked:false}],{onConflict:"user_id,org_id"}).select().single();
  if(error)throw error; return data;
}
async function getOrCreateAuthUserByEmail(email,orgCode,staffId){
  const e=String(email||"").trim().toLowerCase(); if(!e)throw new Error("Email required"); const existing=await getAuthUserByEmail(e); if(existing?.id)return existing;
  const {data,error}=await supabaseAdmin.auth.admin.createUser({email:e,password:crypto.randomBytes(24).toString("base64url"),email_confirm:true,user_metadata:{org_code:orgCode,staff_id:staffId,setup_pending:true}}); if(error)throw error; return data?.user||null;
}

router.use(requireAuth); router.use(requireOrg);

router.get("/lookup",requireScheduleAccess,async(req,res)=>{try{
  const orgCode=req.orgCode||req.org_code;
  const {data,error}=await supabaseAdmin.from("staff").select("id,name,role").eq("org_code",orgCode).order("name");
  if(error)throw error;
  return res.json(data||[]);
}catch(e){console.error("STAFF LOOKUP ERROR:",e);return res.status(500).json({error:"Failed to load staff lookup"});}});

router.get("/",async(req,res)=>{try{
  const orgCode=req.orgCode||req.org_code; const {data,error}=await supabaseAdmin.from("staff").select("*").eq("org_code",orgCode).order("name"); if(error)throw error;
  let users=[]; try{const {data:u}=await supabaseAdmin.auth.admin.listUsers({perPage:500});users=u?.users||[];}catch{}
  const authById=new Map(users.map(u=>[String(u.id),u])); const userIds=(data||[]).map(s=>s.user_id).filter(Boolean);
  let memberships=[]; if(userIds.length){const {data:m,error:me}=await supabaseAdmin.from("org_memberships").select("user_id,role,is_active,is_admin,can_manage_admins,can_dashboard_read,can_schedule_read,can_schedule_write,can_census_read,can_census_write").eq("org_id",req.orgId).in("user_id",userIds);if(!me)memberships=m||[];}
  const memById=new Map(memberships.map(m=>[String(m.user_id),m]));
  return res.json((data||[]).map(s=>({...s,setup_pending:s.user_id?authById.get(String(s.user_id))?.user_metadata?.setup_pending===true:false,permissions:s.user_id?memById.get(String(s.user_id))||null:null})));
}catch(e){console.error("STAFF GET ERROR:",e);return res.status(500).json({error:"Failed to load staff"});}});

router.post("/",async(req,res)=>{try{
  if(!(await canManageStaff(req)))return res.status(403).json({error:"Not allowed"}); const orgCode=req.orgCode||req.org_code,orgId=req.orgId; const {name,role,email,phone,department_id,permissions}=req.body||{}; if(!name||!role)return res.status(400).json({error:"Name and role required"});
  const cleanedEmail=String(email||"").trim().toLowerCase()||null; const {data:staff,error}=await supabaseAdmin.from("staff").insert([{name,role,email:cleanedEmail,phone:phone||null,org_code:orgCode,org_id:orgId,department_id:department_id||null}]).select().single(); if(error)throw error;
  if(!cleanedEmail)return res.json({...staff,login_created:false,setup_pending:false}); const user=await getOrCreateAuthUserByEmail(cleanedEmail,orgCode,staff.id); if(!user?.id)throw new Error("Auth user id missing");
  const {data:linked,error:linkErr}=await supabaseAdmin.from("staff").update({user_id:user.id,org_id:orgId}).eq("id",staff.id).eq("org_code",orgCode).select().single();if(linkErr)throw linkErr;
  const membership=await ensureProfileAndMembership({userId:user.id,orgId,orgCode,staffRole:role,departmentId:department_id||null,permissions});
  return res.json({...linked,login_created:true,setup_pending:user?.user_metadata?.setup_pending===true,permissions:membership,note:user?.user_metadata?.setup_pending===true?"Account created. Employee should go to ShiftCensus and enter their email to finish setup.":"Existing ShiftCensus account linked to this facility."});
}catch(e){console.error("STAFF POST ERROR:",e);return res.status(500).json({error:e?.message||"Failed to create staff"});}});

router.post("/:id/provision-login",async(req,res)=>{try{
  if(!(await canManageStaff(req)))return res.status(403).json({error:"Not allowed"}); const orgCode=req.orgCode||req.org_code,orgId=req.orgId; const {data:staff,error}=await supabaseAdmin.from("staff").select("*").eq("id",req.params.id).eq("org_code",orgCode).maybeSingle();if(error)throw error;if(!staff)return res.status(404).json({error:"Staff member not found"});if(staff.user_id)return res.status(409).json({error:"Staff member already has a linked login"});if(!staff.email)return res.status(400).json({error:"Add an email address before creating a login"});
  const user=await getOrCreateAuthUserByEmail(staff.email,orgCode,staff.id); const {data:linked,error:le}=await supabaseAdmin.from("staff").update({user_id:user.id,org_id:orgId}).eq("id",staff.id).eq("org_code",orgCode).select().single();if(le)throw le;
  const membership=await ensureProfileAndMembership({userId:user.id,orgId,orgCode,staffRole:staff.role,departmentId:staff.department_id||null}); return res.json({...linked,login_created:true,setup_pending:user?.user_metadata?.setup_pending===true,permissions:membership,note:"Account created. Employee should go to ShiftCensus and enter their email to finish setup."});
}catch(e){console.error("PROVISION STAFF LOGIN ERROR:",e);return res.status(500).json({error:e?.message||"Failed to provision staff login"});}});

async function handleUpdate(req,res){try{
  if(!(await canManageStaff(req)))return res.status(403).json({error:"Not allowed"}); const orgCode=req.orgCode||req.org_code,orgId=req.orgId; const {name,role,email,phone,department_id,permissions}=req.body||{}; const updates={};
  if(name!==undefined)updates.name=name;if(role!==undefined)updates.role=role;if(email!==undefined)updates.email=email?String(email).trim().toLowerCase():null;if(phone!==undefined)updates.phone=phone||null;if(department_id!==undefined)updates.department_id=department_id||null;
  let data; if(Object.keys(updates).length){const r=await supabaseAdmin.from("staff").update(updates).eq("id",req.params.id).eq("org_code",orgCode).select().single();if(r.error)throw r.error;data=r.data;}else{const r=await supabaseAdmin.from("staff").select("*").eq("id",req.params.id).eq("org_code",orgCode).single();if(r.error)throw r.error;data=r.data;}
  let membership=null; if(data?.user_id&&(role!==undefined||department_id!==undefined||permissions!==undefined)){
    let effective=permissions; if(permissions===undefined&&role===undefined){const {data:m}=await supabaseAdmin.from("org_memberships").select("is_admin,can_manage_admins,can_dashboard_read,can_schedule_read,can_schedule_write,can_census_read,can_census_write").eq("user_id",data.user_id).eq("org_id",orgId).maybeSingle();effective=m||null;}
    membership=await ensureProfileAndMembership({userId:data.user_id,orgId,orgCode,staffRole:data.role,departmentId:data.department_id||null,permissions:effective});
  }
  return res.json({...data,permissions:membership||permissions});
}catch(e){console.error("STAFF UPDATE ERROR:",e);return res.status(500).json({error:e?.message||"Failed to update staff"});}}
router.put("/:id",handleUpdate);router.patch("/:id",handleUpdate);
router.delete("/:id",async(req,res)=>{try{if(!(await canManageStaff(req)))return res.status(403).json({error:"Not allowed"});const {error}=await supabaseAdmin.from("staff").delete().eq("id",req.params.id).eq("org_code",req.orgCode||req.org_code);if(error)throw error;return res.json({success:true});}catch(e){return res.status(500).json({error:"Failed to delete staff"});}});
module.exports=router;