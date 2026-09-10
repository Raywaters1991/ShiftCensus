import { getOfflineSnapshot, isOfflineSnapshotStale } from "../services/offlineCache.js";

function normStatus(s){const v=String(s||"empty").toLowerCase();return ["occupied","leave","empty"].includes(v)?v:"empty";}
function roomLabel(r){const room=String(r.room_number ?? r.room ?? "").trim();const bed=String(r.bed??"").trim().toUpperCase();return `${room}${bed}`||"—";}
function fmt(v){return v?String(v):"—";}
function fmtTime(iso){try{return new Date(iso).toLocaleString();}catch{return "Unknown";}}

export default function OfflineCensusSnapshot({onRetry,retrying}){
  const snapshot=getOfflineSnapshot();
  if(!snapshot){
    return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"var(--bg)",color:"var(--text)"}}><div style={{width:"min(620px,100%)",padding:28,border:"1px solid var(--border)",borderRadius:18,background:"var(--surface)"}}><div style={{fontSize:26,fontWeight:950}}>ShiftCensus Offline</div><p style={{lineHeight:1.55,opacity:.8}}>This device does not have a saved facility snapshot yet. Connect to ShiftCensus successfully at least once on this device to create an offline copy.</p><button onClick={onRetry} disabled={retrying} style={{padding:"12px 16px",borderRadius:12,border:0,fontWeight:900}}>{retrying?"Retrying…":"Retry connection"}</button></div></div>;
  }

  const rows=snapshot.censusRows||[];
  const occupied=rows.filter(r=>normStatus(r.status)==="occupied").length;
  const leave=rows.filter(r=>normStatus(r.status)==="leave").length;
  const empty=rows.filter(r=>normStatus(r.status)==="empty").length;
  const stale=isOfflineSnapshotStale(snapshot);

  return <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",paddingBottom:40}}>
    <div style={{position:"sticky",top:0,zIndex:20,padding:"12px 16px",background:stale?"#7c2d12":"#78350f",color:"white",fontWeight:900,textAlign:"center"}}>OFFLINE MODE — READ ONLY • Last synced {fmtTime(snapshot.syncedAt)}{stale?" • SNAPSHOT OVER 24 HOURS OLD":""}</div>
    <main style={{width:"min(1100px,94vw)",margin:"24px auto"}}>
      <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}><div><div style={{fontSize:30,fontWeight:950}}>Census Snapshot</div><div style={{opacity:.7,marginTop:4}}>{snapshot.orgName||snapshot.orgCode||"Facility"}</div></div><button onClick={onRetry} disabled={retrying} style={{padding:"12px 16px",borderRadius:12,border:"1px solid var(--border)",fontWeight:900}}>{retrying?"Retrying…":"Retry connection"}</button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,margin:"20px 0"}}>{[["Occupied",occupied],["Leave",leave],["Empty",empty],["Total",rows.length]].map(([k,v])=><div key={k} style={{padding:16,border:"1px solid var(--border)",borderRadius:14,background:"var(--surface)"}}><div style={{fontSize:12,opacity:.65,fontWeight:800,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:28,fontWeight:950,marginTop:4}}>{v}</div></div>)}</div>
      <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:14,background:"var(--surface)"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:720}}><thead><tr>{["Bed","Status","Payer","Care Type","Gender","Admit","Expected DC"].map(h=><th key={h} style={{textAlign:"left",padding:12,borderBottom:"1px solid var(--border)",fontSize:12,textTransform:"uppercase",opacity:.7}}>{h}</th>)}</tr></thead><tbody>{rows.slice().sort((a,b)=>roomLabel(a).localeCompare(roomLabel(b),undefined,{numeric:true})).map(r=><tr key={r.id||roomLabel(r)}>{[roomLabel(r),normStatus(r.status)==="leave"?"On Leave":normStatus(r.status)==="occupied"?"Occupied":"Empty",fmt(r.payer_source),fmt(r.care_type),fmt(r.patient_gender),fmt(r.admit_date?String(r.admit_date).slice(0,10):null),fmt(r.expected_discharge?String(r.expected_discharge).slice(0,10):null)].map((v,i)=><td key={i} style={{padding:12,borderBottom:"1px solid var(--border)",opacity:normStatus(r.status)==="empty"?.55:1}}>{v}</td>)}</tr>)}</tbody></table></div>
      <div style={{marginTop:14,fontSize:12,opacity:.6,lineHeight:1.5}}>For safety, this offline snapshot intentionally excludes resident names/labels and free-text notes. Changes are disabled until ShiftCensus reconnects.</div>
    </main>
  </div>;
}
