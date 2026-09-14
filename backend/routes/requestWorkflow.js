const express=require("express");
const router=express.Router();
const supabaseAdmin=require("../supabaseAdmin");
const{requireAuth}=require("../middleware/auth");
const{requireOrg}=require("../middleware/orgGuard");
const{notifyScheduleEditors}=require("../services/notificationService");
router.use(requireAuth);router.use(requireOrg);
const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);
async function currentStaff(req){const{data,error}=await supabaseAdmin.from("staff").select("id,name,role,user_id,department_id").eq("org_code",req.orgCode||req.org_code).eq("user_id",req.userId).maybeSingle();if(error)throw error;return data||null}
async function hasScheduleEditor(req,departmentId){if(!departmentId||!req.orgId)return false;const{count,error}=await supabaseAdmin.from("org_memberships").select("user_id",{count:"exact",head:true}).eq("org_id",req.orgId).eq("department_id",departmentId).eq("is_active",true).eq("can_schedule_write",true);if(error)throw error;return(count||0)>0}
router.post("/time-off",async(req,res)=>{try{
  const orgCode=req.orgCode||req.org_code,{start_date,end_date,reason,shift_id}=req.body||{};
  const staff=await currentStaff(req);if(!staff)return res.status(400).json({error:"Your login is not linked to a staff record"});
  if(!staff.department_id)return res.status(400).json({error:"Your staff profile is not assigned to a department"});
  if(!(await hasScheduleEditor(req,staff.department_id)))return res.status(409).json({error:"Your department does not have anyone with Edit Schedule permission to review requests yet"});
  let start=start_date,end=end_date;
  if(shift_id){const{data:s,error:se}=await supabaseAdmin.from("shifts").select("id,shift_date,staff_id").eq("id",shift_id).eq("org_code",orgCode).maybeSingle();if(se)throw se;if(!s)return res.status(404).json({error:"Shift not found"});if(String(s.staff_id)!==String(staff.id))return res.status(403).json({error:"That shift is not assigned to you"});start=s.shift_date;end=s.shift_date}
  if(!validDate(start)||!validDate(end)||end<start)return res.status(400).json({error:"Enter a valid start and end date"});
  const{data,error}=await supabaseAdmin.from("shift_requests").insert({org_code:orgCode,user_id:req.userId,staff_id:staff.id,department_id:staff.department_id,request_type:"time_off",shift_id:shift_id||null,start_date:start,end_date:end,reason:reason||null,status:"pending"}).select().single();
  if(error?.code==="23505")return res.status(409).json({error:"You already have a pending time-off request for these dates"});
  if(error)throw error;
  const dateLabel=start===end?start:`${start} through ${end}`;
  const notifications=await notifyScheduleEditors({orgId:req.orgId,orgCode,departmentId:staff.department_id,type:"time_off_request",title:"New time-off request",message:`${staff.name||"An employee"} requested time off for ${dateLabel}.`,actionPath:"/request-review",metadata:{request_id:data.id,staff_id:staff.id,start_date:start,end_date:end}});
  res.json({...data,reviewers_notified:notifications.length});
}catch(e){console.error("TIME OFF WORKFLOW ERROR",e);res.status(500).json({error:e?.message||"Unable to submit request"})}});
module.exports=router;
