// backend/routes/me.js
const express = require("express");
const router = express.Router();

const supabase = require("../supabase");
const supabaseAdmin = require("../supabaseAdmin");

function getBearerToken(req) { const h=req.get("Authorization")||""; const m=h.match(/^Bearer\s+(.+)$/i); return m?m[1]:null; }
async function requireAuth(req,res,next){try{const token=getBearerToken(req);if(!token)return res.status(401).json({error:"Missing Authorization Bearer token"});const{data,error}=await supabase.auth.getUser(token);if(error||!data?.user)return res.status(401).json({error:"Invalid or expired token"});req.user=data.user;next()}catch{return res.status(401).json({error:"Unauthorized"})}}
function monthRange(monthKey){const[yStr,mStr]=String(monthKey||"").split("-");const y=Number(yStr),m=Number(mStr);if(!y||!m)return null;const start=new Date(Date.UTC(y,m-1,1)),end=new Date(Date.UTC(y,m,1));return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}}
async function getAppRole(userId){const{data,error}=await supabaseAdmin.from("profiles").select("role").eq("id",userId).maybeSingle();if(error){console.error("ME getAppRole ERROR:",error);return null}return String(data?.role||"").toLowerCase()||null}
async function getOrgByCode(orgCode){if(!orgCode)return null;const{data,error}=await supabaseAdmin.from("orgs").select("id, org_code, name, logo_url").eq("org_code",orgCode).maybeSingle();if(error)return null;return data?.id?data:null}
async function getFirstNonAdminOrg(){const{data,error}=await supabaseAdmin.from("orgs").select("id, org_code, name, logo_url").neq("org_code","ADMIN").order("created_at",{ascending:true}).limit(1);if(error)return null;return data?.[0]?.id?data[0]:null}
async function getMembershipPerms(userId,orgId){if(!userId||!orgId)return null;const{data,error}=await supabaseAdmin.from("org_memberships").select("role, is_admin, can_manage_admins, can_dashboard_read, can_schedule_read, can_schedule_write, can_census_read, can_census_write, department_id, is_active").eq("user_id",userId).eq("org_id",orgId).eq("is_active",true).maybeSingle();if(error)return null;return data?.role?data:null}
async function getMemberships(userId,isSuperadmin){
  if(isSuperadmin){
    const{data,error}=await supabaseAdmin.from("orgs").select("id, org_code, name, logo_url").order("name",{ascending:true});
    if(error)throw error;
    return(data||[]).filter(o=>o?.id&&String(o.org_code||"").toUpperCase()!=="ADMIN").map(o=>({role:"superadmin",orgs:o,permissions:{role:"superadmin",is_admin:true,can_manage_admins:true,can_dashboard_read:true,can_schedule_read:true,can_schedule_write:true,can_census_read:true,can_census_write:true,department_id:null,is_active:true}}));
  }
  const{data,error}=await supabaseAdmin.from("org_memberships").select(`role, is_admin, can_manage_admins, can_dashboard_read, can_schedule_read, can_schedule_write, can_census_read, can_census_write, department_id, orgs:orgs!org_memberships_org_id_fkey ( id, org_code, name, logo_url )`).eq("user_id",userId).eq("is_active",true);
  if(error)throw error;
  return(data||[]).filter(m=>m?.orgs?.id).map(m=>({role:m.role,orgs:m.orgs,permissions:{role:m.role,is_admin:!!m.is_admin,can_manage_admins:!!m.can_manage_admins,can_dashboard_read:!!m.can_dashboard_read,can_schedule_read:!!m.can_schedule_read,can_schedule_write:!!m.can_schedule_write,can_census_read:!!m.can_census_read,can_census_write:!!m.can_census_write,department_id:m.department_id||null,is_active:true}}));
}
async function resolveActiveOrg({userId,headerOrgCode,isSuperadmin}){
  if(isSuperadmin){if(headerOrgCode){const org=await getOrgByCode(headerOrgCode);if(org)return{org,source:"header",membershipRole:"superadmin"}}const fallback=await getFirstNonAdminOrg();if(fallback)return{org:fallback,source:"default",membershipRole:"superadmin"};return{org:null,source:"none",membershipRole:"superadmin"}}
  if(headerOrgCode){const org=await getOrgByCode(headerOrgCode);if(org){const membership=await getMembershipPerms(userId,org.id);if(membership)return{org,source:"header",membershipRole:membership.role||null}}}
  const{data:memberships,error:memErr}=await supabaseAdmin.from("org_memberships").select(`role, orgs:orgs!org_memberships_org_id_fkey ( id, org_code, name, logo_url )`).eq("user_id",userId).eq("is_active",true);if(!memErr&&Array.isArray(memberships)&&memberships.length){const m=memberships.find(x=>x?.orgs?.id)||null;if(m?.orgs?.id)return{org:m.orgs,source:"membership",membershipRole:m.role||null}}
  const{data:staff,error:staffErr}=await supabaseAdmin.from("staff").select("org_code").eq("user_id",userId).maybeSingle();if(!staffErr&&staff?.org_code){const org=await getOrgByCode(staff.org_code);if(org)return{org,source:"staff",membershipRole:null}}
  return{org:null,source:"none",membershipRole:null}
}
router.get("/bootstrap",requireAuth,async(req,res)=>{try{
  const started=Date.now();
  const appRole=await getAppRole(req.user.id),isSuperadmin=String(appRole||"").toLowerCase()==="superadmin",headerOrgCode=req.get("X-Org-Code")||req.get("x-org-code")||null;
  const[r,memberships]=await Promise.all([resolveActiveOrg({userId:req.user.id,headerOrgCode,isSuperadmin}),getMemberships(req.user.id,isSuperadmin)]);
  let permissions=null;if(r?.org?.id){permissions=isSuperadmin?{role:"superadmin",is_admin:true,can_manage_admins:true,can_dashboard_read:true,can_schedule_read:true,can_schedule_write:true,can_census_read:true,can_census_write:true,department_id:null,is_active:true}:await getMembershipPerms(req.user.id,r.org.id)}
  return res.json({user:{id:req.user.id,email:req.user.email},appRole:appRole||null,activeOrg:r.org,activeOrgSource:r.source,membershipRole:r.membershipRole,permissions,isSuperadmin,memberships,meta:{server_ms:Date.now()-started}})
}catch(e){console.error("ME BOOTSTRAP ERROR:",e);return res.status(500).json({error:e?.message||"Server error"})}});
router.get("/memberships",requireAuth,async(req,res)=>{try{const appRole=await getAppRole(req.user.id),isSuperadmin=String(appRole||"").toLowerCase()==="superadmin";return res.json({memberships:await getMemberships(req.user.id,isSuperadmin)})}catch(e){console.error("ME MEMBERSHIPS ERROR:",e);return res.status(500).json({error:e?.message||"Server error"})}});

router.get("/home-summary",requireAuth,async(req,res)=>{try{
  const started=Date.now(),range=monthRange(req.query.month);if(!range)return res.status(400).json({error:"Invalid month. Use YYYY-MM"});
  const appRole=await getAppRole(req.user.id),isSuperadmin=String(appRole||"").toLowerCase()==="superadmin",headerOrgCode=req.get("X-Org-Code")||req.get("x-org-code")||null,resolved=await resolveActiveOrg({userId:req.user.id,headerOrgCode,isSuperadmin}),org=resolved.org;
  if(!org?.org_code)return res.status(400).json({error:"No active org found for user"});const orgCode=org.org_code;
  const{data:staff,error:staffErr}=await supabaseAdmin.from("staff").select("id, user_id, org_code, employee_no, staff_uuid").eq("org_code",orgCode).eq("user_id",req.user.id).maybeSingle();if(staffErr)throw staffErr;const staffId=staff?.id?String(staff.id):null;
  const myShiftsPromise=staffId?supabaseAdmin.from("shifts").select("id, org_code, staff_id, staff_uuid, role, shift_date, start_local, end_local, timezone, shift_type, unit").eq("org_code",orgCode).eq("staff_id",staffId).gte("shift_date",range.start).lt("shift_date",range.end).order("shift_date",{ascending:true}):Promise.resolve({data:[],error:null});
  const openPromise=supabaseAdmin.from("shifts").select("id, org_code, staff_id, staff_uuid, role, shift_date, start_local, end_local, timezone, shift_type, unit").eq("org_code",orgCode).is("staff_id",null).gte("shift_date",range.start).lt("shift_date",range.end).order("shift_date",{ascending:true});
  const timeOffPromise=staffId?supabaseAdmin.from("shift_requests").select("id,start_date,end_date,status,reason,decided_at,decision_note").eq("org_code",orgCode).eq("staff_id",staffId).eq("request_type","time_off").eq("status","approved").lt("start_date",range.end).gte("end_date",range.start).order("start_date",{ascending:true}):Promise.resolve({data:[],error:null});
  const pendingPromise=supabaseAdmin.from("shift_requests").select("id,request_type,shift_id,start_date,end_date,reason,status,created_at,decided_at,decision_note,department_id,employee_seen_at").eq("org_code",orgCode).eq("user_id",req.user.id).eq("status","pending").order("created_at",{ascending:false}).limit(100);
  const[myResult,openResult,timeOffResult,pendingResult]=await Promise.all([myShiftsPromise,openPromise,timeOffPromise,pendingPromise]);
  for(const result of[myResult,openResult,timeOffResult,pendingResult])if(result?.error)throw result.error;
  const myShifts=(myResult.data||[]).map(s=>({...s,date:s.shift_date,unit_name:s.unit||null})),openShifts=(openResult.data||[]).map(s=>({...s,date:s.shift_date,unit_name:s.unit||null})),timeOff=timeOffResult.data||[],pending=pendingResult.data||[];
  return res.json({myShifts,openShifts,pending,timeOff,staffId,activeOrg:org,activeOrgSource:resolved.source,appRole:appRole||null,isSuperadmin,meta:{server_ms:Date.now()-started}});
}catch(e){console.error("ME HOME SUMMARY ERROR:",e);return res.status(500).json({error:e?.message||"Server error"})}});
module.exports=router;
