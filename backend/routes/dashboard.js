const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));}
function dateInTimeZone(timezone){const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=type=>parts.find(p=>p.type===type)?.value;return `${get("year")}-${get("month")}-${get("day")}`;}
function addDays(dateString,amount){const[year,month,day]=String(dateString).split("-").map(Number);const d=new Date(Date.UTC(year,month-1,day+amount));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;}
function isActiveNow(shift,nowMs){const start=Date.parse(shift?.start_time||""),end=Date.parse(shift?.end_time||"");return Number.isFinite(start)&&Number.isFinite(end)&&start<=nowMs&&nowMs<end;}
router.use(requireAuth);router.use(requireOrg);
router.get("/",async(req,res)=>{const started=Date.now();try{const orgId=req.orgId,orgCode=req.orgCode||req.org_code,requestedDate=String(req.query.date||"");if(requestedDate&&!validDate(requestedDate))return res.status(400).json({error:"date must be YYYY-MM-DD"});if(String(req.role||"").toLowerCase()!=="superadmin"){const membership=req.orgMembership;if(!membership?.is_active||!membership?.can_dashboard_read)return res.status(403).json({error:"Dashboard access required"});}
const settingsQuery=supabaseAdmin.from("org_settings").select("timezone").eq("org_id",orgId).maybeSingle();
const bedQuery=supabaseAdmin.from("facility_beds").select("id").eq("org_id",orgId).eq("is_active",true);
const shiftSettingQuery=supabaseAdmin.from("shift_settings").select("shift_type").eq("org_code",orgCode);
const unitQuery=supabaseAdmin.from("units").select("id,name").eq("org_code",orgCode).order("name",{ascending:true});
const[settingsResult,bedResult,shiftSettingResult,unitResult]=await Promise.all([settingsQuery,bedQuery,shiftSettingQuery,unitQuery]);
if(settingsResult.error)throw settingsResult.error;if(bedResult.error)throw bedResult.error;if(shiftSettingResult.error)throw shiftSettingResult.error;if(unitResult.error)throw unitResult.error;
const settings=settingsResult.data;let timezone=String(settings?.timezone||"America/Los_Angeles");try{new Intl.DateTimeFormat("en-US",{timeZone:timezone}).format(new Date());}catch{timezone="America/Los_Angeles";}const date=requestedDate||dateInTimeZone(timezone),previousDate=addDays(date,-1),shiftSelect="id,staff_id,role,shift_date,shift_type,start_local,end_local,start_time,end_time,timezone";
const shiftQuery=supabaseAdmin.from("shifts").select(shiftSelect).eq("org_code",orgCode).eq("shift_date",date).order("start_time",{ascending:true});
const priorShiftQuery=requestedDate?Promise.resolve({data:[],error:null}):supabaseAdmin.from("shifts").select(shiftSelect).eq("org_code",orgCode).eq("shift_date",previousDate).order("start_time",{ascending:true});
const[shiftResult,priorShiftResult]=await Promise.all([shiftQuery,priorShiftQuery]);if(shiftResult.error)throw shiftResult.error;if(priorShiftResult.error)throw priorShiftResult.error;
const configuredShiftTypes=["Day","Evening","Night"].filter(type=>(shiftSettingResult.data||[]).some(row=>String(row.shift_type||"")===type));if(!configuredShiftTypes.length)configuredShiftTypes.push("Day","Night");
const shifts=shiftResult.data||[],nowMs=Date.now(),candidateActiveShifts=requestedDate?[]:[...(priorShiftResult.data||[]),...shifts],activeShifts=candidateActiveShifts.filter(shift=>isActiveNow(shift,nowMs)),supportShifts=[...shifts];for(const shift of activeShifts)if(!supportShifts.some(existing=>String(existing.id)===String(shift.id)))supportShifts.push(shift);
const activeBeds=bedResult.data||[],staffIds=[...new Set(supportShifts.map(s=>s.staff_id).filter(Boolean))],shiftIds=supportShifts.map(s=>s.id).filter(Boolean),bedIds=activeBeds.map(b=>b.id).filter(Boolean);
const[staffResult,assignmentResult,censusResult]=await Promise.all([staffIds.length?supabaseAdmin.from("staff").select("id,name,role").eq("org_code",orgCode).in("id",staffIds):Promise.resolve({data:[],error:null}),shiftIds.length?supabaseAdmin.from("shift_assignments").select("shift_id,unit_id,unit").eq("org_code",orgCode).in("shift_id",shiftIds):Promise.resolve({data:[],error:null}),bedIds.length?supabaseAdmin.from("census").select("facility_bed_id,status").eq("org_id",orgId).in("facility_bed_id",bedIds):Promise.resolve({data:[],error:null})]);
if(staffResult.error)throw staffResult.error;if(assignmentResult.error)throw assignmentResult.error;if(censusResult.error)throw censusResult.error;let occupied=0,leave=0;for(const row of censusResult.data||[]){const status=String(row.status||"empty").toLowerCase();if(status==="occupied")occupied++;else if(status==="leave")leave++;}const total=activeBeds.length,empty=Math.max(total-occupied-leave,0);
return res.json({date,timezone,lunch_break_minutes:0,configured_shift_types:configuredShiftTypes,census:{occupied,leave,empty,total},shifts,active_shifts:activeShifts,staff:staffResult.data||[],assignments:assignmentResult.data||[],units:unitResult.data||[],meta:{server_ms:Date.now()-started,ppd_basis:"scheduled_hours"}});
}catch(err){console.error("DASHBOARD GET ERROR:",err);return res.status(500).json({error:"Failed to load dashboard"});}});
module.exports=router;
