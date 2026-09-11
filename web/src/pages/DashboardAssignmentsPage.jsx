import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext.jsx";

function todayYmd(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function norm(s){const v=String(s||"empty").toLowerCase();return ["occupied","leave","empty"].includes(v)?v:"empty";}

export default function DashboardAssignmentsPage(){
  const {orgLogo}=useUser();
  const [clock,setClock]=useState(new Date());
  const [shifts,setShifts]=useState([]);const [staff,setStaff]=useState([]);const [bedBoard,setBedBoard]=useState([]);const [assignments,setAssignments]=useState([]);const [loading,setLoading]=useState(true);
  const date=todayYmd();

  async function load(){
    try{
      const [s,p,b,a]=await Promise.all([api.get("/shifts"),api.get("/staff"),api.get("/census/bed-board"),api.get(`/shift-assignments?date=${date}`)]);
      setShifts((Array.isArray(s)?s:[]).filter(x=>x.shift_date===date));setStaff(Array.isArray(p)?p:[]);setBedBoard(Array.isArray(b)?b:[]);setAssignments(Array.isArray(a)?a:[]);
    }finally{setLoading(false)}
  }
  useEffect(()=>{load();const a=setInterval(load,5000);const b=setInterval(()=>setClock(new Date()),1000);return()=>{clearInterval(a);clearInterval(b)};},[]);

  const staffById=useMemo(()=>Object.fromEntries(staff.map(x=>[String(x.id),x])),[staff]);
  const asgByShift=useMemo(()=>Object.fromEntries(assignments.map(x=>[String(x.shift_id),x])),[assignments]);
  const census=useMemo(()=>{const total=bedBoard.length,occupied=bedBoard.filter(x=>norm(x.status)==="occupied").length,leave=bedBoard.filter(x=>norm(x.status)==="leave").length;return{total,occupied,leave,empty:total-occupied-leave}},[bedBoard]);
  const patientDays=census.occupied+census.leave;
  const groups=useMemo(()=>{const g={Day:[],Evening:[],Night:[]};shifts.forEach(s=>{const key=s.shift_type||"Day";(g[key]||(g[key]=[])).push(s)});return g},[shifts]);
  const visible=["Day","Evening","Night"].filter(k=>groups[k]?.length||k!=="Evening");
  const current=(()=>{const h=clock.getHours();return h>=6&&h<14?"Day":h>=14&&h<22?"Evening":"Night"})();

  if(loading)return <div style={{padding:40}}>Loading Dashboard…</div>;
  return <div style={{padding:32,color:"var(--text)"}}>
    <div style={{textAlign:"center",marginBottom:18}}>{orgLogo&&<img src={orgLogo} alt="Facility Logo" style={{height:160,maxWidth:"100%",objectFit:"contain"}}/>}</div>
    <div style={{textAlign:"center",fontWeight:800,marginBottom:10}}>Current Time: {clock.toLocaleString()}</div>
    <div style={{textAlign:"center",fontSize:12,opacity:.7}}>Census</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(120px,1fr))",gap:12,maxWidth:900,margin:"10px auto 24px"}}>
      <Stat label="Occupied" value={census.occupied}/><Stat label="Leave" value={census.leave}/><Stat label="Empty" value={census.empty}/><Stat label="Total" value={census.total}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(visible.length,3)},minmax(0,1fr))`,gap:24,maxWidth:visible.length===2?1100:1500,margin:"0 auto"}}>
      {visible.map(key=><ShiftCard key={key} label={`${key} Shift`} active={current===key} rows={groups[key]||[]} staffById={staffById} asgByShift={asgByShift} patientDays={patientDays}/>) }
    </div>
  </div>
}

function ShiftCard({label,active,rows,staffById,asgByShift,patientDays}){
  const licensed=rows.filter(s=>["RN","LPN"].includes(String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()));
  const cnas=rows.filter(s=>String(staffById[String(s.staff_id)]?.role||s.role).toUpperCase()==="CNA");
  const hours=rows.reduce((sum,s)=>{if(!s.start_time||!s.end_time)return sum;return sum+Math.max((new Date(s.end_time)-new Date(s.start_time))/3600000,0)},0);
  const ppd=patientDays?hours/patientDays:null;
  const line=s=>{const p=staffById[String(s.staff_id)]||{};const a=asgByShift[String(s.id)]||{};return `${p.name||`Staff #${s.staff_id}`} — ${a.unit||"Unassigned"}${a.assignment_number?` · Assignment #${a.assignment_number}`:""}`};
  return <div style={{padding:28,minHeight:260,borderRadius:14,background:"var(--card-bg,rgba(255,255,255,.08))",border:active?"2px solid #3b82f6":"1px solid var(--border)"}}>
    <h2 style={{marginTop:0}}>{label}</h2>
    <h3>Licensed Staff</h3>{licensed.length?licensed.map(s=><div key={s.id} style={{marginBottom:5}}>{line(s)}</div>):<div style={{opacity:.7}}>No licensed staff scheduled.</div>}
    <h3>CNAs</h3>{cnas.length?cnas.map(s=><div key={s.id} style={{marginBottom:5}}>{line(s)}</div>):<div style={{opacity:.7}}>No CNAs scheduled.</div>}
    {!rows.length&&<div style={{marginTop:10,opacity:.7}}>No staff scheduled today.</div>}
    <div style={{borderTop:"1px solid var(--border)",marginTop:16,paddingTop:12,display:"flex",justifyContent:"space-between",gap:12}}><div><small style={{opacity:.65}}>Patients</small><div style={{fontSize:20,fontWeight:900}}>{patientDays}</div></div><div style={{textAlign:"right"}}><small style={{opacity:.65}}>PPD</small><div style={{fontSize:20,fontWeight:900}}>{ppd==null?"—":ppd.toFixed(2)}</div></div></div>
  </div>
}
function Stat({label,value}){return <div style={{padding:"14px 16px",borderRadius:14,border:"1px solid var(--border)",background:"var(--surface)",textAlign:"center"}}><div style={{fontSize:11,fontWeight:900,textTransform:"uppercase",opacity:.7}}>{label}</div><div style={{fontSize:30,fontWeight:950,marginTop:6}}>{value}</div></div>}
