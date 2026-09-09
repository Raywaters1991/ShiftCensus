import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext.jsx";
import CensusPage from "./CensusPage.jsx";

const PAYER_OPTIONS = ["VA", "Medicare", "Medicaid", "Private Pay"];
const CARE_OPTIONS = ["Long Term", "Skilled", "Hospice", "Respite"];
const GENDER_OPTIONS = ["Female", "Male", "Unknown", "Other"];
const normStatus = (s) => ["occupied", "leave", "empty"].includes(String(s || "").toLowerCase()) ? String(s).toLowerCase() : "empty";
const roomNo = (r) => String(r.room_number ?? String(r.room || "").match(/\d+/)?.[0] ?? r.room ?? "").trim();
const bedKey = (r) => `${roomNo(r)}${String(r.bed || "").trim().toUpperCase()}`;
const allowsDc = (c) => ["skilled", "respite"].includes(String(c || "").toLowerCase());

const overlay = { position:"fixed", inset:0, zIndex:12000, background:"rgba(0,0,0,.68)", display:"grid", placeItems:"center", padding:16 };
const modal = { width:"min(560px,96vw)", background:"var(--surface, #111827)", color:"var(--text, #fff)", border:"1px solid var(--border, #374151)", borderRadius:18, padding:20, boxShadow:"0 24px 80px rgba(0,0,0,.45)" };
const btn = { border:"1px solid var(--border, #4b5563)", background:"var(--surface-glass, #1f2937)", color:"inherit", borderRadius:12, padding:"12px 14px", fontWeight:800, cursor:"pointer" };
const danger = { ...btn, background:"#7f1d1d", borderColor:"#991b1b" };
const primary = { ...btn, background:"#0f766e", borderColor:"#0d9488" };
const input = { width:"100%", boxSizing:"border-box", padding:"10px 12px", borderRadius:10, border:"1px solid var(--border, #4b5563)", background:"var(--surface-glass, #111827)", color:"inherit" };

export default function CensusActionsPage(){
  const { permissions, isSuperadmin, role } = useUser();
  const superUser=!!isSuperadmin||String(role||"").toLowerCase()==="superadmin";
  const canWrite=superUser||!!permissions?.can_census_write;
  const rootRef=useRef(null);
  const [rows,setRows]=useState([]);
  const [target,setTarget]=useState(null);
  const [mode,setMode]=useState("actions");
  const [draft,setDraft]=useState(null);
  const [toId,setToId]=useState("");
  const [busy,setBusy]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);

  const load=async()=>{ try { const d=await api.get("/census/bed-board"); setRows(Array.isArray(d)?d:[]); } catch(e){ console.error(e); } };
  useEffect(()=>{ load(); },[refreshKey]);

  useEffect(()=>{
    const root=rootRef.current;
    if(!root) return;
    const cleanLegacyControls=()=>{
      root.querySelectorAll("button").forEach(b=>{
        const title=String(b.getAttribute("title")||"");
        if(title==="Edit room" || title.startsWith("Save & lock room")){
          if(b.style.display!=="none") b.style.display="none";
          if(b.getAttribute("aria-hidden")!=="true") b.setAttribute("aria-hidden","true");
          if(b.tabIndex!==-1) b.tabIndex=-1;
        }
      });
      const legacy="Empty opens admit. Occupied/leave toggles with one tap (when not in room edit mode).";
      const writable="Empty beds open Admit Resident. Occupied and on-leave beds open Resident Actions.";
      const readonly="Read only — Census Write permission is required to admit, edit, move, place on leave, return, or discharge residents.";
      const desired=canWrite?writable:readonly;
      root.querySelectorAll("div").forEach(el=>{
        const text=String(el.textContent||"").trim();
        if((text===legacy||text===writable||text===readonly) && text!==desired){
          el.textContent=desired;
        }
      });
    };
    cleanLegacyControls();
    const observer=new MutationObserver(cleanLegacyControls);
    observer.observe(root,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[refreshKey,canWrite]);

  const refresh=()=>{ setTarget(null); setMode("actions"); setDraft(null); setToId(""); setRefreshKey(k=>k+1); };
  const fail=(e)=>{ console.error(e); alert(e?.body?.details?.message || e?.message || "Could not update census."); };
  const isGenderMismatch=(e)=>e?.status===409&&(e?.body?.error==="GENDER_MISMATCH"||e?.message==="GENDER_MISMATCH");

  function intercept(e){
    if(e.target.closest("button,select,input,textarea")) return;
    const card=e.target.closest('[role="button"]');
    if(!card) return;
    if(!canWrite){ e.preventDefault(); e.stopPropagation(); return; }
    const text=String(card.textContent||"").replace(/\s+/g," ").trim();
    const row=rows.find(r=>text.includes(bedKey(r)) && normStatus(r.status)!=="empty");
    if(!row) return;
    e.preventDefault(); e.stopPropagation();
    setTarget(row); setMode("actions"); setDraft(null); setToId("");
  }

  async function putWithGenderOverride(row,payload){
    if(!canWrite) return false;
    try { await api.put(`/census/${row.id}`,payload); return true; }
    catch(e){
      if(!isGenderMismatch(e)) throw e;
      const details=e?.body?.details||{};
      const room=roomNo(row)||"this room";
      const incoming=payload.patient_gender||"resident";
      const existing=details.room_gender||details.expected_gender||"the current room gender";
      const ok=confirm(`Gender mismatch for Room ${room}.\n\nYou are placing a ${incoming} resident into a room currently designated ${existing}.\n\nOverride this restriction? Use only for an approved exception such as a married couple or other documented accommodation.`);
      if(!ok) return false;
      const note=prompt("Enter the reason for the gender override:","Married couple / approved accommodation");
      if(note===null) return false;
      await api.put(`/census/${row.id}`,{...payload,couple_override:true,couple_note:String(note||"").trim()||"Approved room gender override"});
      return true;
    }
  }

  async function setLeave(next){ if(!target||!canWrite) return; setBusy(true); try { await api.put(`/census/${target.id}`,{status:next}); refresh(); } catch(e){ fail(e); } finally { setBusy(false); } }
  function startEdit(){ if(!canWrite) return; setDraft({...target, admit_date:String(target.admit_date||"").slice(0,10), expected_discharge:String(target.expected_discharge||"").slice(0,10)}); setMode("edit"); }
  async function saveEdit(){
    if(!canWrite) return;
    if(!draft?.payer_source || !draft?.care_type || !draft?.admit_date || !draft?.patient_gender || draft.patient_gender==="Unknown") return alert("Payer, care type, gender, and admit date are required.");
    setBusy(true);
    try { const payload={payer_source:draft.payer_source,care_type:draft.care_type,patient_gender:draft.patient_gender,patient_label:String(draft.patient_label||"").trim()||null,admit_date:draft.admit_date,expected_discharge:allowsDc(draft.care_type)?draft.expected_discharge||null:null,private_pay_note:String(draft.private_pay_note||"")}; const saved=await putWithGenderOverride(draft,payload); if(saved) refresh(); }
    catch(e){ fail(e); } finally { setBusy(false); }
  }

  function residentPayload(r){ return {status:normStatus(r.status),payer_source:r.payer_source||null,care_type:r.care_type||null,admit_date:r.admit_date||null,expected_discharge:allowsDc(r.care_type)?r.expected_discharge||null:null,patient_label:String(r.patient_label||"").trim()||null,private_pay_note:String(r.private_pay_note||""),patient_gender:r.patient_gender||"Unknown",couple_override:!!r.couple_override,couple_note:String(r.couple_note||"").trim()||null}; }
  const emptyPayload={status:"empty",payer_source:null,care_type:null,admit_date:null,expected_discharge:null,patient_label:null,private_pay_note:"",patient_gender:"Unknown",couple_override:false,couple_note:null};
  async function move(){
    if(!canWrite) return;
    const to=rows.find(r=>String(r.id)===String(toId)); if(!target||!to) return;
    const swap=normStatus(to.status)!=="empty"; setBusy(true);
    try { const moved=await putWithGenderOverride(to,residentPayload(target)); if(!moved) return; const clearedOrSwapped=await putWithGenderOverride(target,swap?residentPayload(to):emptyPayload); if(!clearedOrSwapped){ await load(); return; } refresh(); }
    catch(e){ fail(e); await load(); } finally { setBusy(false); }
  }
  async function discharge(){ if(!canWrite) return; if(!target||!confirm(`Discharge ${bedKey(target)}? This will mark the bed EMPTY.`)) return; setBusy(true); try { await api.put(`/census/${target.id}`,emptyPayload); refresh(); } catch(e){ fail(e); } finally { setBusy(false); } }

  const destinations=useMemo(()=>rows.slice().sort((a,b)=>bedKey(a).localeCompare(bedKey(b),undefined,{numeric:true})),[rows]);
  return <div ref={rootRef} onClickCapture={intercept}>
    <CensusPage key={refreshKey}/>
    {target&&canWrite&&<div style={overlay} onMouseDown={()=>!busy&&setTarget(null)}><div style={modal} onMouseDown={e=>e.stopPropagation()}>
      {mode==="actions"&&<><div style={{fontSize:22,fontWeight:900}}>Resident Actions</div><div style={{opacity:.72,marginTop:4}}>Bed {bedKey(target)} • {normStatus(target.status)==="leave"?"On Leave":"Occupied"}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:18}}><button style={btn} onClick={startEdit} disabled={busy}>Edit Resident</button>{normStatus(target.status)==="leave"?<button style={primary} onClick={()=>setLeave("occupied")} disabled={busy}>Return from Leave</button>:<button style={btn} onClick={()=>setLeave("leave")} disabled={busy}>Send on Leave</button>}<button style={btn} onClick={()=>setMode("move")} disabled={busy}>Move / Swap</button><button style={danger} onClick={discharge} disabled={busy}>Discharge</button></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}><button style={btn} onClick={()=>setTarget(null)} disabled={busy}>Close</button></div></>}
      {mode==="move"&&<><div style={{fontSize:22,fontWeight:900}}>Move / Swap Resident</div><div style={{opacity:.72,marginTop:4}}>From bed {bedKey(target)}</div><div style={{marginTop:18}}><div style={{fontWeight:800,marginBottom:7}}>Destination Bed</div><select style={input} value={toId} onChange={e=>setToId(e.target.value)}><option value="">Select…</option>{destinations.map(r=><option key={r.id} value={r.id} disabled={String(r.id)===String(target.id)}>{bedKey(r)} • {normStatus(r.status)==="empty"?"Empty":normStatus(r.status)==="leave"?"On Leave":"Occupied"}</option>)}</select></div><div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}><button style={btn} onClick={()=>setMode("actions")} disabled={busy}>Back</button><button style={primary} onClick={move} disabled={busy||!toId}>{busy?"Working…":"Confirm Move / Swap"}</button></div></>}
      {mode==="edit"&&draft&&<><div style={{fontSize:22,fontWeight:900}}>Edit Resident</div><div style={{opacity:.72,marginTop:4}}>Bed {bedKey(target)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginTop:18}}><label>Payer<select style={input} value={draft.payer_source||""} onChange={e=>setDraft({...draft,payer_source:e.target.value})}><option value="">Select…</option>{PAYER_OPTIONS.map(x=><option key={x}>{x}</option>)}</select></label><label>Care Type<select style={input} value={draft.care_type||""} onChange={e=>setDraft({...draft,care_type:e.target.value,expected_discharge:allowsDc(e.target.value)?draft.expected_discharge:""})}><option value="">Select…</option>{CARE_OPTIONS.map(x=><option key={x}>{x}</option>)}</select></label><label>Gender<select style={input} value={draft.patient_gender||"Unknown"} onChange={e=>setDraft({...draft,patient_gender:e.target.value})}>{GENDER_OPTIONS.map(x=><option key={x}>{x}</option>)}</select></label><label>Name / Label<input style={input} value={draft.patient_label||""} onChange={e=>setDraft({...draft,patient_label:e.target.value})}/></label><label>Admit Date<input type="date" style={input} value={draft.admit_date||""} onChange={e=>setDraft({...draft,admit_date:e.target.value})}/></label>{allowsDc(draft.care_type)&&<label>Expected Discharge<input type="date" style={input} value={draft.expected_discharge||""} onChange={e=>setDraft({...draft,expected_discharge:e.target.value})}/></label>}<label style={{gridColumn:"1/-1"}}>Note<input style={input} value={draft.private_pay_note||""} onChange={e=>setDraft({...draft,private_pay_note:e.target.value})}/></label></div><div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:18}}><button style={btn} onClick={()=>setMode("actions")} disabled={busy}>Back</button><button style={primary} onClick={saveEdit} disabled={busy}>{busy?"Saving…":"Save Changes"}</button></div></>}
    </div></div>}
  </div>;
}
