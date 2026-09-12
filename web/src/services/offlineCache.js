const CACHE_PREFIX = "shiftcensus:offline:v2";
const LEGACY_SNAPSHOT_KEY = "shiftcensus:last-good-snapshot:v1";
const LEGACY_OPERATIONS_KEY = "shiftcensus:last-good-operations:v1";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }
function normalizeOrgKey(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"); }

function storedActiveOrg() {
  try {
    const orgId = sessionStorage.getItem("active_org_id") || localStorage.getItem("active_org_id") || "";
    const orgCode = sessionStorage.getItem("active_org_code") || localStorage.getItem("active_org_code") || "";
    const orgName = sessionStorage.getItem("active_org_name") || localStorage.getItem("active_org_name") || "";
    return { orgId, orgCode, orgName };
  } catch {
    return { orgId: "", orgCode: "", orgName: "" };
  }
}

function resolveOrg(org = {}) {
  const explicit = { orgId: org?.orgId || "", orgCode: org?.orgCode || "", orgName: org?.orgName || "" };
  if (explicit.orgId || explicit.orgCode) return explicit;
  return storedActiveOrg();
}

function orgKey(org = {}) { const resolved = resolveOrg(org); return normalizeOrgKey(resolved.orgId) || normalizeOrgKey(resolved.orgCode) || null; }
function key(kind, org = {}) { const k = orgKey(org); return k ? `${CACHE_PREFIX}:${k}:${kind}` : null; }

function sanitizeCensusRows(rows) { return (Array.isArray(rows)?rows:[]).map(r=>({id:r.id,room:r.room??null,room_number:r.room_number??null,bed:r.bed??null,status:r.status??"empty",payer_source:r.payer_source??null,care_type:r.care_type??null,admit_date:r.admit_date??null,expected_discharge:r.expected_discharge??null,patient_gender:r.patient_gender??"Unknown"})); }
function sanitizeStaff(rows) { return (Array.isArray(rows)?rows:[]).map(s=>({id:s.id,name:s.name??null,role:s.role??null})); }
function sanitizeShifts(rows) { return (Array.isArray(rows)?rows:[]).map(s=>({id:s.id,staff_id:s.staff_id,shift_date:s.shift_date??null,shift_type:s.shift_type??s.shiftType??null,role:s.role??null,start_local:s.start_local??null,end_local:s.end_local??null,start_time:s.start_time??null,end_time:s.end_time??null,timezone:s.timezone??null})); }
function sanitizeAssignments(rows) { return (Array.isArray(rows)?rows:[]).map(a=>({id:a.id,shift_id:a.shift_id??null,unit_id:a.unit_id??null,unit:a.unit??null,assignment_number:a.assignment_number??a.number??null})); }
function sanitizeUnits(rows) { return (Array.isArray(rows)?rows:[]).map(u=>({id:u.id,name:u.name??u.unit??null})); }

function save(kind, org, payload) {
  try {
    const resolved = resolveOrg(org);
    const storageKey=key(kind,resolved);
    if(!storageKey)return false;
    localStorage.setItem(storageKey,JSON.stringify({version:2,orgId:resolved.orgId||null,orgCode:resolved.orgCode||null,orgName:resolved.orgName||null,syncedAt:new Date().toISOString(),...payload}));
    return true;
  }
  catch(e){console.warn(`Could not save offline ${kind} snapshot`,e);return false;}
}
export function saveOfflineSnapshot({orgId,orgCode,orgName,censusRows}) { if(!Array.isArray(censusRows)||!censusRows.length)return false; return save("census",{orgId,orgCode,orgName},{censusRows:sanitizeCensusRows(censusRows)}); }
export function saveOfflineOperationsSnapshot({orgId,orgCode,orgName,date,timezone,shifts,staff,units,assignments}) { if(![shifts,staff,units,assignments].every(Array.isArray))return false; return save("operations",{orgId,orgCode,orgName},{date:date||null,timezone:timezone||null,shifts:sanitizeShifts(shifts),staff:sanitizeStaff(staff),units:sanitizeUnits(units),assignments:sanitizeAssignments(assignments)}); }

function read(kind, org = {}) {
  try {
    const resolved = resolveOrg(org);
    const storageKey=key(kind,resolved);
    if(!storageKey)return null;
    const s=safeParse(localStorage.getItem(storageKey));
    if(!s||s.version!==2)return null;
    const expected=orgKey(resolved), actual=orgKey({orgId:s.orgId,orgCode:s.orgCode});
    if(!expected||expected!==actual)return null;
    return s;
  } catch{return null;}
}
export function getOfflineSnapshot(org={}) { const s=read("census",org); return s&&Array.isArray(s.censusRows)?s:null; }
export function getOfflineOperationsSnapshot(org={}) { const s=read("operations",org); return s&&[s.shifts,s.staff,s.units,s.assignments].every(Array.isArray)?s:null; }
export function getOfflineSnapshotAge(snapshot){const t=Date.parse(snapshot?.syncedAt||"");return Number.isFinite(t)?Math.max(0,Date.now()-t):null;}
export function isOfflineSnapshotStale(snapshot){const age=getOfflineSnapshotAge(snapshot);return age===null||age>SNAPSHOT_TTL_MS;}

export function clearOfflineSnapshot(org={}) { try { const c=key("census",org),o=key("operations",org); if(c)localStorage.removeItem(c); if(o)localStorage.removeItem(o); } catch{} }
export function clearAllOfflineSnapshots() { try { for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&(k.startsWith(`${CACHE_PREFIX}:`)||k===LEGACY_SNAPSHOT_KEY||k===LEGACY_OPERATIONS_KEY))localStorage.removeItem(k);} } catch{} }
