import { useEffect, useState } from "react";

const permissionFields = [
  ["can_dashboard_read", "Dashboard / Wallboard"],
  ["can_schedule_read", "View Schedule"],
  ["can_schedule_write", "Edit Schedule & Review Requests"],
  ["can_census_read", "View Census"],
  ["can_census_write", "Edit Census"],
  ["can_manage_admins", "Staff Management"],
  ["is_admin", "Facility Settings"],
];
const normalDefaults = { can_dashboard_read:false, can_schedule_read:true, can_schedule_write:false, can_census_read:true, can_census_write:false, can_manage_admins:false, is_admin:false };

export default function StaffEditModal({ staff, departments, onClose, onSave, onProvisionLogin, mode="edit" }) {
  const isCreate=mode==="create";
  const [form,setForm]=useState({name:"",role:"",email:"",phone:"",department_id:"",permissions:{...normalDefaults}});
  const [saving,setSaving]=useState(false); const [provisioning,setProvisioning]=useState(false);
  useEffect(()=>{if(!staff&&!isCreate)return;setForm({name:staff?.name||"",role:staff?.role||"",email:staff?.email||"",phone:staff?.phone||"",department_id:staff?.department_id||"",permissions:{...normalDefaults,...(staff?.permissions||{})}});},[staff,isCreate]);
  if(!staff&&!isCreate)return null;
  function toggle(key){setForm(p=>{const next={...p.permissions,[key]:!p.permissions[key]};if(key==="can_schedule_write"&&next[key])next.can_schedule_read=true;if(key==="can_census_write"&&next[key])next.can_census_read=true;return {...p,permissions:next};});}
  async function save(){const payload={name:String(form.name||"").trim(),role:String(form.role||"").trim(),email:String(form.email||"").trim()||null,phone:String(form.phone||"").trim()||null,department_id:form.department_id||null,permissions:form.permissions};if(!payload.name||!payload.role)return alert("Name and role are required.");setSaving(true);try{await onSave?.(payload);onClose?.();}finally{setSaving(false);}}
  async function provision(){if(!String(form.email||"").trim())return alert("Add and save an email address before creating an account.");setProvisioning(true);try{await onProvisionLogin?.();}finally{setProvisioning(false);}}
  return <div style={ui.overlay} onMouseDown={()=>onClose?.()}><div style={ui.modal} onMouseDown={e=>e.stopPropagation()}>
    <div style={ui.title}>{isCreate?"Add Staff Member":"Edit Staff Member"}</div>
    <div style={ui.grid}>
      <label style={ui.label}>Name<input style={ui.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></label>
      <label style={ui.label}>Job Title / Role<input style={ui.input} value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}/></label>
      <label style={ui.label}>Department<select style={ui.input} value={form.department_id} onChange={e=>setForm(p=>({...p,department_id:e.target.value}))}><option value="">No department</option>{(departments||[]).map(d=><option key={d.id} value={d.id}>{d.name}{d.is_active===false?" (inactive)":""}</option>)}</select></label>
      <label style={ui.label}>Email<input style={ui.input} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></label>
      <label style={ui.label}>Phone<input style={ui.input} value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></label>
    </div>
    <div style={ui.permissions}><div style={ui.permissionTitle}>Access & Permissions</div><div style={ui.permissionHelp}>Job title identifies the employee. These controls determine what they can access at this facility. Anyone with Edit Schedule & Review Requests enabled will receive and manage requests from employees in their own department.</div><div style={ui.permissionGrid}>{permissionFields.map(([key,label])=><label key={key} style={ui.check}><input type="checkbox" checked={!!form.permissions[key]} onChange={()=>toggle(key)}/><span>{label}</span></label>)}</div></div>
    {isCreate?<div style={ui.notice}>If you enter an email address, ShiftCensus will create the employee account automatically. They will verify their email and create their own password.</div>:!staff?.user_id?<div style={ui.notice}>No ShiftCensus account yet. Save any email changes first, then choose Create Account.</div>:staff?.setup_pending?<div style={ui.notice}>Account created. Employee setup is still pending.</div>:<div style={ui.good}>Account active.</div>}
    <div style={ui.actions}>{!isCreate&&!staff?.user_id?<button style={ui.secondary} disabled={provisioning} onClick={provision}>{provisioning?"Creating…":"Create Account"}</button>:null}<button style={ui.ghost} onClick={()=>onClose?.()} disabled={saving||provisioning}>Cancel</button><button style={ui.primary} onClick={save} disabled={saving||provisioning}>{saving?"Saving…":isCreate?"Add Staff":"Save Changes"}</button></div>
  </div></div>;
}
const ui={overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"grid",placeItems:"center",padding:16,zIndex:10000,overflowY:"auto"},modal:{width:"min(760px,100%)",borderRadius:18,padding:18,background:"#111",border:"1px solid rgba(255,255,255,.15)",color:"white",maxHeight:"94vh",overflowY:"auto"},title:{fontSize:18,fontWeight:900,marginBottom:14},grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12},label:{display:"grid",gap:6,fontSize:12,color:"#cbd5e1"},input:{height:42,borderRadius:12,padding:"8px 10px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",color:"white"},permissions:{marginTop:16,padding:14,borderRadius:14,border:"1px solid rgba(59,130,246,.28)",background:"rgba(59,130,246,.07)"},permissionTitle:{fontWeight:900,fontSize:15},permissionHelp:{color:"#9CA3AF",fontSize:12,marginTop:4,marginBottom:12},permissionGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10},check:{display:"flex",alignItems:"center",gap:9,padding:"10px 11px",borderRadius:10,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",fontSize:13,fontWeight:700,cursor:"pointer"},notice:{marginTop:14,padding:12,borderRadius:12,background:"rgba(245,158,11,.10)",border:"1px solid rgba(245,158,11,.25)",fontSize:12},good:{marginTop:14,padding:12,borderRadius:12,background:"rgba(34,197,94,.10)",border:"1px solid rgba(34,197,94,.25)",fontSize:12},actions:{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10,flexWrap:"wrap"},primary:{height:40,borderRadius:12,padding:"0 14px",border:0,fontWeight:900,cursor:"pointer"},secondary:{height:40,borderRadius:12,padding:"0 14px",border:"1px solid rgba(59,130,246,.35)",background:"rgba(59,130,246,.12)",color:"white",fontWeight:900,cursor:"pointer"},ghost:{height:40,borderRadius:12,padding:"0 14px",border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"white",fontWeight:900,cursor:"pointer"}};