const express=require("express");
const router=express.Router();
const supabaseAdmin=require("../supabaseAdmin");
const{requireAuth}=require("../middleware/auth");
const{requireOrg}=require("../middleware/orgGuard");
const{createNotifications,notifyEligibleForShift}=require("../services/notificationService");
router.use(requireAuth);router.use(requireOrg);
function platformReviewer(req){return String(req.role||"").toLowerCase()==="superadmin"}
function reviewDepartment(req){const m=req.orgMembership||{};if(!m.can_schedule_write||!m.department_id)return null;return String(m.department_id)}
async function mayReviewRequest(req,r){if(platformReviewer(req))return true;const dept=reviewDepartment(req);return!!dept&&String(r?.department_id||"")===dept}
function requestLabel(r){if(r.request_type==="pickup")return"open shift request";if(r.request_type==="time_off")return"time-off request";if(r.request_type==="time_off_cancel")return"time-off cancellation request";if(r.request_type==="offer")return"shift offer";if(r.request_type==="trade")return"shift trade";if(r.request_type==="coverage")return"coverage request";if(r.request_type==="call_off")return"call-off request";return"request"}
function decisionMessage(r,decision){const label=requestLabel(r),date=r.start_date&&r.end_date&&r.start_date!==r.end_date?`${r.start_date} through ${r.end_date}`:(r.start_date||"");return`Your ${label}${date?` for ${date}`:""} was ${decision}.`}
router.patch("/:id/decision",async(req,res)=>{try{
 const decision=String(req.body?.decision||"").toLowerCase();if(!["approved","denied"].includes(decision))return res.status(400).json({error:"Decision must be approved or denied"});
 const orgCode=req.orgCode||req.org_code;
 const{data:r,error:re}=await supabaseAdmin.from("shift_requests").select("*").eq("id",req.params.id).eq("org_code",orgCode).eq("status","pending").maybeSingle();if(re)throw re;if(!r)return res.status(404).json({error:"Pending request not found"});
 if(!(await mayReviewRequest(req,r)))return res.status(403).json({error:"Edit Schedule permission is required for this employee's department"});
 // All schedule mutation + request status changes happen inside one Postgres transaction.
 // Any conflict/error rolls the entire decision back instead of leaving a half-applied schedule.
 const{data:result,error:txError}=await supabaseAdmin.rpc("apply_shift_request_decision",{p_org_code:orgCode,p_request_id:r.id,p_decision:decision,p_decided_by:req.userId,p_note:req.body?.note||null});
 if(txError){const msg=txError.message||"Unable to update request";const conflict=/no longer|changed|filled|conflict|overlap|not accepted|not available|missing/i.test(msg);const missing=/Pending request not found/i.test(msg);return res.status(missing?404:conflict?409:500).json({error:msg})}
 // Notifications deliberately happen after commit: a notification failure must never roll back
 // a valid schedule decision. Workflow polling still guarantees the employee sees the result.
 if(decision==="approved"&&r.request_type==="call_off"&&r.shift_id){try{const{data:s}=await supabaseAdmin.from("shifts").select("id,staff_id,role,shift_date,shift_type,start_local,end_local,department_id,bonus_enabled").eq("id",r.shift_id).eq("org_code",orgCode).maybeSingle();if(s&&s.staff_id===null){const bonus=s.bonus_enabled?" Incentive available.":"";await notifyEligibleForShift({orgCode,shift:s,type:"call_off_open_shift",title:"Call-off shift available",message:`${s.shift_date} ${s.shift_type} is now open.${bonus}`,excludeUserIds:[r.user_id],metadata:{open_reason:"call_off",called_off_staff_id:r.staff_id,call_off_request_id:r.id}})}}catch(e){console.error("CALL OFF OPEN SHIFT NOTIFICATION ERROR",e)}}
 const notices=[];
 if(r.user_id)notices.push({org_code:orgCode,user_id:r.user_id,department_id:r.department_id||null,type:"request_decision",title:`Request ${decision}`,message:decisionMessage(r,decision),action_path:r.request_type==="pickup"&&decision==="approved"?"/my-schedule":"/requests",metadata:{request_id:r.id,request_type:r.request_type,decision,shift_id:r.shift_id||null}});
 if(["trade","coverage"].includes(r.request_type)&&r.target_user_id)notices.push({org_code:orgCode,user_id:r.target_user_id,department_id:r.department_id||null,type:`${r.request_type}_decision`,title:`${r.request_type==="trade"?"Trade":"Coverage"} ${decision}`,message:`The ${r.request_type==="trade"?"shift trade":"coverage change"} was ${decision} by management.`,action_path:"/my-schedule",metadata:{request_id:r.id,decision}});
 let notified=0;if(notices.length){try{notified=(await createNotifications(notices)).length}catch(e){console.error("REQUEST DECISION NOTIFICATION ERROR",e)}}
 return res.json({...result,employee_notified:notified});
}catch(e){console.error("REQUEST DECISION WORKFLOW ERROR",e);return res.status(500).json({error:e?.message||"Unable to update request"})}});
module.exports=router;
