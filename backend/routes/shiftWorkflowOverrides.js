const express=require("express");
const router=express.Router();
const supabaseAdmin=require("../supabaseAdmin");
const{requireAuth}=require("../middleware/auth");
const{requireOrg}=require("../middleware/orgGuard");
const{notifyEligibleForShift,createNotifications}=require("../services/notificationService");
router.use(requireAuth);router.use(requireOrg);
const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const isNurseRole=v=>["RN","LPN","NURSE"].includes(String(v||"").trim().toUpperCase());
async function currentStaff(req){const{data}=await supabaseAdmin.from("staff").select("id,name,role,user_id,department_id").eq("org_code",req.orgCode||req.org_code).eq("user_id",req.userId).maybeSingle();return data||null}
async function approvedTimeOff(orgCode,staffId,date){const{data,error}=await supabaseAdmin.from("shift_requests").select("id").eq("org_code",orgCode).eq("staff_id",staffId).eq("request_type","time_off").eq("status","approved").lte("start_date",date).gte("end_date",date).limit(1);if(error)throw error;return!!data?.length}
function compatible(shiftRole,staffRole){return isNurseRole(shiftRole)?isNurseRole(staffRole):String(shiftRole||"").toLowerCase()===String(staffRole||"").toLowerCase()}

router.get("/open-shifts",async(req,res)=>{try{
  const started=Date.now();
  const orgCode=req.orgCode||req.org_code,from=String(req.query.from||new Date().toISOString().slice(0,10)),to=String(req.query.to||"");
  if(!validDate(from)||(to&&!validDate(to)))return res.status(400).json({error:"Invalid date range"});
  let openQ=supabaseAdmin.from("shifts").select("id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,department_id,open_reason,bonus_enabled,bonus_type,bonus_amount,bonus_note,original_staff_id").eq("org_code",orgCode).is("staff_id",null).gte("shift_date",from);
  if(to)openQ=openQ.lte("shift_date",to);
  let offerQ=supabaseAdmin.from("shift_requests").select("id,shift_id,staff_id,department_id,created_at").eq("org_code",orgCode).eq("request_type","offer").eq("status","pending").gte("start_date",from);
  if(to)offerQ=offerQ.lte("start_date",to);
  const[staffResult,openResult,offerResult]=await Promise.all([currentStaff(req),openQ,offerQ]);
  const staff=staffResult;
  const{data:open,error}=openResult;if(error)throw error;
  const{data:offers,error:oe}=offerResult;if(oe)throw oe;
  let offered=[];
  if(offers?.length){const ids=[...new Set(offers.map(x=>x.shift_id).filter(Boolean))];const{data:s,error:se}=await supabaseAdmin.from("shifts").select("id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,department_id,bonus_enabled,bonus_type,bonus_amount,bonus_note").eq("org_code",orgCode).in("id",ids);if(se)throw se;const byId=Object.fromEntries((s||[]).map(x=>[String(x.id),x]));offered=offers.map(o=>{const shift=byId[String(o.shift_id)];return shift?{...shift,offered:true,offer_request_id:o.id,offered_by_staff_id:o.staff_id,open_reason:"offered"}:null}).filter(Boolean)}
  let rows=[...(open||[]),...offered];
  if(staff?.role)rows=rows.filter(x=>compatible(x.role,staff.role)&&String(x.staff_id||"")!==String(staff.id));
  rows.sort((a,b)=>String(a.shift_date).localeCompare(String(b.shift_date))||String(a.start_time||"").localeCompare(String(b.start_time||"")));
  res.set("Server-Timing",`open-shifts;dur=${Date.now()-started}`);
  res.json(rows.map(x=>({...x,role:isNurseRole(x.role)?"Nurse":x.role})));
}catch(e){console.error("OPEN SHIFTS V2 ERROR",e);res.status(500).json({error:"Server error"})}});

router.post("/offer",async(req,res)=>{try{
  const orgCode=req.orgCode||req.org_code,{shift_id,note}=req.body||{};const staff=await currentStaff(req);if(!staff)return res.status(400).json({error:"Your login is not linked to a staff record"});
  const{data:shift,error:se}=await supabaseAdmin.from("shifts").select("id,staff_id,role,shift_date,shift_type,start_local,end_local,department_id,bonus_enabled,bonus_type,bonus_amount,bonus_note").eq("id",shift_id).eq("org_code",orgCode).maybeSingle();if(se)throw se;if(!shift||String(shift.staff_id)!==String(staff.id))return res.status(403).json({error:"That shift is not assigned to you"});
  const{data:existing}=await supabaseAdmin.from("shift_requests").select("id").eq("org_code",orgCode).eq("request_type","offer").eq("status","pending").eq("shift_id",shift.id).eq("staff_id",staff.id).maybeSingle();if(existing)return res.status(409).json({error:"This shift is already offered"});
  const{data:r,error}=await supabaseAdmin.from("shift_requests").insert({org_code:orgCode,user_id:req.userId,staff_id:staff.id,department_id:staff.department_id,request_type:"offer",shift_id:shift.id,start_date:shift.shift_date,end_date:shift.shift_date,reason:note||null,status:"pending"}).select().single();if(error)throw error;
  const extra=shift.bonus_enabled?(shift.bonus_note?` Bonus: ${shift.bonus_note}.`:shift.bonus_type==="hourly"?` Bonus: +$${Number(shift.bonus_amount||0).toFixed(2)}/hr.`:` Bonus: +$${Number(shift.bonus_amount||0).toFixed(2)}.`):"";
  const notifications=await notifyEligibleForShift({orgCode,shift,type:"offered_shift",title:"Shift available",message:`${shift.shift_date} ${shift.shift_type} is available from another employee.${extra}`,excludeUserIds:[req.userId],metadata:{offer_request_id:r.id,open_reason:"offered"}});
  res.json({...r,notified:notifications.length});
}catch(e){console.error("OFFER WORKFLOW ERROR",e);res.status(500).json({error:e?.message||"Unable to offer shift"})}});

router.post("/pickup",async(req,res,next)=>{try{
  const orgCode=req.orgCode||req.org_code,{shift_id,offer_request_id}=req.body||{};const staff=await currentStaff(req);if(!staff)return res.status(400).json({error:"Your login is not linked to a staff record"});
  const{data:shift,error:se}=await supabaseAdmin.from("shifts").select("id,staff_id,role,shift_date,shift_type,department_id").eq("id",shift_id).eq("org_code",orgCode).maybeSingle();if(se)throw se;if(!shift)return res.status(404).json({error:"Shift not found"});
  let offer=null;if(offer_request_id){const{data:o,error:oe}=await supabaseAdmin.from("shift_requests").select("id,staff_id,user_id,status,shift_id").eq("id",offer_request_id).eq("org_code",orgCode).eq("request_type","offer").eq("status","pending").maybeSingle();if(oe)throw oe;offer=o}else if(shift.staff_id!=null){const{data:o}=await supabaseAdmin.from("shift_requests").select("id,staff_id,user_id,status,shift_id").eq("org_code",orgCode).eq("request_type","offer").eq("status","pending").eq("shift_id",shift.id).maybeSingle();offer=o}
  if(!offer)return next();
  if(String(offer.staff_id)===String(staff.id))return res.status(400).json({error:"You cannot claim your own offered shift"});if(!compatible(shift.role,staff.role))return res.status(400).json({error:"You are not eligible for this shift"});if(await approvedTimeOff(orgCode,staff.id,shift.shift_date))return res.status(409).json({error:"You have approved time off on this date"});
  const{data,error}=await supabaseAdmin.rpc("claim_offered_shift",{p_org_code:orgCode,p_shift_id:shift.id,p_offer_request_id:offer.id,p_new_staff_id:staff.id,p_new_role:staff.role,p_new_user_id:req.userId});if(error)throw error;
  const now=new Date().toISOString();await supabaseAdmin.from("shift_requests").insert({org_code:orgCode,user_id:req.userId,staff_id:staff.id,department_id:staff.department_id,request_type:"pickup",shift_id:shift.id,start_date:shift.shift_date,end_date:shift.shift_date,status:"approved",decided_by:req.userId,decided_at:now,decision_note:"Claimed offered shift",employee_seen_at:now});
  await createNotifications([{org_code:orgCode,user_id:offer.user_id,department_id:shift.department_id,type:"offered_shift_claimed",title:"Your offered shift was claimed",message:`Your ${shift.shift_date} ${shift.shift_type} shift has been claimed by another eligible employee.`,action_path:"/my-schedule",metadata:{shift_id:shift.id}}]);
  res.json({success:true,claimed:true,shift:data?.shift||data});
}catch(e){console.error("OFFER PICKUP ERROR",e);if(String(e.message||"").includes("OFFER_")||String(e.message||"").includes("SHIFT_"))return res.status(409).json({error:"This offered shift is no longer available"});res.status(500).json({error:e?.message||"Unable to claim shift"})}});

module.exports=router;
