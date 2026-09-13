import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext.jsx";

const DASHBOARD_REFRESH_MS = 20000;
const ASSIGNMENTS_AUTO_CLOSE_MS = 30000;

function shiftHours(s){if(!s?.start_time||!s?.end_time)return 0;return Math.max((new Date(s.end_time)-new Date(s.start_time))/3600000,0);}
function fmtHours(v){const n=Number(v||0);return Number.isInteger(n)?`${n} hours`:`${n.toFixed(1)} hours`;}
function compactTime(value){
  if(!value)return "—";
  let h,m;
  const raw=String(value);
  const match=raw.match(/(?:T|^)(\d{1,2}):(\d{2})/);
  if(match){h=Number(match[1]);m=Number(match[2]);}
  else{
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return raw;
    h=d.getHours();m=d.getMinutes();
  }
  const suffix=h>=12?"P":"A";
  const hour=h%12||12;
  return m===0?`${hour}${suffix}`:`${hour}:${String(m).padStart(2,"0")}${suffix}`;
}
function shiftTimeRange(s){return `${compactTime(s?.start_local||s?.start_time)}–${compactTime(s?.end_local||s?.end_time)}`;}
function minuteOfDay(v){const m=String(v||"").match(/^(\d{1,2}):(\d{2})/);if(!m)return null;return Number(m[1])*60+Number(m[2]);}
function overlap(start,end,blockStart,blockEnd){let total=0;const ranges=end>1440?[[start,1440],[0,end-1440]]:[[start,end]];for(const[a,b]of ranges){const left=Math.max(a,blockStart),right=Math.min(b,blockEnd);if(right>left)total+=right-left;}return total;}
function shiftBucket(s,configured){
  const available=(configured?.length?configured:["Day","Night"]).filter(x=>["Day","Evening","Night"].includes(x));
  const type=String(s?.shift_type||"");
  if(available.includes(type))return type;
  let start=minuteOfDay(s?.start_local),end=minuteOfDay(s?.end_local);
  if(start==null||end==null)return available[0]||"Day";
  if(end<=start)end+=1440;
  const scores={Day:overlap(start,end,360,840),Evening:overlap(start,end,840,1320),Night:overlap(start,end,1320,1440)+overlap(start,end,0,360)};
  return available.sort((a,b)=>(scores[b]||0)-(scores[a]||0))[0]||"Day";
}

export default function DashboardAssignmentsPage(){
  const {orgLogo}=useUser();
  const [clock,setClock]=useState(new Date());
  const [facilityTimezone,setFacilityTimezone]=useState("America/Los_Angeles");
  const [configuredShiftTypes,setConfiguredShiftTypes]=useState(["Day","Night"]);
  const [shifts,setShifts]=useState([]);const [activeShifts,setActiveShifts]=useState([]);const [staff,setStaff]=useState([]);const [assignments,setAssignments]=useState([]);const [census,setCensus]=useState({occupied:0,leave:0,empty:0,total:0});const [loading,setLoading]=useState(true);
  const [showAssignments,setShowAssignments]=useState(false);

  async function load(){
    try{
      const data=await api.get("/dashboard");
      setShifts(Array.isArray(data?.shifts)?data.shifts:[]);
      setActiveShifts(Array.isArray(data?.active_shifts)?data.active_shifts:[]);
      setStaff(Array.isArray(data?.staff)?data.staff:[]);
      setAssignments(Array.isArray(data?.assignments)?data.assignments:[]);
      setCensus(data?.census&&typeof data.census==="object"?data.census:{occupied:0,leave:0,empty:0,total:0});
      if(data?.timezone)setFacilityTimezone(String(data.timezone));
      if(Array.isArray(data?.configured_shift_types)&&data.configured_shift_types.length)setConfiguredShiftTypes(data.configured_shift_types);
    }finally{setLoading(false)}
  }
  useEffect(()=>{
    load();
    const refresh=setInterval(()=>{if(document.visibilityState!=="hidden")load();},DASHBOARD_REFRESH_MS);
    const clockTimer=setInterval(()=>setClock(new Date()),1000);
    const onVisibility=()=>{if(document.visibilityState==="visible")load();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{clearInterval(refresh);clearInterval(clockTimer);document.removeEventListener("visibilitychange",onVisibility)};
  },[]);
  useEffect(()=>{
    if(!showAssignments)return;
    const timer=window.setTimeout(()=>setShowAssignments(false),ASSIGNMENTS_AUTO_CLOSE_MS);
    return()=>window.clearTimeout(timer);
  },[showAssignments]);

  const staffById=useMemo(()=>Object.fromEntries(staff.map(x=>[String(x.id),x])),[staff]);
  const asgByShift=useMemo(()=>Object.fromEntries(assignments.map(x=>[String(x.shift_id),x])),[assignments]);
  const patientDays=Number(census.occupied||0)+Number(census.leave||0);
  const scheduledHours=useMemo(()=>shifts.reduce((sum,s)=>sum+shiftHours(s),0),[shifts]);
  const projectedPpd=patientDays?scheduledHours/patientDays:null;
  const groups=useMemo(()=>{const g=Object.fromEntries(configuredShiftTypes.map(k=>[k,[]]));shifts.forEach(s=>{const key=shiftBucket(s,configuredShiftTypes);(g[key]||(g[key]=[])).push(s)});return g},[shifts,configuredShiftTypes]);
  const activeGroups=useMemo(()=>{const g=Object.fromEntries(configuredShiftTypes.map(k=>[k,[]]));activeShifts.forEach(s=>{const key=shiftBucket(s,configuredShiftTypes);(g[key]||(g[key]=[])).push(s)});return g},[activeShifts,configuredShiftTypes]);
  const current=configuredShiftTypes.find(key=>(activeGroups[key]||[]).length)||null;
  const displayGroups=useMemo(()=>{
    const g={...groups};
    if(current&&activeGroups[current]?.length)g[current]=activeGroups[current];
    return g;
  },[groups,activeGroups,current]);
  const visible=configuredShiftTypes;
  const clockText=new Intl.DateTimeFormat("en-US",{timeZone:facilityTimezone,dateStyle:"medium",timeStyle:"medium"}).format(clock);

  if(loading)return <div style={{height:"calc(100dvh - 64px)",display:"grid",placeItems:"center",overflow:"hidden"}}>Loading Dashboard…</div>;
  return <div style={{height:"calc(100dvh - 64px)",minHeight:0,overflow:"hidden",padding:"clamp(8px,1.4vh,16px) clamp(12px,2vw,28px)",color:"var(--text)",position:"relative",boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
    <button onClick={()=>setShowAssignments(true)} style={{position:"fixed",top:14,right:18,zIndex:1200,padding:"10px 18px",borderRadius:12,border:"1px solid rgba(127,29,29,.65)",background:"#dc2626",color:"white",fontWeight:950,fontSize:14,cursor:"pointer",boxShadow:"0 8px 20px rgba(220,38,38,.28)"}}>Assignments</button>

    <div style={{textAlign:"center",marginBottom:"clamp(4px,1vh,10px)",flex:"0 0 auto"}}>{orgLogo&&<img src={orgLogo} alt="Facility Logo" style={{height:"clamp(48px,9vh,96px)",maxWidth:"100%",objectFit:"contain"}}/>}</div>
    <div style={{textAlign:"center",fontWeight:800,fontSize:"clamp(12px,1.7vh,15px)",marginBottom:"clamp(5px,1vh,10px)",flex:"0 0 auto"}}>Facility Time: {clockText}</div>

    <div style={{textAlign:"center",fontSize:"clamp(10px,1.35vh,12px)",opacity:.7,flex:"0 0 auto"}}>Census</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:"clamp(6px,1vw,10px)",maxWidth:900,width:"100%",margin:"clamp(4px,.8vh,8px) auto clamp(6px,1vh,10px)",flex:"0 0 auto"}}><Stat label="Occupied" value={census.occupied}/><Stat label="Leave" value={census.leave}/><Stat label="Empty" value={census.empty}/><Stat label="Total" value={census.total}/></div>
    <div style={{maxWidth:900,width:"100%",margin:"0 auto clamp(6px,1vh,12px)",display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"clamp(6px,1vw,10px)",flex:"0 0 auto"}}><Stat label="Scheduled Nursing Hours" value={scheduledHours.toFixed(1)}/><Stat label="Projected PPD (24 hr)" value={projectedPpd==null?"—":projectedPpd.toFixed(2)} note="Scheduled span before meal deductions"/></div>

    <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(visible.length,3)},minmax(0,1fr))`,gap:"clamp(8px,1.4vw,16px)",maxWidth:visible.length===2?1100:1500,width:"100%",margin:"0 auto",flex:"1 1 auto",minHeight:0,overflow:"hidden"}}>
      {visible.map(key=><ShiftCard key={key} label={`${key} Shift`} active={current===key} rows={displayGroups[key]||[]} staffById={staffById} asgByShift={asgByShift}/>) }
    </div>

    {showAssignments&&<AssignmentModal shiftTypes={configuredShiftTypes} groups={displayGroups} staffById={staffById} asgByShift={asgByShift} onClose={()=>setShowAssignments(false)}/>} 
  </div>
}

function ShiftCard({label,active,rows,staffById,asgByShift}){
  const licensed=rows.filter(s=>["RN","LPN"].includes(String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()));
  const cnas=rows.filter(s=>String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()==="CNA");
  const hours=rows.reduce((sum,s)=>sum+shiftHours(s),0);
  const line=s=>{const p=staffById[String(s.staff_id)]||{};const a=asgByShift[String(s.id)]||{};const role=String(p.role||s.role||"STAFF").toUpperCase();return `${role} — ${a.unit||"Unassigned"} — ${fmtHours(shiftHours(s))}${s.shift_type==="Custom"?` (${shiftTimeRange(s)})`:""}`};
  return <div style={{padding:"clamp(10px,1.8vh,18px)",height:"100%",minHeight:0,overflow:"hidden",borderRadius:14,background:"var(--card-bg,rgba(255,255,255,.08))",border:active?"2px solid #3b82f6":"1px solid var(--border)",boxSizing:"border-box",fontSize:"clamp(11px,1.45vh,14px)"}}>
    <h2 style={{margin:"0 0 clamp(5px,1vh,10px)",fontSize:"clamp(18px,2.5vh,24px)"}}>{label}</h2>
    <h3 style={{margin:"clamp(4px,.8vh,8px) 0",fontSize:"clamp(13px,1.8vh,17px)"}}>Licensed Staff</h3>{licensed.length?licensed.map(s=><div key={s.id} style={{marginBottom:3}}>{line(s)}</div>):<div style={{opacity:.7}}>No licensed staff scheduled.</div>}
    <h3 style={{margin:"clamp(6px,1vh,10px) 0 clamp(4px,.7vh,7px)",fontSize:"clamp(13px,1.8vh,17px)"}}>CNAs</h3>{cnas.length?cnas.map(s=><div key={s.id} style={{marginBottom:3}}>{line(s)}</div>):<div style={{opacity:.7}}>No CNAs scheduled.</div>}
    {!rows.length&&<div style={{marginTop:6,opacity:.7}}>No staff scheduled today.</div>}
    <div style={{borderTop:"1px solid var(--border)",marginTop:"clamp(6px,1vh,10px)",paddingTop:"clamp(5px,.8vh,8px)"}}><small style={{opacity:.65}}>Scheduled Hours</small><div style={{fontSize:"clamp(16px,2.2vh,20px)",fontWeight:900}}>{hours.toFixed(1)}</div></div>
  </div>
}

function AssignmentModal({shiftTypes,groups,staffById,asgByShift,onClose}){
  return <div onMouseDown={onClose} style={{position:"fixed",inset:0,zIndex:5000,background:"rgba(0,0,0,.58)",display:"grid",placeItems:"center",padding:18}}>
    <div onMouseDown={e=>e.stopPropagation()} style={{width:"min(1100px,96vw)",maxHeight:"86vh",overflowY:"auto",borderRadius:20,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",boxShadow:"0 28px 80px rgba(0,0,0,.45)"}}>
      <div style={{position:"sticky",top:0,zIndex:2,display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"18px 20px",borderBottom:"1px solid var(--border)",background:"var(--surface)"}}><div><div style={{fontSize:12,fontWeight:900,letterSpacing:".12em",textTransform:"uppercase",opacity:.6}}>ShiftCensus</div><h2 style={{margin:"3px 0 0",fontSize:28}}>Assignments</h2></div><button onClick={onClose} style={{width:40,height:40,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-glass)",color:"inherit",fontSize:22,fontWeight:900,cursor:"pointer"}}>×</button></div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(shiftTypes.length,3)},minmax(0,1fr))`,gap:14,padding:18}}>{shiftTypes.map(type=><AssignmentSection key={type} label={`${type} Shift`} rows={groups[type]||[]} staffById={staffById} asgByShift={asgByShift}/>)}</div>
    </div>
  </div>
}
function AssignmentSection({label,rows,staffById,asgByShift}){
  const ordered=[...rows].sort((a,b)=>{const aa=asgByShift[String(a.id)]?.unit||"Unassigned",ba=asgByShift[String(b.id)]?.unit||"Unassigned";if(aa!==ba)return aa.localeCompare(ba);return String(staffById[String(a.staff_id)]?.name||"").localeCompare(String(staffById[String(b.staff_id)]?.name||""));});
  const nurses=ordered.filter(s=>["RN","LPN"].includes(String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()));
  const cnas=ordered.filter(s=>String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()==="CNA");
  return <section style={{border:"1px solid var(--border)",borderRadius:16,overflow:"hidden",background:"var(--surface-glass)",minWidth:0}}><div style={{padding:"13px 16px",fontSize:20,fontWeight:950,borderBottom:"1px solid var(--border)"}}>{label}</div><RoleGroup title="Nurses" rows={nurses} staffById={staffById} asgByShift={asgByShift}/><RoleGroup title="CNAs" rows={cnas} staffById={staffById} asgByShift={asgByShift}/></section>
}
function RoleGroup({title,rows,staffById,asgByShift}){
  return <div style={{padding:"14px 15px",borderBottom:"1px solid var(--border)"}}><div style={{fontSize:12,fontWeight:950,textTransform:"uppercase",letterSpacing:".08em",opacity:.6,marginBottom:8}}>{title}</div>{rows.length===0?<div style={{fontSize:13,opacity:.55}}>None scheduled.</div>:rows.map(s=>{const p=staffById[String(s.staff_id)]||{},a=asgByShift[String(s.id)]||{},role=String(p.role||s.role||"STAFF").toUpperCase();return <div key={s.id} style={{padding:"9px 0",borderTop:"1px solid rgba(127,127,127,.12)"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"baseline"}}><div style={{fontWeight:950,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name||`Staff #${s.staff_id}`}</div><div style={{fontWeight:900,fontSize:12,opacity:.7}}>{role}</div></div><div style={{display:"flex",justifyContent:"space-between",gap:10,marginTop:3,fontSize:12,opacity:.75}}><span>{a.unit||"Unassigned"}</span><span>{s.shift_type==="Custom"?"Custom ":""}{shiftTimeRange(s)}</span></div></div>})}</div>
}
function Stat({label,value,note}){return <div style={{padding:"clamp(7px,1.15vh,11px) clamp(8px,1vw,14px)",borderRadius:14,border:"1px solid var(--border)",background:"var(--surface)",textAlign:"center",minHeight:0}}><div style={{fontSize:"clamp(9px,1.25vh,11px)",fontWeight:900,textTransform:"uppercase",opacity:.7}}>{label}</div><div style={{fontSize:"clamp(20px,3.2vh,28px)",fontWeight:950,marginTop:2,lineHeight:1}}>{value}</div>{note&&<div style={{fontSize:"clamp(8px,1.05vh,10px)",opacity:.55,marginTop:3}}>{note}</div>}</div>}
