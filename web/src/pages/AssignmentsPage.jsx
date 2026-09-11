import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

function todayYmd(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

export default function AssignmentsPage(){
  const [date,setDate]=useState(todayYmd());
  const [shifts,setShifts]=useState([]);
  const [staff,setStaff]=useState([]);
  const [units,setUnits]=useState([]);
  const [defs,setDefs]=useState([]);
  const [assigned,setAssigned]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(null);

  async function load(){
    setLoading(true);
    try{
      const [s,p,u,d,a]=await Promise.all([
        api.get("/shifts"),api.get("/staff"),api.get("/units"),api.get("/assignments"),api.get(`/shift-assignments?date=${encodeURIComponent(date)}`)
      ]);
      setShifts((Array.isArray(s)?s:[]).filter(x=>x.shift_date===date));
      setStaff(Array.isArray(p)?p:[]);setUnits(Array.isArray(u)?u:[]);setDefs(Array.isArray(d)?d:[]);setAssigned(Array.isArray(a)?a:[]);
    }finally{setLoading(false);}
  }
  useEffect(()=>{load();},[date]);

  const staffById=useMemo(()=>Object.fromEntries(staff.map(s=>[String(s.id),s])),[staff]);
  const assignedByShift=useMemo(()=>Object.fromEntries(assigned.map(a=>[String(a.shift_id),a])),[assigned]);

  const grouped=useMemo(()=>{
    const out={Day:[],Evening:[],Night:[]};
    shifts.forEach(s=>{const key=s.shift_type||"Day";(out[key]||(out[key]=[])).push(s)});
    return out;
  },[shifts]);

  async function setUnit(shift,unitName){
    const unit=units.find(u=>u.name===unitName);
    setSaving(shift.id);
    try{
      if(!unitName){await api.delete(`/shift-assignments/${shift.id}`);}else{
        const existing=assignedByShift[String(shift.id)];
        await api.put(`/shift-assignments/${shift.id}`,{unit_id:unit?.id||null,unit:unitName,assignment_number:existing?.assignment_number??null});
      }
      await load();
    }finally{setSaving(null);}
  }

  async function setAssignmentNumber(shift,value){
    const existing=assignedByShift[String(shift.id)];
    if(!existing?.unit)return;
    setSaving(shift.id);
    try{
      await api.put(`/shift-assignments/${shift.id}`,{unit_id:existing.unit_id||null,unit:existing.unit,assignment_number:value?Number(value):null});
      await load();
    }finally{setSaving(null);}
  }

  function assignmentOptions(unit){return defs.filter(d=>d.unit===unit);}

  if(loading)return <div style={{padding:32}}>Loading assignments…</div>;

  return <div style={{padding:24,color:"var(--text)",maxWidth:1200,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
      <div><h1 style={{margin:0}}>Assignments</h1><div style={{opacity:.65,marginTop:4}}>Everyone scheduled for the day appears here. Assign the working staff to their unit after the schedule is built.</div></div>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={input}/>
    </div>

    {shifts.length===0?<div style={empty}>No staff are scheduled for this date.</div>:
      ["Day","Evening","Night"].map(block=>grouped[block]?.length?<section key={block} style={{marginBottom:24}}>
        <h2>{block} Shift</h2>
        <div style={{display:"grid",gap:10}}>
          {grouped[block].map(shift=>{
            const person=staffById[String(shift.staff_id)]||{};
            const current=assignedByShift[String(shift.id)]||{};
            const isCna=String(person.role||shift.role).toUpperCase()==="CNA";
            const opts=assignmentOptions(current.unit);
            return <div key={shift.id} style={row}>
              <div style={{minWidth:220}}><div style={{fontWeight:900,fontSize:16}}>{person.name||`Staff #${shift.staff_id}`}</div><div style={{opacity:.65,fontSize:12}}>{person.role||shift.role} · {shift.start_local||""}–{shift.end_local||""}</div></div>
              <label style={field}><span>Unit</span><select value={current.unit||""} disabled={saving===shift.id} onChange={e=>setUnit(shift,e.target.value)} style={input}><option value="">Unassigned</option>{units.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}</select></label>
              {isCna?<label style={field}><span>CNA Assignment</span><select value={current.assignment_number??""} disabled={!current.unit||saving===shift.id} onChange={e=>setAssignmentNumber(shift,e.target.value)} style={input}><option value="">No assignment</option>{opts.map(a=><option key={a.id} value={a.number}>#{a.number}{a.label?` – ${a.label}`:""}</option>)}</select></label>:<div style={{opacity:.5,fontSize:12}}>Unit assignment only</div>}
              <div style={{fontWeight:900,minWidth:100,color:current.unit?"#22c55e":"#f59e0b"}}>{saving===shift.id?"Saving…":current.unit?"Assigned":"Unassigned"}</div>
            </div>
          })}
        </div>
      </section>:null)}
  </div>;
}

const input={padding:"10px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface)",color:"inherit"};
const row={display:"grid",gridTemplateColumns:"minmax(220px,1.4fr) minmax(180px,1fr) minmax(180px,1fr) auto",gap:14,alignItems:"end",padding:14,border:"1px solid var(--border)",borderRadius:14,background:"var(--surface)"};
const field={display:"grid",gap:6,fontSize:12,fontWeight:800};
const empty={padding:20,border:"1px dashed var(--border)",borderRadius:14,opacity:.7};
