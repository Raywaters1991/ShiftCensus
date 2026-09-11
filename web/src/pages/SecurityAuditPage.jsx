import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

function fmtTime(v) {
  const d = new Date(v || "");
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function outcome(row) {
  return Number(row?.status_code || 0) >= 400 ? "Denied / Failed" : "Completed";
}

export default function SecurityAuditPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [method, setMethod] = useState("all");

  const suspicious = useMemo(() => rows.filter(r => Number(r.status_code || 0) === 401 || Number(r.status_code || 0) === 403).length, [rows]);
  const failed = useMemo(() => rows.filter(r => Number(r.status_code || 0) >= 400).length, [rows]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ limit: "250" });
      if (orgCode.trim()) qs.set("org_code", orgCode.trim());
      if (filterOutcome !== "all") qs.set("outcome", filterOutcome);
      if (method !== "all") qs.set("method", method);
      const data = await api.get(`/security-audit?${qs.toString()}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(e?.message || "Unable to load audit log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return <div style={{padding:24,maxWidth:1300,margin:"0 auto",color:"var(--text)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div><h1 style={{marginBottom:4}}>Security Audit Log</h1><div style={{opacity:.7}}>Developer / Super Admin only</div></div>
      <button onClick={load} disabled={loading} style={btn}>{loading?"Refreshing…":"Refresh"}</button>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,margin:"20px 0"}}>
      <Stat label="Loaded events" value={rows.length}/><Stat label="Failed / denied" value={failed}/><Stat label="401 / 403" value={suspicious}/>
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
      <input value={orgCode} onChange={e=>setOrgCode(e.target.value)} placeholder="Filter org code" style={input}/>
      <select value={filterOutcome} onChange={e=>setFilterOutcome(e.target.value)} style={input}><option value="all">All outcomes</option><option value="success">Completed</option><option value="failed">Denied / failed</option></select>
      <select value={method} onChange={e=>setMethod(e.target.value)} style={input}><option value="all">All methods</option>{["POST","PUT","PATCH","DELETE"].map(x=><option key={x}>{x}</option>)}</select>
      <button onClick={load} style={btn}>Apply filters</button>
    </div>

    {error && <div style={{padding:14,border:"1px solid #a33",borderRadius:12,marginBottom:16}}>{error}</div>}

    <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:14,background:"var(--surface)"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:1050}}>
        <thead><tr>{["Time","Facility","Actor","Role","Action","Status","IP","Duration"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {!loading && rows.length===0 && <tr><td colSpan={8} style={{padding:18,opacity:.7}}>No audit events match these filters.</td></tr>}
          {rows.map(r=><tr key={r.id}>
            <td style={td}>{fmtTime(r.created_at)}</td>
            <td style={td}>{r.org_code||"—"}</td>
            <td style={td}><div>{r.actor_email||"Unauthenticated"}</div><div style={{fontSize:11,opacity:.55}}>{r.actor_user_id||"—"}</div></td>
            <td style={td}>{r.actor_role||"—"}</td>
            <td style={td}><b>{r.method}</b> {r.path}</td>
            <td style={{...td,fontWeight:900,color:Number(r.status_code)>=400?"#ef4444":"#22c55e"}}>{r.status_code} · {outcome(r)}</td>
            <td style={td}>{r.ip_address||"—"}</td>
            <td style={td}>{Number.isFinite(Number(r.duration_ms))?`${r.duration_ms} ms`:"—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <p style={{fontSize:12,opacity:.6,lineHeight:1.5,marginTop:14}}>This view intentionally excludes request bodies, passwords, authentication tokens, resident names, and free-text PHI. Repeated 401/403 events can indicate bad credentials, blocked permissions, or attempted unauthorized access.</p>
  </div>;
}

const btn={padding:"11px 14px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-glass)",color:"inherit",fontWeight:900};
const input={padding:"10px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface)",color:"inherit"};
const th={textAlign:"left",padding:11,borderBottom:"1px solid var(--border)",fontSize:12,textTransform:"uppercase",opacity:.7};
const td={padding:11,borderBottom:"1px solid var(--border)",fontSize:13,verticalAlign:"top"};
function Stat({label,value}){return <div style={{border:"1px solid var(--border)",borderRadius:14,padding:14,background:"var(--surface)"}}><div style={{fontSize:11,opacity:.65,fontWeight:900,textTransform:"uppercase"}}>{label}</div><div style={{fontSize:28,fontWeight:950,marginTop:4}}>{value}</div></div>}
