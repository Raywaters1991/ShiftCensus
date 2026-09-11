import { useEffect, useMemo, useState } from "react";
import { getOfflineSnapshot, getOfflineOperationsSnapshot, isOfflineSnapshotStale } from "../services/offlineCache.js";

function fmt(iso) {
  const d = new Date(iso || "");
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
}

function localYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DowntimeDashboard({ error, onRetry, retrying, onCensus, onOperations }) {
  const census = getOfflineSnapshot();
  const ops = getOfflineOperationsSnapshot();
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

  const stats = useMemo(() => {
    const rows = census?.censusRows || [];
    const occupied = rows.filter(r => String(r.status).toLowerCase() === "occupied").length;
    const leave = rows.filter(r => ["leave", "on leave", "on_leave"].includes(String(r.status).toLowerCase())).length;
    const empty = rows.filter(r => String(r.status).toLowerCase() === "empty").length;
    return { occupied, leave, empty, total: rows.length };
  }, [census]);

  const today = localYmd();
  const scheduled = (ops?.shifts || []).filter(s => s.shift_date === today).length;
  const syncTimes = [census?.syncedAt, ops?.syncedAt].filter(Boolean).sort();
  const lastSynced = syncTimes.length ? syncTimes[syncTimes.length - 1] : null;
  const stale = (census && isOfflineSnapshotStale(census)) || (ops && isOfflineSnapshotStale(ops));

  const statusColor = online ? "#19b83f" : "#e52323";
  const statusDark = online ? "#0b6f26" : "#9f1111";

  return <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
    <div style={{width:"min(720px,100%)",margin:"0 auto",padding:"18px 24px 12px",display:"flex",alignItems:"center",gap:12}}>
      <div style={{fontSize:24,fontWeight:950}}>ShiftCensus</div>
      <div style={{flex:1}}/>
      <div aria-label={online?"Connection restored":"Downtime active"} title={online?"Connection restored":"Downtime active"} style={{width:52,height:52,borderRadius:"50%",display:"grid",placeItems:"center",background:statusColor,border:`4px solid ${statusDark}`,boxShadow:`0 0 0 3px ${online?"rgba(25,184,63,.18)":"rgba(229,35,35,.18)"}`,fontSize:28,lineHeight:1}}>
        🔨
      </div>
    </div>

    <div style={{background:statusColor,color:"white",padding:"16px 20px",textAlign:"center",fontWeight:950,fontSize:18}}>
      {online ? "CONNECTION RESTORED" : "DOWNTIME MODE — READ ONLY"}
      <div style={{fontSize:14,marginTop:4,opacity:.98}}>{online ? "You can return to the live system." : `Last synchronized: ${fmt(lastSynced)}`}</div>
    </div>

    <main style={{width:"min(720px,100%)",margin:"0 auto",padding:24}}>
      <div style={{fontSize:24,fontWeight:950,margin:"2px 0 18px"}}>{census?.orgName || ops?.orgName || "ShiftCensus facility"}</div>

      <div style={{padding:16,borderRadius:14,border:`1px solid ${online?"rgba(25,184,63,.55)":"rgba(229,35,35,.55)"}`,marginBottom:18,display:"flex",gap:12,alignItems:"flex-start",background:"var(--surface)"}}>
        <div style={{width:32,height:32,borderRadius:"50%",display:"grid",placeItems:"center",background:statusColor,color:"white",fontWeight:950,flex:"0 0 auto"}}>{online?"✓":"!"}</div>
        <div>
          <div style={{fontWeight:950,fontSize:18}}>{online?"Internet connection detected":"You’re offline"}</div>
          <div style={{opacity:.78,lineHeight:1.45,marginTop:4}}>{online?"ShiftCensus is back online and ready to use.":"This device does not currently have an internet connection. Saved information remains available in read-only mode."}</div>
        </div>
      </div>

      {stale && <div style={{padding:14,borderRadius:12,border:"1px solid #a66",marginBottom:16,fontWeight:800}}>Warning: one or more saved snapshots are over 24 hours old. Verify information using your facility downtime procedure.</div>}
      {error?.message && <div style={{fontSize:13,opacity:.62,marginBottom:18}}>Connection detail: {error.message}</div>}

      {census && <section style={{border:"1px solid var(--border)",borderRadius:16,padding:18,marginBottom:16,background:"var(--surface)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><h2 style={{margin:0}}>Census</h2><button onClick={onCensus} style={btn}>View Census</button></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginTop:16}}>
          <Stat label="Occupied" value={stats.occupied}/><Stat label="Leave" value={stats.leave}/><Stat label="Empty" value={stats.empty}/><Stat label="Total" value={stats.total}/>
        </div>
        <div style={{fontSize:12,opacity:.65,marginTop:12}}>Census synced {fmt(census.syncedAt)}</div>
      </section>}

      {ops && <section style={{border:"1px solid var(--border)",borderRadius:16,padding:18,marginBottom:16,background:"var(--surface)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div><h2 style={{margin:0}}>Staffing & Assignments</h2><div style={{opacity:.7,marginTop:5}}>{scheduled} staff shift{scheduled===1?"":"s"} scheduled today</div></div>
          <button onClick={onOperations} style={btn}>View Staffing</button>
        </div>
        <div style={{fontSize:12,opacity:.65,marginTop:12}}>Staffing synced {fmt(ops.syncedAt)}</div>
      </section>}

      {!census && !ops && <div style={{padding:18,border:"1px solid var(--border)",borderRadius:14,marginBottom:16}}>No saved facility snapshots are available on this device yet.</div>}
      <button onClick={onRetry} disabled={retrying} style={{...btn,width:"100%",padding:15,background:"#2789ef",color:"white",border:0}}>{retrying?"Reconnecting…":online?"Return to live ShiftCensus":"Retry connection"}</button>
      <p style={{fontSize:13,opacity:.65,lineHeight:1.5}}>Saved information is read only. Do not make clinical or staffing changes from this screen. When service returns, reconnect to ShiftCensus before entering updates.</p>
    </main>
  </div>;
}

const btn={border:"1px solid var(--border)",borderRadius:12,padding:"11px 16px",fontWeight:900,background:"var(--surface-glass)",color:"inherit"};
function Stat({label,value}){return <div style={{border:"1px solid var(--border)",borderRadius:12,padding:"12px 8px",textAlign:"center"}}><div style={{fontSize:11,fontWeight:900,opacity:.65,textTransform:"uppercase"}}>{label}</div><div style={{fontSize:25,fontWeight:950,marginTop:4}}>{value}</div></div>}
