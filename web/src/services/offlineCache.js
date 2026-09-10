const SNAPSHOT_KEY = "shiftcensus:last-good-snapshot:v1";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

// Keep the first offline snapshot deliberately minimal. We do not persist
// patient_label, notes, auth tokens, or other direct identifiers here.
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

export function getOfflineSnapshot() {
  try {
    const snapshot = safeParse(localStorage.getItem(SNAPSHOT_KEY));
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.censusRows)) return null;
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
  try { localStorage.removeItem(SNAPSHOT_KEY); } catch {}
}
