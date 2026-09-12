import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";

function todayYmd(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

export default function AssignmentsPage(){
  const [date,setDate]=useState(todayYmd());
  const [shifts,setShifts]=useState([]);const [staff,setStaff]=useState([]);const [units,setUnits]=useState([]);const [assigned,setAssigned]=useState([]);
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(null);const dayRequest=useRef(0);

  async function loadDay(targetDate=date){
    const requestId=++dayRequest.current;
    const data=await api.get(`/operations-snapshot?date=${encodeURIComponent(targetDate)}`);
    if(requestId!==dayRequest.current)return;
    setShifts(Array.isArray(data?.shifts)?data.shifts:[]);
    setStaff(Array.isArray(data?.staff)?data.staff:[]);
    setUnits(Array.isArray(data?.units)?data.units:[]);
    setAssigned(Array.isArray(data?.assignments)?data.assignments:[]);
  }
  useEffect(()=>{let alive=true;(async()=>{setLoading(true);try{await loadDay(date);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;dayRequest.current++;};},[]);
  useEffect(()=>{if(loading)return;loadDay(date);},[date]);

  const staffById=useMemo(()=>Object.fromEntries(staff.map(s=>[String(s.id),s])),[staff]);
  const assignedByShift=useMemo(()=>Object.fromEntries(assigned.map(a=>[String(a.shift_id),a])),[assigned]);
  const grouped=useMemo(()=>{const out={Day:[],Evening:[],Night:[]};shifts.forEach(s=>{const key=s.shift_type||"Day";(out[key]||(out[key]=[])).push(s)});return out;},[shifts]);

  async function setUnit(shift,unitName){
    const unit=units.find(u=>u.name===unitName);const shiftKey=String(shift.id);const previous=assignedByShift[shiftKey]||null;
    setSaving(shift.id);
    setAssigned(cur=>{const rest=cur.filter(a=>String(a.shift_id)!==shiftKey);return unitName?[...rest,{...(previous||{}),shift_id:shift.id,unit_id:unit?.id||null,unit:unitName,assignment_number:null}]:rest;});
    try{
      if(!unitName)await api.delete(`/shift-assignments/${shift.id}`);
      else{const saved=await api.put(`/shift-assignments/${shift.id}`,{unit_id:unit?.id||null,unit:unitName,assignment_number:null});if(saved)setAssigned(cur=>[...cur.filter(a=>String(a.shift_id)!==shiftKey),saved]);}
    }catch(e){setAssigned(cur=>{const rest=cur.filter(a=>String(a.shift_id)!==shiftKey);return previous?[...rest,previous]:rest;});alert(e?.message||"Unable to save assignment.");}
    finally{setSaving(null);}
  }

  if(loading)return <div style={{padding:32}}>Loading assignments…</div>;
  return <div style={{padding:24,color:"var(--text)",maxWidth:1100,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}><div><h1 style={{margin:0}}>Assignments</h1><div style={{opacity:.65,marginTop:4}}>Everyone scheduled for the day appears here. Assign each working staff member to a unit.</div></div><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={input}/></div>
    {shifts.length===0?<div style={empty}>No staff are scheduled for this date.</div>:["Day","Evening","Night"].map(block=>grouped[block]?.length?<section key={block} style={{marginBottom:24}}><h2>{block} Shift</h2><div style={{display:"grid",gap:10}}>{grouped[block].map(shift=>{const person=staffById[String(shift.staff_id)]||{};const current=assignedByShift[String(shift.id)]||{};return <div key={shift.id} style={row}><div style={{minWidth:220}}><div style={{fontWeight:900,fontSize:16}}>{person.name||`Staff #${shift.staff_id}`}</div><div style={{opacity:.65,fontSize:12}}>{person.role||shift.role} · {shift.start_local||""}–{shift.end_local||""}</div></div><label style={field}><span>Unit</span><select value={current.unit||""} disabled={saving===shift.id} onChange={e=>setUnit(shift,e.target.value)} style={input}><option value="">Unassigned</option>{units.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}</select></label><div style={{fontWeight:900,minWidth:100,color:current.unit?"#22c55e":"#f59e0b"}}>{saving===shift.id?"Saving…":current.unit?"Assigned":"Unassigned"}</div></div>})}</div></section>:null)}
  </div>;
}
const input={padding:"10px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface)",color:"inherit"};
const row={display:"grid",gridTemplateColumns:"minmax(220px,1.4fr) minmax(180px,1fr) auto",gap:14,alignItems:"end",padding:14,border:"1px solid var(--border)",borderRadius:14,background:"var(--surface)"};
const field={display:"grid",gap:6,fontSize:12,fontWeight:800};const empty={padding:20,border:"1px dashed var(--border)",borderRadius:14,opacity:.7};
