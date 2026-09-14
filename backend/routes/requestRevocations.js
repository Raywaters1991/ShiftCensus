const express=require("express");
const supabaseAdmin=require("../supabaseAdmin");
const {requireAuth}=require("../middleware/auth");
const {requireOrg}=require("../middleware/orgGuard");
const router=express.Router();
router.use(requireAuth);router.use(requireOrg);

function localDate(timeZone){
  try{
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const get=t=>parts.find(p=>p.type===t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }catch{return new Date().toISOString().slice(0,10)}
}

router.patch("/:id/revoke",async(req,res)=>{try{
  const orgCode=req.orgCode||req.org_code;
  const[{data:r,error},{data:settings,error:settingsError}]=await Promise.all([
    supabaseAdmin.from("shift_requests").select("id,status,end_date").eq("id",req.params.id).eq("org_code",orgCode).eq("user_id",req.userId).maybeSingle(),
    supabaseAdmin.from("org_settings").select("timezone").eq("org_id",req.orgId).maybeSingle()
  ]);
  if(error)throw error;if(settingsError)throw settingsError;
  if(!r)return res.status(404).json({error:"Request not found"});
  if(r.status!=="pending")return res.status(409).json({error:"Only pending requests can be revoked"});
  const today=localDate(settings?.timezone||"America/Los_Angeles");
  if(r.end_date&&r.end_date<today)return res.status(409).json({error:"The request date has passed"});
  const{data,error:updateError}=await supabaseAdmin.from("shift_requests").update({status:"cancelled",decision_note:"Revoked by employee",decided_at:new Date().toISOString(),employee_seen_at:new Date().toISOString()}).eq("id",r.id).eq("org_code",orgCode).eq("user_id",req.userId).eq("status","pending").select().maybeSingle();
  if(updateError)throw updateError;if(!data)return res.status(409).json({error:"Request changed before it could be revoked"});
  return res.json(data)
}catch(e){console.error("REQUEST REVOKE ERROR",e);return res.status(500).json({error:"Unable to revoke request"})}});
module.exports=router;
