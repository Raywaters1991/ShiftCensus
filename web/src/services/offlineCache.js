const SNAPSHOT_KEY = "shiftcensus:last-good-snapshot:v1";
const OPERATIONS_KEY = "shiftcensus:last-good-operations:v1";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

// Keep offline resident data deliberately minimal. Do not persist
// patient_label, notes, auth tokens, or other direct resident identifiers.
function sanitizeCensusRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    room: r.room ?? null,
    room_number: r.room_number ?? null,
    bed: r.bed ?? null,
    status: r.status ?? "empty",
    payer_source: r.payer_source ?? null,
    care_type: r.care_type ?? null,
    admit_date: r.admit_date ?? null,
    expected_discharge: r.expected_discharge ?? null,
    patient_gender: r.patient_gender ?? "Unknown",
  }));
}

function sanitizeStaff(rows) {
  return (Array.isArray(rows) ? rows : []).map((s) => ({
    id: s.id,
    name: s.name ?? null,
    role: s.role ?? null,
  }));
}

function sanitizeShifts(rows) {
  return (Array.isArray(rows) ? rows : []).map((s) => ({
    id: s.id,
    staff_id: s.staff_id,
    shift_date: s.shift_date ?? null,
    unit: s.unit ?? null,
    role: s.role ?? null,
    shiftType: s.shiftType ?? null,
    start_local: s.start_local ?? null,
    end_local: s.end_local ?? null,
    assignment_number: s.assignment_number ?? null,
  }));
}

function sanitizeAssignments(rows) {
  return (Array.isArray(rows) ? rows : []).map((a) => ({
    id: a.id,
    unit: a.unit ?? null,
    assignment_number: a.assignment_number ?? a.number ?? null,
    name: a.name ?? a.label ?? null,
  }));
}

function sanitizeUnits(rows) {
  return (Array.isArray(rows) ? rows : []).map((u) => ({
    id: u.id,
    name: u.name ?? u.unit ?? null,
  }));
}

export function saveOfflineSnapshot({ orgId, orgCode, orgName, censusRows }) {
  try {
    if (!Array.isArray(censusRows) || censusRows.length === 0) return false;
    const snapshot = {
      version: 1,
      orgId: orgId || null,
      orgCode: orgCode || null,
      orgName: orgName || null,
      syncedAt: new Date().toISOString(),
      censusRows: sanitizeCensusRows(censusRows),
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn("Could not save offline snapshot", e);
    return false;
  }
}

// Save only after ALL staffing endpoints have completed successfully. This
// prevents a partial/failed refresh from replacing the last known good data.
export function saveOfflineOperationsSnapshot({ orgId, orgCode, orgName, shifts, staff, units, assignments }) {
  try {
    if (![shifts, staff, units, assignments].every(Array.isArray)) return false;
    const snapshot = {
      version: 1,
      orgId: orgId || null,
      orgCode: orgCode || null,
      orgName: orgName || null,
      syncedAt: new Date().toISOString(),
      shifts: sanitizeShifts(shifts),
      staff: sanitizeStaff(staff),
      units: sanitizeUnits(units),
      assignments: sanitizeAssignments(assignments),
    };
    localStorage.setItem(OPERATIONS_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn("Could not save offline operations snapshot", e);
    return false;
  }
}

export function getOfflineSnapshot() {
  try {
    const snapshot = safeParse(localStorage.getItem(SNAPSHOT_KEY));
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.censusRows)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function getOfflineOperationsSnapshot() {
  try {
    const snapshot = safeParse(localStorage.getItem(OPERATIONS_KEY));
    if (!snapshot || snapshot.version !== 1) return null;
    if (![snapshot.shifts, snapshot.staff, snapshot.units, snapshot.assignments].every(Array.isArray)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function getOfflineSnapshotAge(snapshot) {
  const t = Date.parse(snapshot?.syncedAt || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now() - t);
}

export function isOfflineSnapshotStale(snapshot) {
  const age = getOfflineSnapshotAge(snapshot);
  return age === null || age > SNAPSHOT_TTL_MS;
}

export function clearOfflineSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
    localStorage.removeItem(OPERATIONS_KEY);
  } catch {}
}
