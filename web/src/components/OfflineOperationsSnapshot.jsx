import { useEffect,useMemo,useState } from "react";
import { getOfflineOperationsSnapshot,isOfflineSnapshotStale } from "../services/offlineCache.js";

async function canReachLiveSite(){try{const c=new AbortController(),t=setTimeout(()=>c.abort(),4000),r=await fetch(`/?connectivity_check=${Date.now()}`,{method:"HEAD",cache:"no-store",signal:c.signal,headers:{"Cache-Control":"no-cache"}});clearTimeout(t);return r.ok}catch{return false}}

export default function OfflineOperationsSnapshot({orgScope,onRetry,retrying}){
  const snapshot=getOfflineOperationsSnapshot(orgScope);
  const[online,setOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine);
  useEffect(()=>{let cancelled=false;const check=async()=>{const x=await canReachLiveSite();if(!cancelled)setOnline(x)},down=()=>setOnline(false);window.addEventListener("online",check);window.addEventListener("offline",down);check();const i=setInterval(check,3000);return()=>{cancelled=true;clearInterval(i);window.removeEventListener("online",check);window.removeEventListener("offline",down)}},[]);
  const staffById=useMemo(()=>Object.fromEntries((snapshot?.staff||[]).map(s=>[String(s.id),s])),[snapshot]);
  const assignmentByShift=useMemo(()=>Object.fromEntries((snapshot?.assignments||[]).filter(a=>a?.shift_id!=null).map(a=>[String(a.shift_id),a])),[snapshot]);
  if(!snapshot)return <div style={{padding:40}}>No saved staffing snapshot exists for this facility. <button onClick={onRetry}>Retry connection</button></div>;
  const date=snapshot.date||snapshot.shifts?.[0]?.shift_date||"Last synchronized day";
  const shifts=(snapshot.shifts||[]).filter(s=>!snapshot.date||s.shift_date===snapshot.date);
  const stale=isOfflineSnapshotStale(snapshot),color=online?"#19b83f":"#e52323";
  return <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}><div style={{padding:18,textAlign:"center",fontWeight:950,background:color,color:"white"}}><div>{online?"CONNECTION RESTORED":"OFFLINE MODE — READ ONLY"}</div><div>{online?"You can return to the live system.":`Staffing last synced ${new Date(snapshot.syncedAt).toLocaleString()}${stale?" • SNAPSHOT OVER 24 HOURS OLD":""}`}</div></div><main style={{maxWidth:900,margin:"0 auto",padding:24}}><h1>Staffing & Assignments</h1><p>{snapshot.orgName||snapshot.orgCode} • {date}</p><button onClick={onRetry} disabled={retrying}>{retrying?"Reconnecting…":online?"Return to live ShiftCensus":"Retry connection"}</button>{online&&<p style={{fontWeight:900,color}}>✓ Internet connection detected. ShiftCensus is back online.</p>}<section style={{marginTop:24,border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}><h2 style={{padding:16}}>Saved Staffing ({shifts.length})</h2>{shifts.length===0?<p style={{padding:16}}>No shifts were saved for this snapshot.</p>:shifts.map(s=>{const w=staffById[String(s.staff_id)]||{},a=assignmentByShift[String(s.id)]||{};return <div key={s.id} style={{display:"grid",gridTemplateColumns:"1.5fr .7fr 1fr 1fr",gap:10,padding:14,borderTop:"1px solid var(--border)"}}><b>{w.name||"Staff member"}</b><span>{w.role||s.role||"—"}</span><span>{a.unit||"Unassigned"}</span><span>{s.shift_type||s.start_local||"—"}</span></div>})}</section></main></div>;
}
