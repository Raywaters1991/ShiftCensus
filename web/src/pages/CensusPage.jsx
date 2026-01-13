// src/pages/CensusPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";

const PAYER_OPTIONS = ["VA", "Medicare", "Medicaid", "Private Pay"];
const CARE_OPTIONS = ["Long Term", "Skilled", "Hospice", "Respite"];
const GENDER_OPTIONS = ["Female", "Male", "Unknown", "Other"];

const idEq = (a, b) => String(a) === String(b);

function normStatus(s) {
  const v = String(s || "empty").toLowerCase().trim();
  return v === "occupied" || v === "leave" || v === "empty" ? v : "empty";
}
function statusLabel(s) {
  const v = normStatus(s);
  return v === "occupied" ? "Occupied" : v === "leave" ? "On Leave" : "Empty";
}
function isOccupied(status) {
  return normStatus(status) === "occupied";
}
function isActiveInRoom(status) {
  const s = normStatus(status);
  return s === "occupied" || s === "leave";
}

function normGender(g) {
  const v = String(g || "").trim().toLowerCase();
  if (!v) return "Unknown";
  if (v === "male") return "Male";
  if (v === "female") return "Female";
  if (v === "other") return "Other";
  if (v === "unknown") return "Unknown";
  return "Unknown";
}
function isMeaningfulGender(g) {
  return g === "Male" || g === "Female";
}

function roomKeyForRow(r) {
  const rn =
    r.room_number !== null && r.room_number !== undefined && r.room_number !== ""
      ? String(r.room_number).trim()
      : String(String(r.room || "").match(/\d+/)?.[0] || "").trim();
  return rn || String(r.room || "").trim() || "—";
}

function roomDerivedGender(beds) {
  const set = new Set();
  for (const b of beds || []) {
    if (!isActiveInRoom(b.status)) continue;
    const g = normGender(b.patient_gender);
    if (isMeaningfulGender(g)) set.add(g);
  }
  if (set.size === 1) return Array.from(set)[0];
  return "Neutral";
}

function genderBadgeMeta(g) {
  const gg = g === "Neutral" ? "Neutral" : normGender(g);
  if (gg === "Male") return { short: "M", label: "Male", ring: "ringM" };
  if (gg === "Female") return { short: "F", label: "Female", ring: "ringF" };
  return { short: "N", label: "Neutral", ring: "ringN" };
}

function safeDate(v) {
  if (!v) return "";
  return String(v).slice(0, 10);
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function numSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
function dash(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}
function careAllowsDischarge(careType) {
  const c = String(careType || "").trim().toLowerCase();
  return c === "skilled" || c === "respite";
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function payerCounts(list) {
  const map = {};
  for (const p of PAYER_OPTIONS) map[p] = 0;
  for (const r of list) {
    if (!isOccupied(r.status)) continue;
    const p = r.payer_source || "—";
    if (map[p] === undefined) map[p] = 0;
    map[p] += 1;
  }
  return map;
}
function careCounts(list) {
  const map = {};
  for (const c of CARE_OPTIONS) map[c] = 0;
  for (const r of list) {
    if (!isOccupied(r.status)) continue;
    const c = r.care_type || "—";
    if (map[c] === undefined) map[c] = 0;
    map[c] += 1;
  }
  return map;
}

function computeStats(list) {
  const total = list.length;
  const occupied = list.filter((r) => normStatus(r.status) === "occupied").length;
  const leave = list.filter((r) => normStatus(r.status) === "leave").length;
  const empty = total - occupied - leave;
  return { total, occupied, leave, empty, payerMap: payerCounts(list), careMap: careCounts(list) };
}

/**
 * ✅ FIX: this was missing, which is why empty beds wouldn't open the Admit modal.
 * Normalizes an "empty" bed row into the shape the modal expects.
 */
function normalizeRowForEmptyModal(r) {
  const rn =
    r.room_number !== null && r.room_number !== undefined && r.room_number !== ""
      ? String(r.room_number).trim()
      : String(String(r.room || "").match(/\d+/)?.[0] || "").trim();

  const roomStr = String(r.room ?? rn ?? "").trim();
  const bedStr = String(r.bed ?? "").trim().toUpperCase();

  return {
    // keep identifiers so saveModal can PUT /census/:id
    id: r.id,

    // preserve location
    room: roomStr,
    room_number: rn || null,
    bed: bedStr,

    // default to occupied (admit)
    status: "occupied",

    // required fields start blank so user must choose
    payer_source: r.payer_source || "",
    care_type: r.care_type || "",
    patient_gender: normGender(r.patient_gender) || "Unknown",
    admit_date: safeDate(r.admit_date) || todayISO(),

    // optional fields
    expected_discharge: safeDate(r.expected_discharge) || "",
    patient_label: String(r.patient_label || "").trim() || "",
    private_pay_note: String(r.private_pay_note ?? "") || "",

    // couple fields
    couple_override: !!r.couple_override,
    couple_note: String(r.couple_note || "").trim() || "",
  };
}

/**
 * Build printable report HTML with:
 * - header counters (Occupied, Leave, Empty, Total)
 * - optional columns based on report options
 * - respects statusFilter ("ALL" or specific)
 */
function buildReportHtml({ orgName, generatedAtISO, rows, options, statusFilter }) {
  const want = statusFilter === "ALL" ? null : statusFilter;

  // Apply same status filter as UI
  const filtered = want ? rows.filter((r) => normStatus(r.status) === want) : rows.slice();

  // Stats shown at the top should match the report data (filtered)
  const reportStats = computeStats(filtered);

  // ✅ Build ordered Care Type counters (Occupied only)
  const careOrdered = [];
  for (const c of CARE_OPTIONS) careOrdered.push([c, reportStats.careMap?.[c] ?? 0]);
  for (const [k, v] of Object.entries(reportStats.careMap || {})) {
    if (CARE_OPTIONS.includes(k)) continue;
    careOrdered.push([k, v]);
  }
  careOrdered.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  // Sort by room then bed
  filtered.sort((a, b) => {
    const ra = roomKeyForRow(a);
    const rb = roomKeyForRow(b);
    const c = numSort(ra, rb);
    if (c !== 0) return c;
    return String(a.bed || "").localeCompare(String(b.bed || ""), undefined, { numeric: true });
  });

  const cols = [];
  if (options.includeRoom) cols.push({ key: "room", label: "Room" });
  if (options.includeBed) cols.push({ key: "bed", label: "Bed" });
  if (options.includeStatus) cols.push({ key: "status", label: "Status" });
  if (options.includePayer) cols.push({ key: "payer", label: "Payer" });
  if (options.includeCare) cols.push({ key: "care", label: "Care Type" });
  if (options.includeGender) cols.push({ key: "gender", label: "Gender" });
  if (options.includeAdmit) cols.push({ key: "admit", label: "Admit" });
  if (options.includeDc) cols.push({ key: "dc", label: "Exp DC" });
  if (options.includeNote) cols.push({ key: "note", label: "Note" });
  if (options.includeLabel) cols.push({ key: "label", label: "Label" });

  const thead = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>`;

  const bodyRows = filtered
    .map((r) => {
      const s = normStatus(r.status);
      const isEmpty = s === "empty";
      const eligibleDc = !isEmpty && careAllowsDischarge(r.care_type);

      const val = {
        room: `Room ${roomKeyForRow(r)}`,
        bed: String(r.bed || "").toUpperCase(),
        status: statusLabel(s),
        payer: isEmpty ? "—" : dash(r.payer_source),
        care: isEmpty ? "—" : dash(r.care_type),
        gender: isEmpty ? "—" : normGender(r.patient_gender),
        admit: isEmpty ? "—" : safeDate(r.admit_date),
        dc: eligibleDc ? safeDate(r.expected_discharge) || "—" : "—",
        note: isEmpty ? "—" : String(r.private_pay_note ?? "").trim() ? String(r.private_pay_note) : "—",
        label: isEmpty ? "—" : dash(r.patient_label),
      };

      return `<tr>${cols
        .map((c) => {
          const cell = val[c.key] ?? "—";
          return `<td>${escapeHtml(cell)}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  const titleBits = [];
  titleBits.push(`Census Report`);
  if (orgName) titleBits.push(orgName);
  if (want) titleBits.push(`Filter: ${statusLabel(want)}`);
  const titleLine = titleBits.join(" • ");

  const chip = (label, value) =>
    `<div class="chip"><div class="chipLabel">${escapeHtml(label)}</div><div class="chipVal">${escapeHtml(
      value
    )}</div></div>`;

  // ✅ Smaller chips for care counters (Occupied only)
  const smallChip = (label, value) =>
    `<div class="chip chipSm"><div class="chipLabel">${escapeHtml(label)}</div><div class="chipVal chipValSm">${escapeHtml(
      value
    )}</div></div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(titleLine)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 22px; color: #111; }
    .top { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom: 14px; }
    h1 { font-size: 18px; margin: 0; }
    .meta { font-size: 12px; color: #444; margin-top: 6px; }

    .chips { display:flex; gap:10px; flex-wrap:wrap; margin: 14px 0 14px; }
    .chip { border: 1px solid #e5e5e5; border-radius: 14px; padding: 10px 12px; min-width: 130px; }
    .chipLabel { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color:#444; font-weight:700; }
    .chipVal { font-size: 18px; font-weight: 900; margin-top: 4px; }

    /* ✅ Care-type counter row */
    .sectionTitle { margin: 14px 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color:#444; font-weight:800; }
    .chipsGrid { display:flex; gap:10px; flex-wrap:wrap; margin: 0 0 14px; }
    .chipSm { min-width: 160px; }
    .chipValSm { font-size: 16px; }

    table { width: 100%; border-collapse: collapse; border: 1px solid #e5e5e5; }
    th, td { padding: 10px 10px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
    th { background: #fafafa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #333; }
    td { font-size: 13px; }
    tr:nth-child(even) td { background: #fcfcfc; }

    .footer { margin-top: 12px; font-size: 11px; color: #666; }
    @media print {
      body { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>${escapeHtml(titleLine)}</h1>
      <div class="meta">Generated: ${escapeHtml(generatedAtISO)}</div>
    </div>
  </div>

  <!-- ✅ Top counters -->
  <div class="chips">
    ${chip("Occupied", reportStats.occupied)}
    ${chip("Leave", reportStats.leave)}
    ${chip("Empty", reportStats.empty)}
    ${chip("Total", reportStats.total)}
  </div>

  <!-- ✅ Care Type counters (Occupied only) -->
  <div class="sectionTitle">Care Type (Occupied Only)</div>
  <div class="chipsGrid">
    ${
      careOrdered.length
        ? careOrdered.map(([k, v]) => smallChip(k, v)).join("")
        : `<div style="font-size:12px;color:#666;">No occupied residents in this report.</div>`
    }
  </div>

  <table>
    ${thead}
    <tbody>
      ${bodyRows || `<tr><td colspan="${cols.length}">No rows.</td></tr>`}
    </tbody>
  </table>

  <div class="footer">Printed from ShiftCensus</div>
</body>
</html>`;
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CensusPage() {
  const { orgCode, orgName } = useUser();

  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const [roomEditOpen, setRoomEditOpen] = useState(null);

  const [insightsOpen, setInsightsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [overrideModal, setOverrideModal] = useState(null);

  // Move/Swap modal
  const [moveModal, setMoveModal] = useState(null);

  const [editedFlags, setEditedFlags] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});

  const [lastSavedAt, setLastSavedAt] = useState({});
  const toastTimers = useRef({});

  // ✅ Report modal
  const [reportModal, setReportModal] = useState(null);

  useEffect(() => {
    if (!orgCode) return;
    setRows([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgCode]);

  useEffect(() => {
    return () => {
      for (const t of Object.values(toastTimers.current)) clearTimeout(t);
      toastTimers.current = {};
    };
  }, []);

  async function load() {
    try {
      const data = await api.get("/census/bed-board");
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      if (!roomEditOpen) setNoteDrafts({});
    } catch (err) {
      console.error("Failed to load census:", err);
      setRows([]);
    }
  }

  async function loadAndReturn() {
    const data = await api.get("/census/bed-board");
    const list = Array.isArray(data) ? data : [];
    setRows(list);
    return list;
  }

  function canShowIdentifiers() {
    return rows.some((r) => r.patient_label !== null && r.patient_label !== undefined);
  }

  function buildPayloadFromRow(r) {
    const payer = r.payer_source || null;
    const ct = r.care_type || null;
    const allowDc = careAllowsDischarge(ct);
    const dc = allowDc ? (r.expected_discharge || null) : null;

    return {
      room: String(r.room).trim(),
      room_number:
        r.room_number === "" || r.room_number === null || r.room_number === undefined
          ? null
          : String(r.room_number).trim(),
      bed: String(r.bed).trim().toUpperCase(),
      status: normStatus(r.status),

      payer_source: payer,
      care_type: ct,
      admit_date: r.admit_date || null,
      expected_discharge: dc,

      patient_label: String(r.patient_label || "").trim() || null,

      private_pay_note: String(r.private_pay_note ?? ""),

      patient_gender: r.patient_gender || "Unknown",

      couple_override: !!r.couple_override,
      couple_note: String(r.couple_note || "").trim() || null,
    };
  }

  async function trySaveWithServerRules(fn) {
    try {
      await fn();
      return { ok: true };
    } catch (err) {
      if (err?.status === 409 && err?.body?.error === "ROOM_LOCKED") {
        alert(err?.body?.details?.message || "This room is locked for a couple.");
        return { ok: false };
      }

      const isGenderMismatch =
        err?.status === 409 &&
        (err?.message === "GENDER_MISMATCH" || err?.body?.error === "GENDER_MISMATCH");

      if (isGenderMismatch) {
        setOverrideModal({
          payloadBase: null,
          serverDetails: err?.body?.details || null,
          coupleOverride: false,
          coupleNote: "",
        });
        return { ok: false, needsOverride: true, err };
      }

      console.error(err);
      alert(err?.message || "Failed to save.");
      return { ok: false };
    }
  }

  async function saveModal() {
    if (!selected) return;
    const r = selected.row;

    if (!String(r.payer_source || "").trim()) return alert("Payer Source is required.");
    if (!String(r.care_type || "").trim()) return alert("Care Type is required.");
    if (normGender(r.patient_gender) === "Unknown") return alert("Gender is required.");
    if (!String(r.admit_date || "").trim()) return alert("Admit Date is required.");

    const allowDc = careAllowsDischarge(r.care_type);

    const payload = buildPayloadFromRow({
      ...r,
      status: selected.fromEmpty ? "occupied" : r.status,
      expected_discharge: allowDc && r.expected_discharge ? r.expected_discharge : null,
    });

    setRows((prev) => prev.map((x) => (idEq(x.id, r.id) ? { ...x, ...payload } : x)));

    setSaving(true);

    const result = await trySaveWithServerRules(async () => {
      await api.put(`/census/${r.id}`, payload);
    });

    if (result.needsOverride) {
      setOverrideModal((m) => ({ ...m, payloadBase: payload, editingId: r.id }));
      setSaving(false);
      return;
    }

    setSaving(false);
    if (result.ok) {
      setSelected(null);
      load();
    } else {
      load();
    }
  }

  async function dischargeBed(row) {
    const ok = confirm(`Discharge bed ${row.room}${row.bed}? This will mark it EMPTY.`);
    if (!ok) return;

    const payload = {
      status: "empty",
      payer_source: null,
      care_type: null,
      admit_date: null,
      expected_discharge: null,
      patient_label: null,
      private_pay_note: "",
      patient_gender: "Unknown",
      couple_override: false,
      couple_note: null,
    };

    const dischargedRoomKey = roomKeyForRow(row);

    setSaving(true);
    const result = await trySaveWithServerRules(async () => {
      await api.put(`/census/${row.id}`, payload);
    });
    setSaving(false);

    if (!result.ok) return;

    setEditedFlags((prev) => {
      const copy = { ...prev };
      delete copy[row.id];
      return copy;
    });

    try {
      const fresh = await loadAndReturn();
      const sameRoom = fresh.filter((r) => String(roomKeyForRow(r)) === String(dischargedRoomKey));
      const active = sameRoom.filter((r) => isActiveInRoom(r.status));
      if (active.length === 1 && active[0]?.couple_override) {
        setSaving(true);
        const clearRes = await trySaveWithServerRules(async () => {
          await api.put(`/census/${active[0].id}`, { couple_override: false, couple_note: null });
        });
        setSaving(false);
        if (clearRes.ok) await load();
      }
    } catch (e) {
      console.warn("Post-discharge couple reset failed:", e);
      load();
    }
  }

  function markEdited(id, field) {
    setEditedFlags((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: true } }));
  }
  function clearEditedFor(id, field) {
    setEditedFlags((prev) => {
      const copy = { ...prev };
      if (!copy[id]) return prev;
      const next = { ...copy[id] };
      delete next[field];
      if (Object.keys(next).length === 0) {
        delete copy[id];
        return copy;
      }
      copy[id] = next;
      return copy;
    });
  }

  function pulseSaved(id) {
    const now = Date.now();
    setLastSavedAt((prev) => ({ ...prev, [id]: now }));
    if (toastTimers.current[id]) clearTimeout(toastTimers.current[id]);
    toastTimers.current[id] = setTimeout(() => {
      setLastSavedAt((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      delete toastTimers.current[id];
    }, 1100);
  }

  async function saveInlineField(bedRow, field, nextValue) {
    setRows((prev) =>
      prev.map((r) => {
        if (!idEq(r.id, bedRow.id)) return r;
        const updated = { ...r };
        if (field === "payer_source") updated.payer_source = nextValue || null;
        if (field === "care_type") {
          const careVal = nextValue || null;
          updated.care_type = careVal;
          if (!careAllowsDischarge(careVal)) updated.expected_discharge = null;
        }
        if (field === "expected_discharge") updated.expected_discharge = nextValue || null;
        return updated;
      })
    );

    setSaving(true);
    const result = await trySaveWithServerRules(async () => {
      const payload = {};
      if (field === "payer_source") payload.payer_source = nextValue || null;
      else if (field === "care_type") {
        payload.care_type = nextValue || null;
        if (!careAllowsDischarge(nextValue)) payload.expected_discharge = null;
      } else if (field === "expected_discharge") {
        payload.expected_discharge = careAllowsDischarge(bedRow.care_type) ? nextValue || null : null;
      }
      await api.put(`/census/${bedRow.id}`, payload);
    });
    setSaving(false);

    if (result.ok) {
      if (field === "care_type" && !careAllowsDischarge(nextValue)) clearEditedFor(bedRow.id, "expected_discharge");
      markEdited(bedRow.id, field);
      pulseSaved(bedRow.id);
    } else {
      load();
    }
  }

  function updateNoteDraft(bedRow, nextText) {
    setNoteDrafts((prev) => ({ ...prev, [bedRow.id]: nextText }));
    markEdited(bedRow.id, "private_pay_note");
    setRows((prev) => prev.map((r) => (idEq(r.id, bedRow.id) ? { ...r, private_pay_note: nextText } : r)));
  }

  async function flushRoomNoteEdits(roomLabel) {
    const bedsInRoom = rows.filter((r) => String(roomKeyForRow(r)) === String(roomLabel));
    const dirtyBeds = bedsInRoom.filter((b) => editedFlags?.[b.id]?.private_pay_note);
    if (dirtyBeds.length === 0) return { ok: true };

    setSaving(true);
    for (const b of dirtyBeds) {
      const nextText = noteDrafts[b.id] ?? String(b.private_pay_note ?? "");
      const toSave = String(nextText ?? "");

      const result = await trySaveWithServerRules(async () => {
        await api.put(`/census/${b.id}`, { private_pay_note: toSave });
      });

      if (!result.ok) {
        setSaving(false);
        await load();
        return { ok: false };
      }

      clearEditedFor(b.id, "private_pay_note");
      pulseSaved(b.id);
    }
    setSaving(false);
    return { ok: true };
  }

  async function onBedClick(b, roomIsInEditMode) {
    const s = normStatus(b.status);

    if (s === "empty") {
      // ✅ Admit: open modal without crashing
      setSelected({ mode: "edit", fromEmpty: true, row: normalizeRowForEmptyModal(b) });
      return;
    }

    if (roomIsInEditMode) return;

    const newStatus = s === "occupied" ? "leave" : "occupied";

    setSaving(true);
    const result = await trySaveWithServerRules(async () => {
      await api.put(`/census/${b.id}`, { status: newStatus });
    });
    setSaving(false);

    if (result.ok) load();
  }

  function openMove(fromRow) {
    setMoveModal({ fromId: String(fromRow.id), toId: "" });
  }

  async function commitMoveOrSwap() {
    if (!moveModal?.fromId || !moveModal?.toId) return;

    const from = rows.find((r) => idEq(r.id, moveModal.fromId));
    const to = rows.find((r) => idEq(r.id, moveModal.toId));
    if (!from || !to) {
      alert("Could not find the selected beds. Try refresh.");
      return;
    }

    const fromIsEmpty = normStatus(from.status) === "empty";
    if (fromIsEmpty) return alert("Cannot move: source bed is empty.");

    const toIsEmpty = normStatus(to.status) === "empty";
    const shouldSwap = !toIsEmpty;

    const pickResidentFields = (r) => ({
      status: normStatus(r.status),
      payer_source: r.payer_source || null,
      care_type: r.care_type || null,
      admit_date: r.admit_date || null,
      expected_discharge: careAllowsDischarge(r.care_type) ? (r.expected_discharge || null) : null,
      patient_label: String(r.patient_label || "").trim() || null,
      private_pay_note: String(r.private_pay_note ?? ""),
      patient_gender: r.patient_gender || "Unknown",
      couple_override: !!r.couple_override,
      couple_note: String(r.couple_note || "").trim() || null,
    });

    const fromPayload = pickResidentFields(from);
    const toPayload = pickResidentFields(to);

    const emptyPayload = {
      status: "empty",
      payer_source: null,
      care_type: null,
      admit_date: null,
      expected_discharge: null,
      patient_label: null,
      private_pay_note: "",
      patient_gender: "Unknown",
      couple_override: false,
      couple_note: null,
    };

    setSaving(true);

    setRows((prev) =>
      prev.map((r) => {
        if (idEq(r.id, to.id)) return { ...r, ...fromPayload };
        if (idEq(r.id, from.id)) return { ...r, ...(shouldSwap ? toPayload : emptyPayload) };
        return r;
      })
    );

    const step1 = await trySaveWithServerRules(async () => {
      await api.put(`/census/${to.id}`, fromPayload);
    });

    if (step1.needsOverride) {
      setOverrideModal((m) => ({ ...m, payloadBase: fromPayload, editingId: to.id }));
      setSaving(false);
      setMoveModal(null);
      return;
    }
    if (!step1.ok) {
      setSaving(false);
      setMoveModal(null);
      await load();
      return;
    }

    const step2 = await trySaveWithServerRules(async () => {
      await api.put(`/census/${from.id}`, shouldSwap ? toPayload : emptyPayload);
    });

    if (step2.needsOverride) {
      setOverrideModal((m) => ({ ...m, payloadBase: shouldSwap ? toPayload : emptyPayload, editingId: from.id }));
      setSaving(false);
      setMoveModal(null);
      return;
    }

    if (!step2.ok) {
      setSaving(false);
      setMoveModal(null);
      await load();
      return;
    }

    setSaving(false);
    setMoveModal(null);
    await load();
  }

  const groupedAll = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = roomKeyForRow(r);
      if (!map.has(key)) map.set(key, { roomLabel: key, beds: [] });
      map.get(key).beds.push(r);
    }

    return Array.from(map.values())
      .sort((a, b) => numSort(a.roomLabel, b.roomLabel))
      .map((g) => ({
        ...g,
        beds: g.beds.sort((x, y) =>
          String(x.bed || "").localeCompare(String(y.bed || ""), undefined, { numeric: true })
        ),
        roomGender: roomDerivedGender(g.beds),
      }));
  }, [rows]);

  // Room filter removed; only status filter remains
  const grouped = useMemo(() => {
    const wanted = statusFilter === "ALL" ? null : statusFilter;
    return groupedAll
      .map((g) => {
        if (!wanted) return g;
        const beds = g.beds.filter((b) => normStatus(b.status) === wanted);
        return { ...g, beds };
      })
      .filter((g) => (g.beds || []).length > 0);
  }, [groupedAll, statusFilter]);

  const stats = useMemo(() => computeStats(rows), [rows]);

  const payerEntries = useMemo(() => {
    const ordered = [];
    for (const p of PAYER_OPTIONS) ordered.push([p, stats.payerMap[p] ?? 0]);
    for (const [k, v] of Object.entries(stats.payerMap)) {
      if (PAYER_OPTIONS.includes(k)) continue;
      ordered.push([k, v]);
    }
    return ordered.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  }, [stats.payerMap]);

  const careEntries = useMemo(() => {
    const ordered = [];
    for (const c of CARE_OPTIONS) ordered.push([c, stats.careMap[c] ?? 0]);
    for (const [k, v] of Object.entries(stats.careMap)) {
      if (CARE_OPTIONS.includes(k)) continue;
      ordered.push([k, v]);
    }
    return ordered.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  }, [stats.careMap]);

  const showIdentifiers = canShowIdentifiers();

  function toggleStatusFilter(next) {
    setStatusFilter((prev) => (prev === next ? "ALL" : next));
  }

  function beginRoomEdit(roomLabel) {
    const bedsInRoom = rows.filter((r) => String(roomKeyForRow(r)) === String(roomLabel));
    const drafts = {};
    for (const b of bedsInRoom) drafts[b.id] = String(b.private_pay_note ?? "");
    setNoteDrafts((prev) => ({ ...prev, ...drafts }));
    setRoomEditOpen(roomLabel);
  }

  async function endRoomEdit(roomLabel) {
    const res = await flushRoomNoteEdits(roomLabel);
    if (res.ok) setRoomEditOpen(null);
  }

  function openReportModal() {
    setReportModal({
      includeRoom: true,
      includeBed: true,
      includeStatus: true,
      includePayer: true,
      includeCare: true,
      includeGender: true,
      includeAdmit: true,
      includeDc: true,
      includeNote: true,
      includeLabel: showIdentifiers,
    });
  }

  // ✅ Print via hidden iframe to avoid popup blockers
  function runReportPrint(opts) {
    const html = buildReportHtml({
      orgName,
      generatedAtISO: new Date().toLocaleString(),
      rows,
      options: opts,
      statusFilter,
    });

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      alert("Could not generate report frame.");
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error(e);
        alert("Print failed (browser blocked it).");
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    }, 150);
  }

  function runReportSave(opts) {
    const html = buildReportHtml({
      orgName,
      generatedAtISO: new Date().toLocaleString(),
      rows,
      options: opts,
      statusFilter,
    });

    const safeOrg = String(orgName || "Org").replaceAll(/[^a-z0-9-_ ]/gi, "").trim() || "Org";
    const safeDateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`ShiftCensus_Report_${safeOrg}_${safeDateStr}.html`, html, "text/html;charset=utf-8");
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <div style={styles.headerArea}>
          <div style={styles.headerRow}>
            <div style={styles.brandTextOnly}>
              <div style={styles.title}>Census</div>
              <div style={styles.subtitle}>{orgName}</div>
            </div>

            <div style={styles.headerRight}>
              <div style={styles.counterRow}>
                <button
                  type="button"
                  style={styles.counterPill(statusFilter === "occupied", "occ")}
                  onClick={() => toggleStatusFilter("occupied")}
                  aria-pressed={statusFilter === "occupied"}
                >
                  <span style={styles.counterLabel}>Occ</span>
                  <span style={styles.counterValue}>{stats.occupied}</span>
                </button>

                <button
                  type="button"
                  style={styles.counterPill(statusFilter === "leave", "leave")}
                  onClick={() => toggleStatusFilter("leave")}
                  aria-pressed={statusFilter === "leave"}
                >
                  <span style={styles.counterLabel}>Leave</span>
                  <span style={styles.counterValue}>{stats.leave}</span>
                </button>

                <button
                  type="button"
                  style={styles.counterPill(statusFilter === "empty", "empty")}
                  onClick={() => toggleStatusFilter("empty")}
                  aria-pressed={statusFilter === "empty"}
                >
                  <span style={styles.counterLabel}>Empty</span>
                  <span style={styles.counterValue}>{stats.empty}</span>
                </button>

                <div style={{ ...styles.counterChip, ...styles.counterTotal }}>
                  <span style={styles.counterLabel}>Total</span>
                  <span style={styles.counterValue}>{stats.total}</span>
                </div>
              </div>

              <div style={styles.controlsRow}>
                <button
                  type="button"
                  style={styles.reportBtn}
                  onClick={openReportModal}
                  disabled={saving}
                  title="Run a printable report"
                >
                  Run Report
                </button>

                <button
                  type="button"
                  style={styles.insightsPill(insightsOpen)}
                  onClick={() => setInsightsOpen((s) => !s)}
                  aria-pressed={insightsOpen}
                >
                  Insights {insightsOpen ? "✓" : ""}
                </button>

                <button type="button" style={styles.tinyBtn(false)} onClick={load} disabled={saving}>
                  {saving ? "..." : "Refresh"}
                </button>
              </div>
            </div>
          </div>

          {insightsOpen ? (
            <div style={styles.insightsWrap}>
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Payer (Occupied Only)</div>
                <div style={styles.pillGrid}>
                  {payerEntries.map(([k, v]) => (
                    <InsightPill key={k} label={k} value={v} />
                  ))}
                </div>
              </div>

              <div style={styles.panel}>
                <div style={styles.panelTitle}>Care Type (Occupied Only)</div>
                <div style={styles.pillGrid}>
                  {careEntries.map(([k, v]) => (
                    <InsightPill key={k} label={k} value={v} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* BOARD */}
        <div style={styles.boardArea}>
          <div style={styles.boardCard}>
            <div style={styles.boardHeader}>
              <div>
                <div style={styles.boardTitle}>Bed Board</div>
                <div style={styles.boardSub}>
                  Empty opens admit. Occupied/leave toggles with one tap (when not in room edit mode).
                </div>
              </div>
            </div>

            {grouped.length === 0 ? (
              <div style={styles.empty}>No beds match your current filters. (Try clearing status filters.)</div>
            ) : (
              <div style={styles.boardScroll}>
                <div style={styles.roomGrid}>
                  {grouped.map((g) => {
                    const isEditOpen = roomEditOpen === g.roomLabel;
                    const badge = genderBadgeMeta(g.roomGender);

                    return (
                      <div key={g.roomLabel} style={styles.roomCard}>
                        <div style={styles.roomHeader}>
                          <div style={styles.roomLeft}>
                            <div style={styles.roomName}>
                              Room {g.roomLabel}
                              <span style={styles.roomGenderPill()}>
                                <span style={styles.roomGenderDot(styles[badge.ring])} />
                                {badge.label}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            style={styles.roomGearBtn(isEditOpen)}
                            onClick={async () => {
                              if (!isEditOpen) return beginRoomEdit(g.roomLabel);
                              await endRoomEdit(g.roomLabel);
                            }}
                            title={isEditOpen ? "Save & lock room (exit edit mode)" : "Edit room"}
                            disabled={saving}
                          >
                            {isEditOpen ? "💾" : "⚙️"}
                          </button>
                        </div>

                        <div style={styles.roomContentWrap}>
                          <div style={styles.bedGridFixed4}>
                            {g.beds.map((b) => {
                              const roomIsInEditMode = isEditOpen;

                              const pb = genderBadgeMeta(normGender(b.patient_gender));
                              const s = normStatus(b.status);
                              const isEmpty = s === "empty";

                              const showSavedToast = !!lastSavedAt[b.id];
                              const eligibleDc = !isEmpty && careAllowsDischarge(b.care_type);

                              return (
                                <div
                                  key={b.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => onBedClick(b, roomIsInEditMode)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      onBedClick(b, roomIsInEditMode);
                                    }
                                  }}
                                  style={bedStyle(b.status, pb, roomIsInEditMode)}
                                >
                                  {showSavedToast ? <div style={styles.savedToast}>Saved ✓</div> : null}

                                  {roomIsInEditMode && !isEmpty ? (
                                    <div style={styles.bedToolsRow}>
                                      <button
                                        type="button"
                                        style={styles.bedMoveBtn}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openMove(b);
                                        }}
                                        disabled={saving}
                                      >
                                        Move
                                      </button>

                                      <button
                                        type="button"
                                        style={styles.bedDischargeBtn}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          dischargeBed(b);
                                        }}
                                        disabled={saving}
                                      >
                                        Discharge
                                      </button>
                                    </div>
                                  ) : null}

                                  <div style={styles.bedHead}>
                                    <div style={styles.bedLabel}>
                                      {String(g.roomLabel)}
                                      {String(b.bed || "").toUpperCase()}
                                    </div>

                                    <div style={styles.badgeRow}>
                                      <span style={styles.statusPill(s)}>{statusLabel(s)}</span>
                                      <div style={styles.genderBadge(pb)} title={`Gender: ${pb.label}`}>
                                        {pb.short}
                                      </div>
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      ...styles.bedListCompact,
                                      ...(roomIsInEditMode
                                        ? { overflowY: "auto", maxHeight: 150, paddingRight: 2 }
                                        : {}),
                                    }}
                                  >
                                    <div style={styles.bedListRowCompact}>
                                      <span style={styles.bedListKey}>Payer</span>

                                      {roomIsInEditMode && !isEmpty ? (
                                        <select
                                          value={b.payer_source || ""}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={async (e) => {
                                            const next = e.target.value || null;
                                            await saveInlineField(b, "payer_source", next);
                                          }}
                                          style={styles.inlineSelectCompact}
                                          disabled={saving}
                                        >
                                          <option value="">—</option>
                                          {PAYER_OPTIONS.map((p) => (
                                            <option key={p} value={p}>
                                              {p}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span style={styles.bedListVal}>{isEmpty ? "—" : dash(b.payer_source)}</span>
                                      )}
                                    </div>

                                    <div style={styles.bedListRowCompact}>
                                      <span style={styles.bedListKey}>Care</span>

                                      {roomIsInEditMode && !isEmpty ? (
                                        <select
                                          value={b.care_type || ""}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={async (e) => {
                                            const next = e.target.value || null;
                                            await saveInlineField(b, "care_type", next);
                                          }}
                                          style={styles.inlineSelectCompact}
                                          disabled={saving}
                                        >
                                          <option value="">—</option>
                                          {CARE_OPTIONS.map((c) => (
                                            <option key={c} value={c}>
                                              {c}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span style={styles.bedListVal}>{isEmpty ? "—" : dash(b.care_type)}</span>
                                      )}
                                    </div>

                                    {eligibleDc ? (
                                      <div style={styles.bedListRowCompact}>
                                        <span style={styles.bedListKey}>DC</span>
                                        {roomIsInEditMode ? (
                                          <input
                                            type="date"
                                            value={safeDate(b.expected_discharge) || ""}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={async (e) => {
                                              const next = e.target.value || null;
                                              await saveInlineField(b, "expected_discharge", next);
                                            }}
                                            style={styles.inlineDateCompact}
                                            disabled={saving}
                                          />
                                        ) : (
                                          <span style={styles.bedListVal}>{safeDate(b.expected_discharge)}</span>
                                        )}
                                      </div>
                                    ) : null}

                                    <div style={styles.bedListRowCompact}>
                                      <span style={styles.bedListKey}>Note</span>

                                      {roomIsInEditMode && !isEmpty ? (
                                        <input
                                          value={noteDrafts[b.id] ?? String(b.private_pay_note ?? "")}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => updateNoteDraft(b, e.target.value)}
                                          style={styles.inlineNoteCompact}
                                          disabled={saving}
                                          placeholder="—"
                                        />
                                      ) : (
                                        <span style={styles.bedListVal}>
                                          {String(b.private_pay_note ?? "").trim() ? dash(b.private_pay_note) : "—"}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {showIdentifiers ? (
                                    <div style={styles.bedPatient}>{isEmpty ? "—" : dash(b.patient_label)}</div>
                                  ) : (
                                    <div style={styles.bedPatientFiller} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODALS */}
        {selected ? (
          <div style={styles.modalOverlay} onMouseDown={() => setSelected(null)}>
            <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>{selected.fromEmpty ? "Admit Resident" : "Edit Bed"}</div>

              <div style={styles.modalGrid}>
                <div>
                  <div style={styles.modalLabel}>Payer Source *</div>
                  <select
                    value={selected.row.payer_source || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, row: { ...selected.row, payer_source: e.target.value } })
                    }
                    style={styles.select}
                  >
                    <option value="">Select…</option>
                    {PAYER_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.modalLabel}>Care Type *</div>
                  <select
                    value={selected.row.care_type || ""}
                    onChange={(e) => {
                      const nextCare = e.target.value;
                      setSelected((prev) => {
                        const nextRow = { ...prev.row, care_type: nextCare };
                        if (!careAllowsDischarge(nextCare)) nextRow.expected_discharge = "";
                        return { ...prev, row: nextRow };
                      });
                    }}
                    style={styles.select}
                  >
                    <option value="">Select…</option>
                    {CARE_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.modalLabel}>Gender *</div>
                  <select
                    value={selected.row.patient_gender || "Unknown"}
                    onChange={(e) =>
                      setSelected({ ...selected, row: { ...selected.row, patient_gender: e.target.value } })
                    }
                    style={styles.select}
                  >
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.modalLabel}>Name / Label (optional)</div>
                  <input
                    value={selected.row.patient_label || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, row: { ...selected.row, patient_label: e.target.value } })
                    }
                    style={styles.input}
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <div style={styles.modalLabel}>Admit Date *</div>
                  <input
                    type="date"
                    value={selected.row.admit_date || ""}
                    onChange={(e) => setSelected({ ...selected, row: { ...selected.row, admit_date: e.target.value } })}
                    style={styles.input}
                  />
                </div>

                {careAllowsDischarge(selected.row.care_type) ? (
                  <div>
                    <div style={styles.modalLabel}>Expected Discharge (optional)</div>
                    <input
                      type="date"
                      value={selected.row.expected_discharge || ""}
                      onChange={(e) =>
                        setSelected({ ...selected, row: { ...selected.row, expected_discharge: e.target.value } })
                      }
                      style={styles.input}
                    />
                  </div>
                ) : null}

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={styles.modalLabel}>Note (optional)</div>
                  <input
                    value={selected.row.private_pay_note || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, row: { ...selected.row, private_pay_note: e.target.value } })
                    }
                    style={styles.input}
                    placeholder="Optional…"
                  />
                </div>
              </div>

              <div style={styles.modalActions}>
                <button style={styles.ghostBtn} onClick={() => setSelected(null)} disabled={saving}>
                  Cancel
                </button>
                <button style={styles.primaryBtn} onClick={saveModal} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* MOVE / SWAP MODAL */}
        {moveModal ? (
          <div style={styles.modalOverlay} onMouseDown={() => setMoveModal(null)}>
            <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Move / Swap Resident</div>

              <div style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.5 }}>
                Pick a destination bed. If it’s occupied/on-leave, we’ll swap the two residents.
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={styles.modalLabel}>Destination Bed</div>
                <select
                  value={moveModal.toId}
                  onChange={(e) => setMoveModal((m) => ({ ...m, toId: e.target.value }))}
                  style={styles.select}
                >
                  <option value="">Select…</option>
                  {rows
                    .slice()
                    .sort((a, b) => {
                      const ra = roomKeyForRow(a);
                      const rb = roomKeyForRow(b);
                      const c = numSort(ra, rb);
                      if (c !== 0) return c;
                      return String(a.bed || "").localeCompare(String(b.bed || ""), undefined, { numeric: true });
                    })
                    .map((r) => {
                      const label = `Room ${roomKeyForRow(r)} • Bed ${String(r.bed || "").toUpperCase()} • ${statusLabel(
                        r.status
                      )}`;
                      return (
                        <option key={r.id} value={String(r.id)} disabled={idEq(r.id, moveModal.fromId)}>
                          {label}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div style={styles.modalActions}>
                <button style={styles.ghostBtn} onClick={() => setMoveModal(null)} disabled={saving}>
                  Cancel
                </button>
                <button style={styles.primaryBtn} onClick={commitMoveOrSwap} disabled={saving || !moveModal.toId}>
                  {saving ? "Working..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* REPORT MODAL */}
        {reportModal ? (
          <div style={styles.modalOverlay} onMouseDown={() => setReportModal(null)}>
            <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Run Report</div>

              <div style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.5 }}>
                Choose what to include. Report respects the current status filter (
                {statusFilter === "ALL" ? "All" : statusLabel(statusFilter)}).
              </div>

              <div style={styles.reportOptionsGrid}>
                <ReportToggle
                  label="Rooms"
                  checked={reportModal.includeRoom}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeRoom: v }))}
                />
                <ReportToggle
                  label="Beds"
                  checked={reportModal.includeBed}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeBed: v }))}
                />
                <ReportToggle
                  label="Status"
                  checked={reportModal.includeStatus}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeStatus: v }))}
                />
                <ReportToggle
                  label="Payer"
                  checked={reportModal.includePayer}
                  onChange={(v) => setReportModal((m) => ({ ...m, includePayer: v }))}
                />
                <ReportToggle
                  label="Care Type"
                  checked={reportModal.includeCare}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeCare: v }))}
                />
                <ReportToggle
                  label="Gender"
                  checked={reportModal.includeGender}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeGender: v }))}
                />
                <ReportToggle
                  label="Admit Date"
                  checked={reportModal.includeAdmit}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeAdmit: v }))}
                />
                <ReportToggle
                  label="Expected DC"
                  checked={reportModal.includeDc}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeDc: v }))}
                />
                <ReportToggle
                  label="Note"
                  checked={reportModal.includeNote}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeNote: v }))}
                />
                <ReportToggle
                  label="Name/Label"
                  checked={reportModal.includeLabel}
                  onChange={(v) => setReportModal((m) => ({ ...m, includeLabel: v }))}
                  disabled={!showIdentifiers}
                  hint={!showIdentifiers ? "No labels present" : ""}
                />
              </div>

              <div style={styles.modalActions}>
                <button style={styles.ghostBtn} onClick={() => setReportModal(null)} disabled={saving}>
                  Cancel
                </button>

                <button
                  style={styles.ghostBtn}
                  onClick={() => runReportSave(reportModal)}
                  disabled={saving || (!reportModal.includeRoom && !reportModal.includeBed && !reportModal.includeStatus)}
                  title="Downloads an .html report you can open/print anytime"
                >
                  Save
                </button>

                <button
                  style={styles.primaryBtn}
                  onClick={() => runReportPrint(reportModal)}
                  disabled={saving || (!reportModal.includeRoom && !reportModal.includeBed && !reportModal.includeStatus)}
                  title="Prints the report"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Override modal */}
        {overrideModal ? (
          <div style={styles.modalOverlay} onMouseDown={() => setOverrideModal(null)}>
            <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
              <div style={styles.modalTitle}>Warning: Gender mismatch</div>

              <div style={{ color: "#E5E7EB", fontSize: 13, lineHeight: 1.5 }}>
                {overrideModal?.serverDetails?.message ||
                  "This room currently has an active resident of the opposite gender (occupied/on leave)."}
                <div style={{ marginTop: 10, color: "#9CA3AF" }}>
                  If this is a married couple / exception, confirm override below.
                  <br />
                  <b>Note:</b> Couple rooms will be locked from additional roommates.
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={overrideModal.coupleOverride}
                    onChange={(e) => setOverrideModal({ ...overrideModal, coupleOverride: e.target.checked })}
                  />
                  <span style={{ color: "white", fontWeight: 700 }}>Couple/Exception Override</span>
                </label>

                <div style={{ marginTop: 10 }}>
                  <div style={styles.modalLabel}>Exception Note (optional but recommended)</div>
                  <input
                    style={styles.input}
                    value={overrideModal.coupleNote}
                    onChange={(e) => setOverrideModal({ ...overrideModal, coupleNote: e.target.value })}
                    placeholder='Example: "Married couple"'
                  />
                </div>

                <div style={{ marginTop: 10, color: "#9CA3AF", fontSize: 12 }}>
                  This exception note is <b>not</b> the same as the bed “Note”.
                </div>
              </div>

              <div style={styles.modalActions}>
                <button style={styles.ghostBtn} onClick={() => setOverrideModal(null)}>
                  Cancel
                </button>

                <button
                  style={styles.primaryBtn}
                  onClick={async () => {
                    if (!overrideModal.payloadBase) {
                      setOverrideModal(null);
                      return;
                    }

                    const payload = {
                      ...overrideModal.payloadBase,
                      couple_override: !!overrideModal.coupleOverride,
                      couple_note: String(overrideModal.coupleNote || "").trim() || null,
                    };

                    setSaving(true);
                    try {
                      await api.put(`/census/${overrideModal.editingId}`, payload);
                      setOverrideModal(null);
                      setSelected(null);
                      load();
                    } catch (err) {
                      if (err?.status === 409 && err?.body?.error === "ROOM_LOCKED") {
                        alert(err?.body?.details?.message || "This room is locked for a couple.");
                      } else {
                        alert(err?.message || "Failed to save with override.");
                      }
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving || !overrideModal.coupleOverride}
                  title={!overrideModal.coupleOverride ? "Enable override to proceed" : ""}
                >
                  {saving ? "Saving..." : "Confirm Override"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReportToggle({ label, checked, onChange, disabled, hint }) {
  return (
    <label style={{ ...styles.reportToggle, ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}) }}>
      <input
        type="checkbox"
        checked={!!checked}
        disabled={!!disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span style={{ fontWeight: 900, color: "white" }}>{label}</span>
      {hint ? <span style={{ color: "#9CA3AF", fontSize: 12 }}>{hint}</span> : null}
    </label>
  );
}

function InsightPill({ label, value }) {
  return (
    <div style={styles.insightPill}>
      <div style={styles.insightPillLabel}>{label}</div>
      <div style={styles.insightPillVal}>{value}</div>
    </div>
  );
}

/**
 * 2x2 cards (no overlap) + prevent clipping:
 * - keep square in normal mode
 * - in edit mode allow growth
 * - boxSizing helps ensure shadows/borders don't push layout
 */
function bedStyle(status, patientBadgeMeta, isEditMode) {
  const s = String(status || "empty").toLowerCase().trim();

  const bg =
    s === "occupied"
      ? "rgba(34,211,238,0.10)"
      : s === "leave"
      ? "rgba(251,191,36,0.10)"
      : "rgba(255,255,255,0.03)";

  const border =
    s === "occupied"
      ? "1px solid rgba(34,211,238,0.28)"
      : s === "leave"
      ? "1px solid rgba(251,191,36,0.28)"
      : "1px solid rgba(255,255,255,0.08)";

  const genderGlow =
    patientBadgeMeta.ring === "ringM"
      ? "0 0 0 1px rgba(59,130,246,0.16) inset"
      : patientBadgeMeta.ring === "ringF"
      ? "0 0 0 1px rgba(236,72,153,0.16) inset"
      : "0 0 0 1px rgba(156,163,175,0.12) inset";

  return {
    position: "relative",
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    ...(isEditMode ? {} : { aspectRatio: "1 / 1" }),

    textAlign: "left",
    padding: 10,
    borderRadius: 18,
    cursor: "pointer",
    background: bg,
    border,
    color: "white",
    boxShadow: `0 10px 28px rgba(0,0,0,0.26), ${genderGlow}`,
    overflow: "hidden",
    outline: "none",
    display: "flex",
    flexDirection: "column",
    ...(isEditMode ? { minHeight: 210 } : {}),
  };
}

const styles = {
  page: { height: "100vh", overflow: "hidden", padding: 14, color: "white" },
  container: {
    height: "100%",
    minHeight: 0,
    maxWidth: 1500,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  headerArea: {
    flex: "0 0 auto",
    position: "sticky",
    top: 0,
    zIndex: 20,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.70)",
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: 10,
  },

  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    minWidth: 0,
  },

  counterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  },

  controlsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    minWidth: 0,
  },

  counterChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.26)",
    whiteSpace: "nowrap",
  },

  counterPill: (active, tone) => {
    const baseBorder =
      tone === "occ"
        ? "rgba(34,211,238,0.35)"
        : tone === "leave"
        ? "rgba(251,191,36,0.35)"
        : tone === "empty"
        ? "rgba(156,163,175,0.32)"
        : "rgba(255,255,255,0.20)";

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      cursor: "pointer",
      whiteSpace: "nowrap",
      background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? baseBorder : "rgba(255,255,255,0.10)"}`,
      boxShadow: "0 10px 26px rgba(0,0,0,0.26)",
    };
  },

  counterLabel: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#A3A3A3",
  },

  counterValue: {
    fontSize: 14,
    fontWeight: 1000,
    color: "white",
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },

  counterTotal: { border: "1px solid rgba(255,255,255,0.16)" },

  brandTextOnly: { minWidth: 200 },
  title: { fontSize: 18, fontWeight: 950, letterSpacing: "-0.02em", lineHeight: 1.1 },
  subtitle: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 260,
  },

  reportBtn: {
    height: 36,
    borderRadius: 12,
    padding: "8px 12px",
    fontWeight: 1000,
    cursor: "pointer",
    fontSize: 12,
    color: "white",
    background: "rgba(16,185,129,0.14)",
    border: "1px solid rgba(16,185,129,0.35)",
    whiteSpace: "nowrap",
  },

  tinyBtn: (active) => ({
    height: 36,
    borderRadius: 12,
    padding: "8px 12px",
    fontWeight: 950,
    cursor: "pointer",
    fontSize: 12,
    color: "white",
    background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  }),

  insightsPill: (active) => ({
    height: 36,
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 950,
    cursor: "pointer",
    fontSize: 12,
    color: "white",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    whiteSpace: "nowrap",
  }),

  insightsWrap: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 10,
  },

  panel: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
    boxShadow: "0 10px 36px rgba(0,0,0,0.32)",
    padding: 12,
  },

  panelTitle: { fontSize: 13, fontWeight: 950 },

  pillGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },

  insightPill: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  insightPillLabel: { fontSize: 12, color: "#E5E7EB", fontWeight: 900 },
  insightPillVal: { fontSize: 14, color: "white", fontWeight: 1000 },

  ringM: { background: "rgba(59,130,246,0.9)" },
  ringF: { background: "rgba(236,72,153,0.9)" },
  ringN: { background: "rgba(156,163,175,0.9)" },

  boardArea: { flex: "1 1 auto", minHeight: 0, overflow: "hidden" },

  boardCard: {
    height: "100%",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
    boxShadow: "0 14px 52px rgba(0,0,0,0.40)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },

  boardHeader: { flex: "0 0 auto", paddingBottom: 10 },
  boardTitle: { fontSize: 14, fontWeight: 950 },
  boardSub: { marginTop: 6, fontSize: 12, color: "#9CA3AF" },

  boardScroll: {
    flex: "1 1 auto",
    minHeight: 0,
    overflow: "auto",
    paddingRight: 6,
    paddingBottom: 6,
    WebkitOverflowScrolling: "touch",
  },

  empty: { color: "#9CA3AF", fontSize: 13, padding: 10 },

  roomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 12,
    alignItems: "start",
  },

  roomCard: {
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 12,
    overflow: "visible",
    minWidth: 0,
  },

  roomHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },

  roomLeft: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
  roomName: {
    fontWeight: 950,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  roomGenderPill: () => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "#E5E7EB",
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  }),

  roomGenderDot: (dotStyle) => ({
    width: 10,
    height: 10,
    borderRadius: 999,
    background: dotStyle.background,
  }),

  roomGearBtn: (active) => ({
    background: active ? "rgba(255,255,255,0.06)" : "transparent",
    border: active ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.10)",
    color: "white",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    height: 40,
    flex: "0 0 auto",
  }),

  roomContentWrap: { overflow: "visible", borderRadius: 14, padding: 2, minWidth: 0 },

  bedGridFixed4: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    alignItems: "start",
    minWidth: 0,
  },

  bedToolsRow: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    marginBottom: 8,
    flex: "0 0 auto",
  },

  bedMoveBtn: {
    background: "rgba(59,130,246,0.12)",
    border: "1px solid rgba(59,130,246,0.45)",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    color: "white",
    fontSize: 12,
    fontWeight: 950,
    lineHeight: 1,
  },

  bedDischargeBtn: {
    background: "rgba(147,51,234,0.12)",
    border: "1px solid rgba(147,51,234,0.45)",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    color: "white",
    fontSize: 12,
    fontWeight: 950,
    lineHeight: 1,
  },

  savedToast: {
    position: "absolute",
    top: 10,
    left: 10,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(16,185,129,0.18)",
    border: "1px solid rgba(16,185,129,0.35)",
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: 950,
    pointerEvents: "none",
    zIndex: 2,
  },

  bedHead: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", minWidth: 0 },
  bedLabel: { fontWeight: 1000, fontSize: 12, minWidth: 0 },

  badgeRow: { display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" },

  statusPill: (s) => {
    const base = {
      fontSize: 10,
      fontWeight: 950,
      padding: "5px 8px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.20)",
      color: "#E5E7EB",
      lineHeight: 1,
      whiteSpace: "nowrap",
    };
    if (s === "occupied") return { ...base, border: "1px solid rgba(34,211,238,0.30)" };
    if (s === "leave") return { ...base, border: "1px solid rgba(251,191,36,0.30)" };
    return base;
  },

  genderBadge: (pb) => ({
    width: 26,
    height: 26,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 1000,
    fontSize: 11,
    color: "white",
    border:
      pb.ring === "ringM"
        ? "1px solid rgba(59,130,246,0.50)"
        : pb.ring === "ringF"
        ? "1px solid rgba(236,72,153,0.50)"
        : "1px solid rgba(156,163,175,0.40)",
    background:
      pb.ring === "ringM"
        ? "rgba(59,130,246,0.14)"
        : pb.ring === "ringF"
        ? "rgba(236,72,153,0.14)"
        : "rgba(156,163,175,0.10)",
    flex: "0 0 auto",
  }),

  bedListCompact: {
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    flex: "1 1 auto",
  },

  bedListRowCompact: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.06)",
    minWidth: 0,
  },

  bedListKey: { fontSize: 10, color: "#9CA3AF", fontWeight: 900 },
  bedListVal: {
    fontSize: 10,
    color: "#E5E7EB",
    fontWeight: 900,
    textAlign: "right",
    maxWidth: "68%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },

  inlineSelectCompact: {
    height: 26,
    borderRadius: 12,
    padding: "4px 8px",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    fontWeight: 900,
    fontSize: 11,
    cursor: "pointer",
    maxWidth: 160,
  },

  inlineDateCompact: {
    height: 26,
    borderRadius: 12,
    padding: "4px 8px",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    fontWeight: 900,
    fontSize: 11,
    width: 150,
    maxWidth: "100%",
  },

  inlineNoteCompact: {
    height: 26,
    borderRadius: 12,
    padding: "4px 8px",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    fontWeight: 900,
    fontSize: 11,
    width: 160,
    maxWidth: "68%",
  },

  bedPatient: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: 1000,
    color: "white",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    flex: "0 0 auto",
  },

  bedPatientFiller: { marginTop: 8, height: 14, flex: "0 0 auto" },

  input: {
    width: "100%",
    padding: "12px 12px",
    background: "rgba(0,0,0,0.30)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    outline: "none",
  },

  select: {
    width: "100%",
    padding: "12px 12px",
    background: "rgba(0,0,0,0.30)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    outline: "none",
  },

  primaryBtn: {
    background: "white",
    color: "#0b0b0b",
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 950,
    cursor: "pointer",
    height: 46,
  },

  ghostBtn: {
    background: "transparent",
    color: "#E5E7EB",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },

  modal: {
    width: "min(900px, 100%)",
    background: "rgba(0,0,0,0.85)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 80px rgba(0,0,0,0.75)",
    backdropFilter: "blur(10px)",
  },

  modalTitle: { fontSize: 16, fontWeight: 950, marginBottom: 14 },

  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },

  modalLabel: { fontSize: 12, color: "#9CA3AF", marginBottom: 6 },

  modalActions: {
    marginTop: 16,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },

  reportOptionsGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  reportToggle: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    cursor: "pointer",
    userSelect: "none",
  },
};
