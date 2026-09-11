import { useEffect, useState } from "react";
import { getOfflineOperationsSnapshot, isOfflineSnapshotStale } from "../services/offlineCache.js";

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function OfflineOperationsSnapshot({ onRetry, retrying }) {
  const snapshot = getOfflineOperationsSnapshot();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (!snapshot) return null;
  const staffById = Object.fromEntries((snapshot.staff || []).map(s => [String(s.id), s]));
  const today = todayYmd();
  const todaysShifts = (snapshot.shifts || []).filter(s => s.shift_date === today).sort((a,b) => String(a.start_local||"").localeCompare(String(b.start_local||"")));
  const stale = isOfflineSnapshotStale(snapshot);
  const statusColor = online ? "#19b83f" : "#e52323";

  return <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",paddingBottom:40}}>
    <div style={{padding:"18px 20px",textAlign:"center",fontWeight:950,background:statusColor,color:"white"}}>
      <div>{online ? "CONNECTION RESTORED" : "OFFLINE MODE — READ ONLY"}</div>
      <div style={{fontSize:14,marginTop:4,opacity:.98}}>
        {online
          ? "You can return to the live system."
          : `Staffing last synced ${new Date(snapshot.syncedAt).toLocaleString()}${stale ? " • SNAPSHOT OVER 24 HOURS OLD" : ""}`}
      </div>
    </div>
    <main style={{maxWidth:900,margin:"0 auto",padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div><h1 style={{marginBottom:4}}>Staffing & Assignments</h1><div style={{opacity:.7}}>{snapshot.orgName || snapshot.orgCode || "Facility"} • {today}</div></div>
        <button onClick={onRetry} disabled={retrying} style={{padding:"12px 18px",borderRadius:12,border:0,fontWeight:900}}>{retrying?"Reconnecting…":online?"Return to live ShiftCensus":"Retry connection"}</button>
      </div>
      {online && <div style={{marginTop:18,padding:14,borderRadius:12,border:"1px solid rgba(25,184,63,.55)",fontWeight:800}}>Internet connection detected. ShiftCensus is back online and ready to use.</div>}
      <section style={{marginTop:24,border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
        <div style={{padding:16,fontWeight:950,fontSize:20,borderBottom:"1px solid var(--border)"}}>Today’s Staffing ({todaysShifts.length})</div>
        {todaysShifts.length===0?<div style={{padding:18,opacity:.7}}>No shifts were saved for today.</div>:todaysShifts.map(s=>{const worker=staffById[String(s.staff_id)]||{};return <div key={s.id} style={{display:"grid",gridTemplateColumns:"1.5fr .7fr 1fr 1fr",gap:10,padding:14,borderBottom:"1px solid var(--border)"}}><b>{worker.name||"Staff member"}</b><span>{worker.role||s.role||"—"}</span><span>{s.unit||"—"}</span><span>{s.assignment_number?`Assignment ${s.assignment_number}`:(s.shiftType||s.start_local||"—")}</span></div>})}
      </section>
      <section style={{marginTop:20,border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
        <div style={{padding:16,fontWeight:950,fontSize:20,borderBottom:"1px solid var(--border)"}}>Assignment Definitions</div>
        {(snapshot.assignments||[]).length===0?<div style={{padding:18,opacity:.7}}>No assignment definitions were saved.</div>:(snapshot.assignments||[]).map((a,i)=><div key={a.id??i} style={{display:"flex",gap:16,padding:14,borderBottom:"1px solid var(--border)"}}><b>{a.unit||"Unit"}</b><span>{a.assignment_number?`Assignment ${a.assignment_number}`:"Assignment"}</span>{a.name&&<span>{a.name}</span>}</div>)}
      </section>
    </main>
  </div>;
}
