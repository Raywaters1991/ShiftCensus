import {useEffect,useMemo,useState} from "react";
import ScheduleMatrixPage from "./ScheduleMatrixPage.jsx";
import api from "../services/api";
import {useUser} from "../contexts/UserContext.jsx";

const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function monthStart(date){return new Date(date.getFullYear(),date.getMonth(),1)}
function monthEnd(date){return new Date(date.getFullYear(),date.getMonth()+1,0)}
function fmtDate(v){return new Date(`${v}T00:00:00`).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}
function fmtTime(v){if(!v)return"";const[h,m]=String(v).slice(0,5).split(":").map(Number),ap=h>=12?"PM":"AM",hh=h%12||12;return `${hh}:${String(m).padStart(2,"0")} ${ap}`}

export default function ScheduleWorkspacePage(){
  const{permissions,isSuperadmin,role}=useUser();
  const canWrite=!!isSuperadmin||String(role||"").toLowerCase()==="superadmin"||!!permissions?.can_schedule_write;
  const initialMonth=useMemo(()=>monthStart(new Date()),[]);
  const[month,setMonth]=useState(()=>initialMonth.getFullYear()+"-"+pad(initialMonth.getMonth()+1));
  const monthDate=useMemo(()=>{const[y,m]=month.split("-").map(Number);return new Date(y,m-1,1)},[month]);
  const from=ymd(monthStart(monthDate));
  const to=ymd(monthEnd(monthDate));
  const monthLabel=monthDate.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const[openShifts,setOpenShifts]=useState([]);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");
  const[publication,setPublication]=useState({status:"draft",published_at:null});
  

  async function loadOpen(){if(!canWrite||!from||!to)return;try{const bundle=await api.getScheduleView(from,to);const rows=Array.isArray(bundle?.shifts)?bundle.shifts:[];setOpenShifts(rows.filter(x=>x.staff_id==null));setPublication(bundle?.publication||{status:"draft",published_at:null})}catch{setOpenShifts([])}}
  useEffect(()=>{loadOpen()},[from,to,canWrite]);

  async function publish(){
    if(!from||!to)return;
    const open=openShifts.length;
    if(!window.confirm(`Publish the ${monthLabel} schedule?${open?`

${open} open/available shift${open===1?"":"s"} will be included in the employee notification.`:""}`))return;
    setBusy(true);setMessage("");
    try{const r=await api.post("/schedule-workflow/publish",{from,to});setMessage(`${monthLabel} published. ${r?.notified||0} employee${r?.notified===1?"":"s"} notified${r?.open_shift_count?` · ${r.open_shift_count} open shift${r.open_shift_count===1?"":"s"}`:""}.`);await loadOpen()}
    catch(e){alert(e?.message||"Unable to publish schedule")}
    finally{setBusy(false)}
  }

  async function setIncentive(shift,enabled){setBusy(true);try{await api.patch(`/schedule-workflow/shifts/${shift.id}/bonus`,{enabled});await loadOpen()}catch(e){alert(e?.message||"Unable to update incentive")}finally{setBusy(false)}}

  const incentiveCount=openShifts.filter(x=>x.bonus_enabled).length;
  const isPublished=publication.status==="published";
  const publishedText=publication.published_at?new Date(publication.published_at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
  return <>
    {canWrite&&<section style={s.panel}>
      <div style={s.workspaceBar}>
        <div style={s.brandBlock}>
          <div style={s.eyebrow}>MONTHLY SCHEDULE</div>
          <div style={s.publishTitle}>{monthLabel}</div>
          <div style={s.statusRow}><span style={isPublished?s.publishedBadge:s.draftBadge}>{isPublished?"PUBLISHED":"DRAFT"}</span>{isPublished&&publishedText&&<span style={s.publishedMeta}>Published {publishedText}</span>}</div>
        </div>
        <div style={s.range}>
          <label style={s.label}>Schedule Month<input style={s.input} type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
          {!isPublished&&<><button style={s.toolButton} disabled={busy} onClick={applyTemplates}>Apply Templates</button><button style={s.toolButton} disabled={busy} onClick={copyPrevious}>Copy Previous Month</button></>}
          <button style={s.toolButton} onClick={()=>window.location.assign("/schedule")}>Manage Templates</button>
          <button style={s.publish} disabled={busy||isPublished} onClick={publish}>{busy?"Publishing…":isPublished?"✓ Published":"Publish "+monthLabel+" Schedule"}</button>
        </div>
      </div>
      {message&&<div style={s.success}>✓ {message}</div>}
      <div style={openShifts.length?s.openAlert:s.openAlertQuiet}>
        <div style={s.openSummary}><b>{openShifts.length?"⚠": "✓"} {openShifts.length} Open Shift{openShifts.length===1?"":"s"}</b>{incentiveCount>0&&<span style={s.incentivePill}>★ {incentiveCount} Incentive{incentiveCount===1?"":"s"}</span>}</div>
        <button style={s.viewOpen} onClick={()=>document.getElementById("schedule-open-shifts")?.scrollIntoView({behavior:"smooth",block:"start"})}>View Open Shifts →</button>
      </div>
      {openShifts.length>0&&<details id="schedule-open-shifts" style={s.openDetails}><summary style={s.openDetailsSummary}>Open shift details</summary><div style={s.openGrid}>{openShifts.map(sh=><div key={sh.id} style={{...s.openCard,...(sh.bonus_enabled?s.bonusCard:{})}}><div><b>{fmtDate(sh.shift_date)} · {sh.role} {sh.shift_type}</b><div style={s.shiftMeta}>{fmtTime(sh.start_local)}–{fmtTime(sh.end_local)}{sh.open_reason?` · ${String(sh.open_reason).replaceAll("_"," ")}`:""}</div>{sh.bonus_enabled&&<div style={s.bonusBadge}>⭐ INCENTIVE AVAILABLE</div>}</div><button disabled={busy} style={sh.bonus_enabled?s.bonusButtonActive:s.bonusButton} onClick={()=>setIncentive(sh,!sh.bonus_enabled)}>{sh.bonus_enabled?"Remove Incentive":"+ Incentive"}</button></div>)}</div></details>}
    </section>}
    <ScheduleMatrixPage/>
  </>
}

const s={panel:{margin:"12px auto 0",maxWidth:1700,padding:"10px 28px 0",boxSizing:"border-box"},workspaceBar:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,flexWrap:"wrap",padding:"12px 14px",border:"1px solid #1d4ed8",borderRadius:14,background:"linear-gradient(135deg,rgba(3,26,66,.96),rgba(8,24,48,.9))"},brandBlock:{display:"grid",gap:4},eyebrow:{fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#60a5fa"},publishTitle:{fontSize:19,fontWeight:900},range:{display:"flex",alignItems:"end",gap:8,flexWrap:"wrap"},label:{display:"grid",gap:4,fontSize:11,fontWeight:900},input:{background:"var(--card-bg)",color:"inherit",border:"1px solid var(--border)",borderRadius:9,padding:"8px 10px",minWidth:145},arrow:{opacity:.55,paddingBottom:9,fontWeight:900},toolButton:{background:"var(--surface)",color:"inherit",border:"1px solid var(--border)",borderRadius:9,padding:"9px 11px",fontWeight:900},publish:{background:"#2563eb",color:"white",border:"1px solid #60a5fa",borderRadius:9,padding:"9px 16px",fontWeight:900},success:{marginTop:8,padding:"8px 11px",borderRadius:9,border:"1px solid #22c55e",background:"rgba(34,197,94,.10)",color:"#86efac",fontWeight:800,fontSize:13},statusRow:{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"},publishedMeta:{fontSize:10,opacity:.65,fontWeight:800},draftBadge:{padding:"3px 8px",borderRadius:999,border:"1px solid #f59e0b",color:"#fde68a",background:"rgba(245,158,11,.12)",fontSize:10,fontWeight:900},publishedBadge:{padding:"3px 8px",borderRadius:999,border:"1px solid #22c55e",color:"#bbf7d0",background:"rgba(34,197,94,.10)",fontSize:10,fontWeight:900},openAlert:{marginTop:8,padding:"9px 12px",borderRadius:11,border:"1px solid #b45309",background:"linear-gradient(90deg,rgba(120,53,15,.20),rgba(17,24,39,.4))",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12},openAlertQuiet:{marginTop:8,padding:"8px 12px",borderRadius:11,border:"1px solid var(--border)",background:"var(--surface)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,opacity:.8},openSummary:{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"},incentivePill:{padding:"4px 9px",borderRadius:999,background:"rgba(245,158,11,.15)",border:"1px solid #b45309",color:"#fde68a",fontSize:11,fontWeight:900},viewOpen:{background:"transparent",color:"inherit",border:"1px solid var(--border)",borderRadius:9,padding:"7px 10px",fontWeight:900},openDetails:{marginTop:7,border:"1px solid var(--border)",borderRadius:10,padding:"8px 10px"},openDetailsSummary:{cursor:"pointer",fontWeight:900,fontSize:12},openGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:8,marginTop:8},openCard:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:10,border:"1px solid var(--border)",borderRadius:10,background:"var(--surface)"},bonusCard:{border:"1px solid #f59e0b",background:"rgba(245,158,11,.08)"},shiftMeta:{fontSize:11,opacity:.65,marginTop:2,textTransform:"capitalize"},bonusBadge:{display:"inline-block",marginTop:5,padding:"2px 6px",borderRadius:999,background:"#78350f",border:"1px solid #f59e0b",color:"#fde68a",fontSize:10,fontWeight:900},bonusButton:{padding:"7px 9px",borderRadius:8,border:"1px solid #f59e0b",background:"transparent",color:"#fbbf24",fontWeight:900,whiteSpace:"nowrap"},bonusButtonActive:{padding:"7px 9px",borderRadius:8,border:"1px solid #f59e0b",background:"#78350f",color:"#fde68a",fontWeight:900,whiteSpace:"nowrap"}};
