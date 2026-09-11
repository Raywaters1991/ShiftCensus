import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext.jsx";

const ASSIGNMENT_VIEW_SECONDS = 30;

function todayYmd(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function norm(s){const v=String(s||"empty").toLowerCase();return ["occupied","leave","empty"].includes(v)?v:"empty";}
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
function shiftTimeRange(s){
  const start=s?.start_local||s?.start_time;
  const end=s?.end_local||s?.end_time;
  return `${compactTime(start)}–${compactTime(end)}`;
}

export default function DashboardAssignmentsPage(){
  const {orgLogo}=useUser();
  const [clock,setClock]=useState(new Date());
  const [shifts,setShifts]=useState([]);const [staff,setStaff]=useState([]);const [bedBoard,setBedBoard]=useState([]);const [assignments,setAssignments]=useState([]);const [loading,setLoading]=useState(true);
  const [showAssignments,setShowAssignments]=useState(false);
  const [secondsLeft,setSecondsLeft]=useState(ASSIGNMENT_VIEW_SECONDS);
  const date=todayYmd();

  async function load(){
    try{
      const [s,p,b,a]=await Promise.all([api.get("/shifts"),api.get("/staff"),api.get("/census/bed-board"),api.get(`/shift-assignments?date=${date}`)]);
      setShifts((Array.isArray(s)?s:[]).filter(x=>x.shift_date===date));setStaff(Array.isArray(p)?p:[]);setBedBoard(Array.isArray(b)?b:[]);setAssignments(Array.isArray(a)?a:[]);
    }finally{setLoading(false)}
  }
  useEffect(()=>{load();const a=setInterval(load,5000);const b=setInterval(()=>setClock(new Date()),1000);return()=>{clearInterval(a);clearInterval(b)};},[]);
  useEffect(()=>{
    if(!showAssignments)return;
    setSecondsLeft(ASSIGNMENT_VIEW_SECONDS);
    const timer=setInterval(()=>setSecondsLeft(v=>{
      if(v<=1){clearInterval(timer);setShowAssignments(false);return ASSIGNMENT_VIEW_SECONDS;}
      return v-1;
    }),1000);
    return()=>clearInterval(timer);
  },[showAssignments]);

  const staffById=useMemo(()=>Object.fromEntries(staff.map(x=>[String(x.id),x])),[staff]);
  const asgByShift=useMemo(()=>Object.fromEntries(assignments.map(x=>[String(x.shift_id),x])),[assignments]);
  const census=useMemo(()=>{const total=bedBoard.length,occupied=bedBoard.filter(x=>norm(x.status)==="occupied").length,leave=bedBoard.filter(x=>norm(x.status)==="leave").length;return{total,occupied,leave,empty:total-occupied-leave}},[bedBoard]);
  const patientDays=census.occupied+census.leave;
  const groups=useMemo(()=>{const g={Day:[],Evening:[],Night:[]};shifts.forEach(s=>{const key=s.shift_type||"Day";(g[key]||(g[key]=[])).push(s)});return g},[shifts]);
  const visible=["Day","Evening","Night"].filter(k=>groups[k]?.length||k!=="Evening");
  const current=(()=>{const h=clock.getHours();return h>=6&&h<14?"Day":h>=14&&h<22?"Evening":"Night"})();

  if(loading)return <div style={{padding:40}}>Loading Dashboard…</div>;
  return <div style={{padding:32,color:"var(--text)",position:"relative"}}>
    <div style={{textAlign:"center",marginBottom:18}}>{orgLogo&&<img src={orgLogo} alt="Facility Logo" style={{height:160,maxWidth:"100%",objectFit:"contain"}}/>}</div>
    <div style={{textAlign:"center",fontWeight:800,marginBottom:10}}>Current Time: {clock.toLocaleString()}</div>

    <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
      <button onClick={()=>setShowAssignments(true)} style={{padding:"12px 28px",borderRadius:999,border:"1px solid var(--border)",background:"#2563eb",color:"white",fontWeight:950,fontSize:16,cursor:"pointer",boxShadow:"0 8px 22px rgba(37,99,235,.22)"}}>Assignments</button>
    </div>

    <div style={{textAlign:"center",fontSize:12,opacity:.7}}>Census</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(120px,1fr))",gap:12,maxWidth:900,margin:"10px auto 24px"}}>
      <Stat label="Occupied" value={census.occupied}/><Stat label="Leave" value={census.leave}/><Stat label="Empty" value={census.empty}/><Stat label="Total" value={census.total}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(visible.length,3)},minmax(0,1fr))`,gap:24,maxWidth:visible.length===2?1100:1500,margin:"0 auto"}}>
      {visible.map(key=><ShiftCard key={key} label={`${key} Shift`} active={current===key} rows={groups[key]||[]} staffById={staffById} asgByShift={asgByShift} patientDays={patientDays}/>) }
    </div>

    {showAssignments&&<AssignmentOverlay
      groups={groups}
      staffById={staffById}
      asgByShift={asgByShift}
      secondsLeft={secondsLeft}
      onClose={()=>setShowAssignments(false)}
    />}
  </div>
}

function ShiftCard({label,active,rows,staffById,asgByShift,patientDays}){
  const licensed=rows.filter(s=>["RN","LPN"].includes(String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()));
  const cnas=rows.filter(s=>String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()==="CNA");
  const hours=rows.reduce((sum,s)=>sum+shiftHours(s),0);
  const ppd=patientDays?hours/patientDays:null;
  const line=s=>{const p=staffById[String(s.staff_id)]||{};const a=asgByShift[String(s.id)]||{};const role=String(p.role||s.role||"STAFF").toUpperCase();return `${role} — ${a.unit||"Unassigned"} — ${fmtHours(shiftHours(s))}`};
  return <div style={{padding:28,minHeight:260,borderRadius:14,background:"var(--card-bg,rgba(255,255,255,.08))",border:active?"2px solid #3b82f6":"1px solid var(--border)"}}>
    <h2 style={{marginTop:0}}>{label}</h2>
    <h3>Licensed Staff</h3>{licensed.length?licensed.map(s=><div key={s.id} style={{marginBottom:5}}>{line(s)}</div>):<div style={{opacity:.7}}>No licensed staff scheduled.</div>}
    <h3>CNAs</h3>{cnas.length?cnas.map(s=><div key={s.id} style={{marginBottom:5}}>{line(s)}</div>):<div style={{opacity:.7}}>No CNAs scheduled.</div>}
    {!rows.length&&<div style={{marginTop:10,opacity:.7}}>No staff scheduled today.</div>}
    <div style={{borderTop:"1px solid var(--border)",marginTop:16,paddingTop:12,display:"flex",justifyContent:"space-between",gap:12}}><div><small style={{opacity:.65}}>Patients</small><div style={{fontSize:20,fontWeight:900}}>{patientDays}</div></div><div style={{textAlign:"right"}}><small style={{opacity:.65}}>PPD</small><div style={{fontSize:20,fontWeight:900}}>{ppd==null?"—":ppd.toFixed(2)}</div></div></div>
  </div>
}

function AssignmentOverlay({groups,staffById,asgByShift,secondsLeft,onClose}){
  const sections=[
    {key:"Day",label:"Day Shift",rows:groups.Day||[]},
    {key:"Night",label:"Night Shift",rows:groups.Night||[]},
  ];
  if((groups.Evening||[]).length)sections.push({key:"Evening",label:"Evening Shift",rows:groups.Evening||[]});

  return <div style={{position:"fixed",inset:0,zIndex:5000,background:"rgba(3,7,18,.98)",color:"white",padding:"24px",overflowY:"auto"}}>
    <div style={{maxWidth:1500,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",borderBottom:"1px solid rgba(255,255,255,.15)",paddingBottom:14,marginBottom:18}}>
        <div><div style={{fontSize:12,fontWeight:900,letterSpacing:".12em",textTransform:"uppercase",opacity:.65}}>ShiftCensus Wallboard</div><h1 style={{margin:"4px 0 0",fontSize:32}}>Assignments</h1></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{fontWeight:850,opacity:.75}}>Back to census in {secondsLeft}s</div><button onClick={onClose} style={{padding:"10px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.1)",color:"white",fontWeight:900,cursor:"pointer"}}>Back to Census</button></div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:sections.length===2?"repeat(2,minmax(0,1fr))":"repeat(auto-fit,minmax(360px,1fr))",gap:18}}>
        {sections.map(section=><AssignmentSection key={section.key} label={section.label} rows={section.rows} staffById={staffById} asgByShift={asgByShift}/>) }
      </div>
    </div>
  </div>
}

function AssignmentSection({label,rows,staffById,asgByShift}){
  const ordered=[...rows].sort((a,b)=>{
    const aa=asgByShift[String(a.id)]?.unit||"Unassigned";
    const ba=asgByShift[String(b.id)]?.unit||"Unassigned";
    if(aa!==ba)return aa.localeCompare(ba);
    const ar=String(staffById[String(a.staff_id)]?.role||a.role||"");
    const br=String(staffById[String(b.staff_id)]?.role||b.role||"");
    return ar.localeCompare(br)||String(staffById[String(a.staff_id)]?.name||"").localeCompare(String(staffById[String(b.staff_id)]?.name||""));
  });

  return <section style={{border:"1px solid rgba(255,255,255,.16)",borderRadius:16,overflow:"hidden",background:"rgba(255,255,255,.04)"}}>
    <div style={{padding:"14px 18px",fontSize:24,fontWeight:950,borderBottom:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.06)"}}>{label}</div>
    {ordered.length===0?<div style={{padding:24,textAlign:"center",fontSize:18,opacity:.6}}>No staff scheduled.</div>:<div>{ordered.map(s=>{
      const p=staffById[String(s.staff_id)]||{};
      const a=asgByShift[String(s.id)]||{};
      const role=String(p.role||s.role||"STAFF").toUpperCase();
      return <div key={s.id} style={{display:"grid",gridTemplateColumns:"minmax(150px,1.35fr) 70px minmax(110px,.9fr) 105px",gap:10,alignItems:"center",padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,.08)",fontSize:17}}>
        <div style={{fontWeight:950,fontSize:19,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name||`Staff #${s.staff_id}`}</div>
        <div style={{fontWeight:950}}>{role}</div>
        <div style={{fontWeight:800}}>{a.unit||"Unassigned"}</div>
        <div style={{textAlign:"right",fontWeight:900}}>{shiftTimeRange(s)}</div>
      </div>
    })}</div>}
  </section>
}

function Stat({label,value}){return <div style={{padding:"14px 16px",borderRadius:14,border:"1px solid var(--border)",background:"var(--surface)",textAlign:"center"}}><div style={{fontSize:11,fontWeight:900,textTransform:"uppercase",opacity:.7}}>{label}</div><div style={{fontSize:30,fontWeight:950,marginTop:6}}>{value}</div></div>}
