import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useNavigate, Link, useLocation, Navigate } from "react-router-dom";
import { useUser } from "./contexts/UserContext.jsx";
import supabase from "./services/supabaseClient";
import { getOfflineSnapshot, getOfflineOperationsSnapshot } from "./services/offlineCache.js";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ShiftsPage from "./pages/ShiftsPage.jsx";
import CensusActionsPage from "./pages/CensusActionsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import StaffManagementPage from "./pages/StaffManagementPage.jsx";
import SuperAdminPage from "./pages/SuperAdminPage.jsx";
import AcceptInvitePage from "./pages/AcceptInvitePage.jsx";
import UserHomePage from "./pages/UserHomePage.jsx";
import OrgSwitcher from "./components/OrgSwitcher.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import OfflineCensusSnapshot from "./components/OfflineCensusSnapshot.jsx";
import OfflineOperationsSnapshot from "./components/OfflineOperationsSnapshot.jsx";
import OperationsSnapshotSync from "./components/OperationsSnapshotSync.jsx";
import "./index.css";

function MenuLink({to,label,onClick}){return <Link to={to} onClick={onClick} style={{padding:"12px",borderRadius:12,textDecoration:"none",color:"var(--nav-text)",fontWeight:800,background:"var(--surface-glass)",border:"1px solid var(--border)"}}>{label}</Link>}
function MenuOverlay({open,onClose,links,role,onLogout,onOrgChanged}){if(!open)return null;return <div onMouseDown={onClose} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.55)",display:"flex",padding:12}}><div onMouseDown={e=>e.stopPropagation()} style={{width:"min(420px,94vw)",borderRadius:16,border:"1px solid var(--border)",background:"var(--nav-bg)",color:"var(--nav-text)",overflow:"hidden",alignSelf:"flex-start"}}><div style={{padding:12,borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}><b>Menu</b><button onClick={onClose} style={{height:40,width:40,borderRadius:12,border:"1px solid var(--border)",background:"var(--surface-glass)",color:"var(--nav-text)",fontSize:16}}>✕</button></div><div style={{padding:12,display:"flex",flexDirection:"column",gap:12}}><div style={{display:"flex",flexDirection:"column",gap:10}}>{links.map(l=><MenuLink key={l.to} {...l} onClick={onClose}/>)}</div><div style={{height:1,background:"var(--border)",margin:"6px 0"}}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><b>Organization</b><div style={{minWidth:190}}><OrgSwitcher onOrgChanged={onOrgChanged}/></div></div><div style={{display:"flex",justifyContent:"flex-end"}}><ThemeToggle/></div><div style={{fontWeight:800,opacity:.8}}>Role: {role?.toUpperCase()}</div><button onClick={onLogout} style={{background:"#b33",color:"white",border:0,padding:"10px 14px",borderRadius:12,fontWeight:900}}>Logout</button></div></div></div>}
function FacilityAdminPage(){const rootRef=useRef(null);if(typeof window!=="undefined")window.localStorage.setItem("admin_primary_tab","facility");useEffect(()=>{const root=rootRef.current;if(!root)return;const hide=()=>root.querySelectorAll("button").forEach(b=>{const x=b.textContent?.trim();if(x==="Staff Settings"||x==="Facility Settings"){b.style.display="none";b.setAttribute("aria-hidden","true");b.tabIndex=-1;}});hide();const o=new MutationObserver(hide);o.observe(root,{childList:true,subtree:true});return()=>o.disconnect();},[]);return <div ref={rootRef}><AdminPage/></div>}
function Landing({canSeeDashboard,canSeeShifts,canSeeCensus,canSeeAdmin}){if(canSeeAdmin)return <Navigate to="/admin" replace/>;if(canSeeShifts)return <Navigate to="/shifts" replace/>;if(canSeeCensus)return <Navigate to="/census" replace/>;if(canSeeDashboard)return <Navigate to="/dashboard" replace/>;return <Navigate to="/home" replace/>}

function ConnectionScreen({error,onRetry,retrying,onCensus,onOperations,hasCensus,hasOperations}){
  const offline=typeof navigator!=="undefined"&&!navigator.onLine;
  return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"var(--bg)",color:"var(--text)"}}><div style={{width:"min(560px,100%)",padding:28,borderRadius:18,border:"1px solid var(--border)",background:"var(--surface)",boxShadow:"0 12px 40px rgba(0,0,0,.18)"}}><div style={{fontSize:28,fontWeight:950,marginBottom:10}}>ShiftCensus</div><div style={{fontSize:20,fontWeight:900,marginBottom:10}}>{offline?"You’re offline":"Service temporarily unavailable"}</div><div style={{lineHeight:1.55,opacity:.85,marginBottom:18}}>{offline?"This device does not currently have an internet connection. Saved facility information remains available below in read-only mode.":"ShiftCensus could not reach one of its required services. Your facility data has not been erased. Saved facility information remains available in read-only mode."}</div>{error?.message&&<div style={{fontSize:13,opacity:.65,marginBottom:18}}>Connection detail: {error.message}</div>}<div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button onClick={onRetry} disabled={retrying} style={{border:0,borderRadius:12,padding:"12px 18px",fontWeight:900,cursor:retrying?"wait":"pointer"}}>{retrying?"Retrying…":"Retry connection"}</button>{hasCensus&&<button onClick={onCensus} style={{border:"1px solid var(--border)",borderRadius:12,padding:"12px 18px",fontWeight:900,background:"var(--surface-glass)",color:"inherit"}}>Census snapshot</button>}{hasOperations&&<button onClick={onOperations} style={{border:"1px solid var(--border)",borderRadius:12,padding:"12px 18px",fontWeight:900,background:"var(--surface-glass)",color:"inherit"}}>Staffing & assignments</button>}</div></div></div>
}

export default function App(){
  const {user,loading,role,permissions,isSuperadmin,connectionError,refreshUser}=useUser(); const navigate=useNavigate(); const location=useLocation();
  const isInviteRoute=location.pathname.startsWith("/accept-invite"); const isLoginRoute=location.pathname.startsWith("/login");
  useEffect(()=>{if(!loading&&!connectionError&&!user&&!isInviteRoute)navigate("/login");},[loading,connectionError,user,navigate,isInviteRoute]);
  const superUser=!!isSuperadmin||role==="superadmin";
  const canSeeDashboard=superUser||!!permissions?.can_dashboard_read;
  const canSeeShifts=superUser||!!permissions?.can_schedule_read||!!permissions?.can_schedule_write;
  const canSeeCensus=superUser||!!permissions?.can_census_read||!!permissions?.can_census_write;
  const canSeeAdmin=superUser||!!permissions?.is_admin;
  const canSeeStaffManagement=superUser||!!permissions?.can_manage_admins;
  const [menuOpen,setMenuOpen]=useState(false);
  const [retrying,setRetrying]=useState(false);
  const [offlineView,setOfflineView]=useState(null);
  useEffect(()=>setMenuOpen(false),[location.pathname]);
  useEffect(()=>{if(!menuOpen)return;const f=e=>{if(e.key==="Escape")setMenuOpen(false)};window.addEventListener("keydown",f);return()=>window.removeEventListener("keydown",f)},[menuOpen]);
  const navLinks=useMemo(()=>{const x=[{to:"/home",label:"Home"}];if(canSeeDashboard)x.push({to:"/dashboard",label:"Dashboard"});if(canSeeShifts)x.push({to:"/shifts",label:"Schedule"});if(canSeeCensus)x.push({to:"/census",label:"Census"});if(canSeeAdmin)x.push({to:"/admin",label:"Admin"});if(canSeeStaffManagement)x.push({to:"/staff-management",label:"Staff Management"});if(superUser)x.push({to:"/superadmin",label:"Super Admin"});return x;},[canSeeDashboard,canSeeShifts,canSeeCensus,canSeeAdmin,canSeeStaffManagement,superUser]);
  const logout=async()=>{await supabase.auth.signOut();sessionStorage.clear();window.location.href="/login"}; const orgChanged=()=>{setMenuOpen(false);window.location.reload()};
  const retry=async()=>{setRetrying(true);try{await refreshUser();setOfflineView(null);}finally{setRetrying(false)}};
  const hasCensus=!!getOfflineSnapshot();
  const hasOperations=!!getOfflineOperationsSnapshot();
  if(loading&&!isLoginRoute)return <div style={{padding:40}}>Connecting to ShiftCensus…</div>;
  if(offlineView==="census"&&!isLoginRoute)return <OfflineCensusSnapshot onRetry={retry} retrying={retrying}/>;
  if(offlineView==="operations"&&!isLoginRoute)return <OfflineOperationsSnapshot onRetry={retry} retrying={retrying}/>;
  if(connectionError&&!isLoginRoute)return <ConnectionScreen error={connectionError} onRetry={retry} retrying={retrying} hasCensus={hasCensus} hasOperations={hasOperations} onCensus={()=>setOfflineView("census")} onOperations={()=>setOfflineView("operations")}/>;
  const showNav=!!user&&!isInviteRoute&&!isLoginRoute;
  return <div>{showNav&&<OperationsSnapshotSync/>}{showNav&&<><div className="navbar" style={{position:"sticky",top:0,zIndex:999,display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderBottom:"1px solid var(--border)",background:"var(--nav-bg)",color:"var(--nav-text)"}}><button onClick={()=>setMenuOpen(s=>!s)} style={{height:44,width:44,borderRadius:12,border:"1px solid var(--border)",background:"var(--surface-glass)",color:"var(--nav-text)",fontSize:18,fontWeight:900}} aria-label="Open menu">☰</button><div style={{fontWeight:900}}>ShiftCensus</div><div style={{flex:1}}/></div><MenuOverlay open={menuOpen} onClose={()=>setMenuOpen(false)} links={navLinks} role={role} onLogout={logout} onOrgChanged={orgChanged}/></>}
  <Routes><Route path="/login" element={<LoginPage/>}/><Route path="/accept-invite" element={<AcceptInvitePage/>}/><Route path="/" element={<Landing canSeeDashboard={canSeeDashboard} canSeeShifts={canSeeShifts} canSeeCensus={canSeeCensus} canSeeAdmin={canSeeAdmin}/>}/><Route path="/home" element={<UserHomePage/>}/>{canSeeDashboard&&<Route path="/dashboard" element={<DashboardPage/>}/>} {canSeeShifts&&<Route path="/shifts" element={<ShiftsPage/>}/>} {canSeeCensus&&<Route path="/census" element={<CensusActionsPage/>}/>} {canSeeAdmin&&<Route path="/admin" element={<FacilityAdminPage/>}/>} {canSeeStaffManagement&&<Route path="/staff-management" element={<StaffManagementPage/>}/>} {superUser&&<Route path="/superadmin" element={<SuperAdminPage/>}/>}<Route path="*" element={<Navigate to="/" replace/>}/></Routes></div>
}