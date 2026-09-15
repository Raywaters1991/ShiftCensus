import {useEffect,useMemo,useRef,useState} from "react";
import api from "../services/api";
import {useUser} from "../contexts/UserContext.jsx";

const COMMON_TIMEZONES=["America/Los_Angeles","America/Denver","America/Phoenix","America/Chicago","America/New_York","America/Anchorage","Pacific/Honolulu"];
const SHIFT_TYPES=["Day","Evening","Night"];
const DEFAULTS={timezone:"America/Los_Angeles",lunch_break_minutes:30,pay_period_length_days:14,pay_period_anchor_date:"",week_starts_on:"Sunday"};

export default function FacilityOperationsSettingsPage(){
  const{orgName,orgCode,orgId}=useUser();
  const[settings,setSettings]=useState(DEFAULTS),[shiftSettings,setShiftSettings]=useState([]);
  const[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[saving,setSaving]=useState(false),[editing,setEditing]=useState(null),[error,setError]=useState("");
  const[form,setForm]=useState({role:"",shift_type:"Day",start_local:"07:00",end_local:"15:00"});
  const seq=useRef(0);

  async function load({silent=false}={}){
    if(!orgId)return;
    const request=++seq.current;
    if(silent)setRefreshing(true);else setLoading(true);
    setError("");
    try{
      const[a,b]=await Promise.all([api.get("/org-settings/operations"),api.get("/shift-settings")]);
      if(request!==seq.current)return;
      setSettings({timezone:a?.timezone||DEFAULTS.timezone,lunch_break_minutes:Number(a?.lunch_break_minutes??30),pay_period_length_days:Number(a?.pay_period_length_days??14),pay_period_anchor_date:a?.pay_period_anchor_date||"",week_starts_on:a?.week_starts_on||"Sunday"});
      setShiftSettings(Array.isArray(b)?b:[]);
    }catch(e){if(request===seq.current)setError(e?.message||"Unable to load facility settings.");}
    finally{if(request===seq.current){setLoading(false);setRefreshing(false)}}
  }
  useEffect(()=>{setSettings(DEFAULTS);setShiftSettings([]);setLoading(true);load();return()=>{seq.current+=1}},[orgId]);

  const roles=useMemo(()=>[...new Set(shiftSettings.map(x=>x.role).filter(Boolean))].sort(),[shiftSettings]);
  const grouped=useMemo(()=>roles.map(role=>({role,rows:shiftSettings.filter(x=>x.role===role).sort((a,b)=>SHIFT_TYPES.indexOf(a.shift_type)-SHIFT_TYPES.indexOf(b.shift_type))})),[roles,shiftSettings]);

  async function saveOperations(){setSaving(true);try{const out=await api.put("/org-settings/operations",{...settings,lunch_break_minutes:Number(settings.lunch_break_minutes),pay_period_length_days:Number(settings.pay_period_length_days),pay_period_anchor_date:settings.pay_period_anchor_date||null});setSettings(s=>({...s,...out,pay_period_anchor_date:out?.pay_period_anchor_date||""}));}catch(e){alert(e?.message||"Unable to save facility settings.")}finally{setSaving(false)}}
  function beginEdit(x){setEditing(x);setForm({role:x.role||"",shift_type:x.shift_type||"Day",start_local:String(x.start_local||"07:00").slice(0,5),end_local:String(x.end_local||"15:00").slice(0,5)})}
  function beginNew(){setEditing({id:null});setForm({role:roles[0]||"CNA",shift_type:"Day",start_local:"07:00",end_local:"15:00"})}
  async function saveShift(){if(!form.role||!form.shift_type||!form.start_local||!form.end_local)return alert("Complete all shift fields.");setSaving(true);try{let saved;if(editing?.id)saved=await api.patch(`/shift-settings/${editing.id}`,form);else saved=await api.post("/shift-settings",form);setShiftSettings(v=>editing?.id?v.map(x=>x.id===editing.id?{...x,...saved}:x):[...v,saved]);setEditing(null)}catch(e){alert(e?.message||"Unable to save shift settings.")}finally{setSaving(false)}}
  async function removeShift(x){if(!confirm(`Delete ${x.role} ${x.shift_type} shift settings?`))return;await api.delete(`/shift-settings/${x.id}`);setShiftSettings(v=>v.filter(y=>y.id!==x.id));}

  if(loading)return <div style={page}><div style={hero}><div style={eyebrow}>FACILITY SETTINGS</div><h1 style={h1}>Operations</h1><div style={muted}>Loading {orgName||"facility"} settings…</div></div><div style={skeleton}/><div style={skeleton}/></div>;
  return <div style={page}>
    <header style={hero}><div><div style={eyebrow}>FACILITY SETTINGS</div><h1 style={h1}>Operations</h1><div style={muted}>{orgName||"Current facility"}{orgCode?` · ${orgCode}`:""} · Scheduling and reporting rules</div></div><button style={secondaryBtn} disabled={refreshing} onClick={()=>load({silent:true})}>{refreshing?"Refreshing…":"Refresh"}</button></header>
    {error&&<div style={errorBox}>{error}<button style={linkBtn} onClick={()=>load({silent:true})}>Try again</button></div>}

    <section style={card}>
      <div style={sectionHead}><div><div style={sectionKicker}>CORE CONFIGURATION</div><h2 style={h2}>Operational Rules</h2><p style={sectionCopy}>These settings drive schedules, PPD calculations, and pay-period views.</p></div><button disabled={saving} onClick={saveOperations} style={primaryBtn}>{saving?"Saving…":"Save changes"}</button></div>
      <div style={grid}>
        <Field title="Facility timezone" hint="Used for facility-local dates and overnight shifts"><select style={input} value={settings.timezone} onChange={e=>setSettings(s=>({...s,timezone:e.target.value}))}>{COMMON_TIMEZONES.map(z=><option key={z}>{z}</option>)}</select></Field>
        <Field title="Meal deduction" hint="Planning deduction, not payroll timecard"><div style={suffixWrap}><input style={{...input,paddingRight:62}} type="number" min="0" max="180" value={settings.lunch_break_minutes} onChange={e=>setSettings(s=>({...s,lunch_break_minutes:e.target.value}))}/><span style={suffix}>min</span></div></Field>
        <Field title="Week starts on"><select style={input} value={settings.week_starts_on} onChange={e=>setSettings(s=>({...s,week_starts_on:e.target.value}))}><option>Sunday</option><option>Monday</option></select></Field>
        <Field title="Pay period length"><div style={suffixWrap}><input style={{...input,paddingRight:62}} type="number" min="7" max="31" value={settings.pay_period_length_days} onChange={e=>setSettings(s=>({...s,pay_period_length_days:e.target.value}))}/><span style={suffix}>days</span></div></Field>
        <Field title="Known pay-period start" hint="Enter the first day of any known pay period. Set once."><input style={input} type="date" value={settings.pay_period_anchor_date||""} onChange={e=>setSettings(s=>({...s,pay_period_anchor_date:e.target.value}))}/></Field>
      </div>
    </section>

    <section style={card}>
      <div style={sectionHead}><div><div style={sectionKicker}>SCHEDULE STRUCTURE</div><h2 style={h2}>Shift Hours</h2><p style={sectionCopy}>Start and end times used for each role and shift type.</p></div><button onClick={beginNew} style={secondaryBtn}>+ Add shift rule</button></div>
      {!shiftSettings.length?<div style={empty}>No shift rules configured yet.</div>:<div style={roleGrid}>{grouped.map(group=><div key={group.role} style={roleCard}><div style={roleTitle}>{group.role}</div>{group.rows.map(x=><div key={x.id} style={shiftRow}><div><b>{x.shift_type}</b><div style={time}>{String(x.start_local||"").slice(0,5)} – {String(x.end_local||"").slice(0,5)}</div></div><div style={rowActions}><button style={smallBtn} onClick={()=>beginEdit(x)}>Edit</button><button style={dangerBtn} onClick={()=>removeShift(x)}>Delete</button></div></div>)}</div>)}</div>}
    </section>

    {editing&&<div style={overlay} onMouseDown={()=>!saving&&setEditing(null)}><div style={dialog} onMouseDown={e=>e.stopPropagation()}><div style={sectionKicker}>{editing.id?"EDIT RULE":"NEW RULE"}</div><h2 style={{...h2,marginBottom:18}}>{editing.id?"Edit Shift Rule":"Add Shift Rule"}</h2><div style={{display:"grid",gap:14}}><Field title="Role"><input style={input} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} placeholder="CNA, LPN, RN…"/></Field><Field title="Shift"><select style={input} value={form.shift_type} onChange={e=>setForm(f=>({...f,shift_type:e.target.value}))}>{SHIFT_TYPES.map(x=><option key={x}>{x}</option>)}</select></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Field title="Start"><input style={input} type="time" value={form.start_local} onChange={e=>setForm(f=>({...f,start_local:e.target.value}))}/></Field><Field title="End"><input style={input} type="time" value={form.end_local} onChange={e=>setForm(f=>({...f,end_local:e.target.value}))}/></Field></div></div><div style={dialogActions}><button style={secondaryBtn} onClick={()=>setEditing(null)}>Cancel</button><button disabled={saving} style={primaryBtn} onClick={saveShift}>{saving?"Saving…":"Save rule"}</button></div></div></div>}
  </div>
}
function Field({title,hint,children}){return <label style={label}><span>{title}</span>{children}{hint&&<span style={hintStyle}>{hint}</span>}</label>}
const page={padding:"clamp(16px,3vw,28px)",color:"var(--text)",maxWidth:1180,margin:"0 auto",boxSizing:"border-box"};
const hero={display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:16,flexWrap:"wrap",marginBottom:22};
const eyebrow={fontSize:11,fontWeight:900,letterSpacing:1.4,opacity:.55};const h1={fontSize:"clamp(28px,4vw,38px)",lineHeight:1.05,margin:"5px 0 7px",letterSpacing:-1};const h2={fontSize:20,margin:"4px 0 5px"};const muted={opacity:.65,fontSize:13};
const card={padding:"clamp(16px,2.5vw,22px)",border:"1px solid var(--border)",borderRadius:18,background:"var(--surface)",marginBottom:18,boxShadow:"0 10px 30px rgba(0,0,0,.06)"};
const sectionHead={display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:18};const sectionKicker={fontSize:10,fontWeight:900,letterSpacing:1.2,opacity:.5};const sectionCopy={margin:0,opacity:.62,fontSize:13};
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,230px),1fr))",gap:14};const label={display:"grid",gap:7,fontWeight:800,fontSize:13};const hintStyle={fontSize:11,fontWeight:500,opacity:.58,lineHeight:1.35};
const input={width:"100%",minHeight:44,padding:"10px 12px",borderRadius:11,border:"1px solid var(--border)",background:"var(--surface)",color:"inherit",boxSizing:"border-box",fontSize:14};
const primaryBtn={minHeight:42,padding:"9px 15px",borderRadius:11,border:"1px solid #2563eb",background:"#2563eb",color:"white",fontWeight:900,cursor:"pointer"};const secondaryBtn={minHeight:42,padding:"9px 14px",borderRadius:11,border:"1px solid var(--border)",background:"var(--surface)",color:"inherit",fontWeight:850,cursor:"pointer"};
const roleGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:12};const roleCard={border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"};const roleTitle={padding:"10px 12px",fontSize:12,fontWeight:900,letterSpacing:.5,background:"rgba(127,127,127,.07)",borderBottom:"1px solid var(--border)"};const shiftRow={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:12,borderBottom:"1px solid var(--border)"};const time={fontSize:12,opacity:.65,marginTop:3};const rowActions={display:"flex",gap:6,flexWrap:"wrap"};const smallBtn={padding:"7px 10px",borderRadius:9,border:"1px solid var(--border)",background:"transparent",color:"inherit",fontWeight:800};const dangerBtn={...smallBtn,color:"#fca5a5"};
const suffixWrap={position:"relative"};const suffix={position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:12,opacity:.55,fontWeight:700};const empty={padding:24,textAlign:"center",border:"1px dashed var(--border)",borderRadius:12,opacity:.6};const errorBox={display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:12,borderRadius:12,border:"1px solid rgba(239,68,68,.35)",background:"rgba(239,68,68,.08)",marginBottom:14,fontSize:13};const linkBtn={border:0,background:"transparent",color:"inherit",fontWeight:900,textDecoration:"underline"};
const overlay={position:"fixed",inset:0,background:"rgba(0,0,0,.68)",display:"grid",placeItems:"center",zIndex:10000,padding:18};const dialog={width:"min(470px,96vw)",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:18,padding:22,color:"var(--text)",boxShadow:"0 24px 80px rgba(0,0,0,.35)",boxSizing:"border-box"};const dialogActions={display:"flex",justifyContent:"flex-end",gap:8,marginTop:20};const skeleton={height:180,borderRadius:18,border:"1px solid var(--border)",background:"var(--surface)",opacity:.55,marginBottom:18};