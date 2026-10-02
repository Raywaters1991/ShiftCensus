import {useEffect,useMemo,useState} from "react";
import ScheduleMatrixPage from "./ScheduleMatrixPage.jsx";
import api from "../services/api";
import {useUser} from "../contexts/UserContext.jsx";

const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function startOfWeek(date){const d=new Date(date),day=d.getDay();d.setHours(0,0,0,0);d.setDate(d.getDate()-(day===0?6:day-1));return d}
function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function fmtDate(v){return new Date(`${v}T00:00:00`).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}
function fmtTime(v){if(!v)return"";const[h,m]=String(v).slice(0,5).split(":").map(Number),ap=h>=12?"PM":"AM",hh=h%12||12;return `${hh}:${String(m).padStart(2,"0")} ${ap}`}

export default function ScheduleWorkspacePage(){
  const{permissions,isSuperadmin,role}=useUser();
  const canWrite=!!isSuperadmin||String(role||"").toLowerCase()==="superadmin"||!!permissions?.can_schedule_write;
  const monday=useMemo(()=>startOfWeek(new Date()),[]);
  const[from,setFrom]=useState(()=>ymd(monday));
  const[to,setTo]=useState(()=>ymd(addDays(monday,6)));
  const[openShifts,setOpenShifts]=useState([]);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");\n  const[publication,setPublication]=useState({draft_count:0,published_count:0,has_drafts:false});
  

  async function loadOpen(){if(!canWrite||!from||!to)return;try{const bundle=await api.getScheduleView(from,to);const rows=Array.isArray(bundle?.shifts)?bundle.shifts:[];setOpenShifts(rows.filter(x=>x.staff_id==null));setPublication(bundle?.publication||{draft_count:0,published_count:0,has_drafts:false})}catch{setOpenShifts([])}}
  useEffect(()=>{loadOpen()},[from,to,canWrite]);

  async function publish(){
    if(!from||!to||from>to)return alert("Choose a valid publish range.");
    const open=openShifts.length;
    if(!window.confirm(`Publish ${fmtDate(from)} through ${fmtDate(to)}?${open?`\n\n${open} open/available shift${open===1?"":"s"} will be included in the employee notification.`:""}`))return;
    setBusy(true);setMessage("");
    try{const r=await api.post("/schedule-workflow/publish",{from,to});setMessage(`Published. ${r?.notified||0} employee${r?.notified===1?"":"s"} notified${r?.open_shift_count?` · ${r.open_shift_count} open shift${r.open_shift_count===1?"":"s"}`:""}.`);await loadOpen()}
    catch(e){alert(e?.message||"Unable to publish schedule")}
    finally{setBusy(false)}
  }

  async function setIncentive(shift,enabled){setBusy(true);try{await api.patch(`/schedule-workflow/shifts/${shift.id}/bonus`,{enabled});await loadOpen()}catch(e){alert(e?.message||"Unable to update incentive")}finally{setBusy(false)}}

  return <>
    {canWrite&&<section style={s.panel}>
      <div style={s.top}>
        <div><div style={s.eyebrow}>SCHEDULE WORKFLOW</div><h2 style={s.h2}>Draft & Publish</h2><div style={s.sub}>Build and edit the schedule privately. Employees see shifts only after you publish them.</div><div style={s.statusRow}><span style={publication.has_drafts?s.draftBadge:s.publishedBadge}>{publication.has_drafts?`${publication.draft_count} Draft`:"No Draft Changes"}</span><span style={s.publishedBadge}>{publication.published_count} Published</span></div></div>
        <div style={s.range}><label style={s.label}>From<input style={s.input} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label style={s.label}>To<input style={s.input} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button style={s.publish} disabled={busy} onClick={publish}>{busy?"Working…":publication.has_drafts?"Publish Schedule":"Republish Schedule"}</button></div>
      </div>
      {message&&<div style={s.success}>✓ {message}</div>}
      <div style={s.openHead}><b>Open / Available Shifts in Publish Range</b><span>{openShifts.length}</span></div>
      {openShifts.length===0?<div style={s.empty}>No open shifts in this range.</div>:<div style={s.openGrid}>{openShifts.map(sh=><div key={sh.id} style={{...s.openCard,...(sh.bonus_enabled?s.bonusCard:{})}}><div><b>{fmtDate(sh.shift_date)} · {sh.role} {sh.shift_type}</b><div style={s.shiftMeta}>{fmtTime(sh.start_local)}–{fmtTime(sh.end_local)}{sh.open_reason?` · ${String(sh.open_reason).replaceAll("_"," ")}`:""}</div>{sh.bonus_enabled&&<div style={s.bonusBadge}>⭐ INCENTIVE AVAILABLE</div>}</div><button disabled={busy} style={sh.bonus_enabled?s.bonusButtonActive:s.bonusButton} onClick={()=>setIncentive(sh,!sh.bonus_enabled)}>{sh.bonus_enabled?"Remove Incentive":"+ Incentive"}</button></div>)}</div>}
    </section>}
    <ScheduleMatrixPage/>
  </>
}

const s={panel:{margin:"18px auto 0",maxWidth:1700,padding:"18px 28px",boxSizing:"border-box"},top:{display:"flex",justifyContent:"space-between",alignItems:"end",gap:18,flexWrap:"wrap",padding:18,border:"1px solid #1d4ed8",borderRadius:16,background:"linear-gradient(135deg,rgba(3,26,66,.96),rgba(8,24,48,.9))"},eyebrow:{fontSize:11,fontWeight:900,letterSpacing:1.3,color:"#60a5fa"},h2:{margin:"4px 0 4px",fontSize:22},sub:{opacity:.68,maxWidth:680},range:{display:"flex",alignItems:"end",gap:8,flexWrap:"wrap"},label:{display:"grid",gap:5,fontSize:12,fontWeight:900},input:{background:"var(--card-bg)",color:"inherit",border:"1px solid var(--border)",borderRadius:10,padding:"10px 11px",minWidth:150},publish:{background:"#2563eb",color:"white",border:"1px solid #60a5fa",borderRadius:10,padding:"10px 15px",fontWeight:900},success:{marginTop:10,padding:"10px 12px",borderRadius:10,border:"1px solid #22c55e",background:"rgba(34,197,94,.10)",color:"#86efac",fontWeight:800},openHead:{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"14px 2px 8px"},openGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:8},openCard:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:12,border:"1px solid var(--border)",borderRadius:12,background:"var(--surface)"},bonusCard:{border:"1px solid #f59e0b",background:"rgba(245,158,11,.08)"},shiftMeta:{fontSize:12,opacity:.65,marginTop:3,textTransform:"capitalize"},bonusBadge:{display:"inline-block",marginTop:6,padding:"3px 7px",borderRadius:999,background:"#78350f",border:"1px solid #f59e0b",color:"#fde68a",fontSize:11,fontWeight:900},bonusButton:{padding:"8px 10px",borderRadius:9,border:"1px solid #f59e0b",background:"transparent",color:"#fbbf24",fontWeight:900,whiteSpace:"nowrap"},bonusButtonActive:{padding:"8px 10px",borderRadius:9,border:"1px solid #f59e0b",background:"#78350f",color:"#fde68a",fontWeight:900,whiteSpace:"nowrap"},statusRow:{display:"flex",gap:8,flexWrap:"wrap",marginTop:10},draftBadge:{padding:"4px 8px",borderRadius:999,border:"1px solid #f59e0b",color:"#fde68a",background:"rgba(245,158,11,.12)",fontSize:11,fontWeight:900},publishedBadge:{padding:"4px 8px",borderRadius:999,border:"1px solid #22c55e",color:"#bbf7d0",background:"rgba(34,197,94,.10)",fontSize:11,fontWeight:900},empty:{padding:12,border:"1px dashed var(--border)",borderRadius:10,opacity:.6},overlay:{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:18},modal:{width:"min(500px,94vw)",boxSizing:"border-box",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:16,padding:22},actions:{display:"flex",gap:8,alignItems:"center",marginTop:18},remove:{background:"#7f1d1d",color:"#fee2e2",border:"1px solid #ef4444",borderRadius:10,padding:"10px 13px",fontWeight:900},cancel:{background:"transparent",color:"inherit",border:"1px solid var(--border)",borderRadius:10,padding:"10px 13px",fontWeight:800}};
