// src/pages/ShiftsPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";

// -----------------------------------------------------------
// SAFER DATE PARSER FOR DB TIMESTAMPS
// -----------------------------------------------------------
function safeParseDate(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return isNaN(dt.getTime()) ? null : dt;

  let iso = String(dt).trim();

  // Convert "2025-01-08 06:00:00+00" → "2025-01-08T06:00:00+00"
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
  }

  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function toYMD(date) {
  const d = date instanceof Date ? date : safeParseDate(date);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function formatPrettyDate(ymd) {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// -----------------------------------------------------------
// HTML ESCAPER (print-safe)
// -----------------------------------------------------------
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function ShiftsPage() {
  const { orgLogo, orgName, orgCode, orgId } = useUser();

  // DATA ----------------------------------------------------------
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [units, setUnits] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [organization, setOrganization] = useState(null);

  // UI state for loading/error
  const [orgNotReady, setOrgNotReady] = useState(false);
  const [lastLoadError, setLastLoadError] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterUnit, setFilterUnit] = useState("All");
  const [filterShiftType, setFilterShiftType] = useState("All");

  // Month being viewed
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const [activeDate, setActiveDate] = useState(null); // YYYY-MM-DD
  const [editingShift, setEditingShift] = useState(null);

  // Add / Edit form state
  const emptyForm = {
    staffId: "",
    date: "",
    unit: "",
    shiftType: "",
    assignmentNumber: "",
  };
  const [form, setForm] = useState(emptyForm);

  // Role colors
  const roleColors = {
    RN: "#4a90e2",
    LPN: "#ba68c8",
    CNA: "#00c853",
  };

  const availableRoles = ["RN", "LPN", "CNA"];

  // ----------------------------------------------------------------
  // LOAD DATA (FIXED)
  // ----------------------------------------------------------------
  const loadingRef = useRef(false);
  const intervalRef = useRef(null);

  async function loadPage() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLastLoadError("");

    let shiftRes = null;
    let staffRes = null;
    let unitsRes = null;
    let assignRes = null;

    try {
      const results = await Promise.all([
        api.get("/shifts"),
        api.get("/staff"),
        api.get("/units"),
        api.get("/assignments"),
      ]);

      shiftRes = results[0];
      staffRes = results[1];
      unitsRes = results[2];
      assignRes = results[3];
    } catch (err) {
      console.error("LOAD ERROR:", err);
      setLastLoadError(err?.message || "Load failed");
    } finally {
      loadingRef.current = false;
    }

    if (Array.isArray(shiftRes)) setShifts(shiftRes);
    if (Array.isArray(staffRes)) setStaff(staffRes);
    if (Array.isArray(unitsRes)) setUnits(unitsRes);
    if (Array.isArray(assignRes)) setAssignments(assignRes);
  }

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const hasOrgContext =
      (orgCode && String(orgCode).trim().length > 0) ||
      (orgId && String(orgId).trim().length > 0);

    if (!hasOrgContext) {
      setOrgNotReady(true);
      return;
    }

    setOrgNotReady(false);

    loadPage();

    intervalRef.current = setInterval(() => {
      loadPage();
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [orgCode, orgId]);

  // HELPERS -------------------------------------------------------
  function sameDay(d1, d2) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function formatMonthTitle(d) {
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  }

  // Infer shift type from role + start_local / start_time
  function getShiftTypeForShift(shift, role) {
    // Prefer explicit shiftType if your backend saves it
    if (shift.shiftType) return shift.shiftType;

    let hour = null;

    if (shift.start_local) {
      const [h] = String(shift.start_local).split(":");
      const parsed = parseInt(h, 10);
      hour = Number.isNaN(parsed) ? null : parsed;
    } else if (shift.start_time) {
      try {
        const d = safeParseDate(shift.start_time);
        hour = d ? d.getHours() : null;
      } catch {
        hour = null;
      }
    }

    if (hour === null || Number.isNaN(hour)) return "Unknown";

    const r = String(role || "").toUpperCase();

    // Nurses: Day vs Night
    if (r === "RN" || r === "LPN") return hour < 18 ? "Day" : "Night";

    // CNA: Day / Evening / Night
    if (hour < 14) return "Day";
    if (hour < 22) return "Evening";
    return "Night";
  }

  // ------------------------------
  // OVERTIME CALCULATIONS (RESTORED)
  // ------------------------------
  function calculateShiftHours(shift) {
    if (!shift.start_local || !shift.end_local) return 0;

    const [sHour] = String(shift.start_local).split(":").map(Number);
    const [eHour] = String(shift.end_local).split(":").map(Number);

    if (Number.isNaN(sHour) || Number.isNaN(eHour)) return 0;

    let duration = eHour - sHour;
    if (duration < 0) duration += 24;

    return duration;
  }

  function getWeekStart(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    const day = d.getDay(); // 0=Sunday
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return sunday.toISOString().slice(0, 10);
  }

  // Staff map
  const staffById = useMemo(() => {
    const map = {};
    (staff || []).forEach((s) => {
      if (!s) return;
      map[s.id] = s;
    });
    return map;
  }, [staff]);

  // FILTERED SHIFTS (for calendar view only) -----------------------
  const filteredShifts = useMemo(() => {
    return (shifts || []).filter((shift) => {
      if (!shift) return false;

      const worker = staffById[shift.staff_id];
      if (!worker) return false;

      const role = worker.role || shift.role;
      const shiftType = getShiftTypeForShift(shift, role);

      if (!shift.shift_date) return false;
      const startDate = new Date(shift.shift_date + "T00:00:00");
      if (isNaN(startDate.getTime())) return false;

      if (
        startDate.getFullYear() !== currentMonth.getFullYear() ||
        startDate.getMonth() !== currentMonth.getMonth()
      ) {
        return false;
      }

      if (
        searchTerm &&
        !worker.name?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      if (filterRole !== "All" && worker.role !== filterRole) return false;
      if (filterUnit !== "All" && shift.unit !== filterUnit) return false;
      if (filterShiftType !== "All" && shiftType !== filterShiftType) return false;

      return true;
    });
  }, [
    shifts,
    staffById,
    searchTerm,
    filterRole,
    filterUnit,
    filterShiftType,
    currentMonth,
  ]);

  // GROUP SHIFTS BY DAY (for calendar view) ------------------------
  const shiftsByDay = useMemo(() => {
    const map = {};
    filteredShifts.forEach((shift) => {
      if (!shift.shift_date) return;
      const dateKey = shift.shift_date;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(shift);
    });

    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => {
        const aTime = a.start_local || "";
        const bTime = b.start_local || "";
        return aTime.localeCompare(bTime);
      })
    );

    return map;
  }, [filteredShifts]);

  // CALENDAR GRID -------------------------------------------------
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const firstWeekday = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++)
      cells.push(new Date(year, month, day));
    return cells;
  }, [currentMonth]);

  // UNIQUE UNITS --------------------------------------------------
  const availableUnits = useMemo(() => {
    const set = new Set();
    (shifts || []).forEach((s) => s?.unit && set.add(s.unit));
    return Array.from(set);
  }, [shifts]);

  const anyShifts = (shifts || []).length > 0;

  // ASSIGNMENTS helpers ------------------------------------------
  function getAssignmentsForUnit(unitName) {
    if (!unitName) return [];
    return (assignments || []).filter((a) => a.unit === unitName);
  }

  const selectedStaff = useMemo(() => {
    const id = Number(form.staffId);
    if (!id) return null;
    return staffById[id] || null;
  }, [form.staffId, staffById]);

  const isSelectedCNA =
    String(selectedStaff?.role || "").toUpperCase() === "CNA";

  const unitAssignmentsForForm = useMemo(
    () => getAssignmentsForUnit(form.unit),
    [form.unit, assignments]
  );

  // ADD / EDIT MODAL HELPERS -------------------------------------
  function openAddModal(date) {
    const dateStr = date ? toYMD(date) : toYMD(new Date());
    setActiveDate(dateStr);
    setForm({
      staffId: "",
      date: dateStr,
      unit: "",
      shiftType: "",
      assignmentNumber: "",
    });
    setEditingShift(null);
    setAddModalOpen(true);
  }

  function openEditModal(shift) {
    const worker = staffById[shift.staff_id];
    const role = worker?.role || shift.role;
    const shiftType = getShiftTypeForShift(shift, role);

    setEditingShift(shift);
    setForm({
      staffId: String(shift.staff_id),
      date: shift.shift_date || "",
      unit: shift.unit || "",
      shiftType: shiftType === "Unknown" ? "" : shiftType,
      assignmentNumber: shift.assignment_number ?? "",
    });
    setEditModalOpen(true);
  }

  function closeAllModals() {
    setAddModalOpen(false);
    setEditModalOpen(false);
    setTemplateModalOpen(false);
    setEditingShift(null);
    setForm(emptyForm);
  }

  async function handleSubmitNewShift() {
    try {
      if (!form.staffId || !form.date || !form.unit || !form.shiftType) {
        alert("Please fill all required fields.");
        return;
      }
      const worker = staff.find((s) => s.id === Number(form.staffId));
      if (!worker) {
        alert("Invalid staff selection.");
        return;
      }

      const isCNA = String(worker.role || "").toUpperCase() === "CNA";
      if (isCNA && !form.assignmentNumber) {
        alert("CNA shifts require an assignment.");
        return;
      }

      const payload = {
        staff_id: worker.id,
        shift_date: form.date,
        unit: form.unit,
        shiftType: form.shiftType,
        assignment_number: isCNA ? Number(form.assignmentNumber) : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const created = await api.post("/shifts", payload);
      setShifts((prev) => [...prev, created]);
      closeAllModals();
    } catch (err) {
      console.error("ADD SHIFT ERROR:", err);
      alert(err?.message || "Error adding shift. See console for details.");
    }
  }

  async function handleSubmitEditShift() {
    if (!editingShift) return;

    try {
      if (!form.staffId || !form.date || !form.unit || !form.shiftType) {
        alert("Please fill all required fields.");
        return;
      }

      const worker = staff.find((s) => s.id === Number(form.staffId));
      if (!worker) {
        alert("Invalid staff selection.");
        return;
      }

      const isCNA = String(worker.role || "").toUpperCase() === "CNA";
      if (isCNA && !form.assignmentNumber) {
        alert("CNA shifts require an assignment.");
        return;
      }

      const payload = {
        staff_id: worker.id,
        shift_date: form.date,
        unit: form.unit,
        shiftType: form.shiftType,
        assignment_number: isCNA ? Number(form.assignmentNumber) : null,
        timezone:
          editingShift.timezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const updated = await api.put(`/shifts/${editingShift.id}`, payload);
      setShifts((prev) =>
        prev.map((s) => (s.id === editingShift.id ? updated : s))
      );
      closeAllModals();
    } catch (err) {
      console.error("EDIT SHIFT ERROR:", err);
      alert(err?.message || "Error updating shift. See console for details.");
    }
  }

  async function handleDeleteShift() {
    if (!editingShift?.id) return;
    const ok = window.confirm("Delete this shift?");
    if (!ok) return;

    try {
      await api.delete(`/shifts/${editingShift.id}`);
      setShifts((prev) => prev.filter((s) => s.id !== editingShift.id));
      closeAllModals();
    } catch (err) {
      console.error("DELETE SHIFT ERROR:", err);
      alert(err?.message || "Error deleting shift.");
    }
  }

  // TEMPLATE SYSTEM (v3) -----------------------------------------
  const [templates, setTemplates] = useState(() => {
    try {
      if (typeof window === "undefined") return [];
      const stored = window.localStorage.getItem("shift_templates_v3");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [templateGrid, setTemplateGrid] = useState({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateRoleFilter, setTemplateRoleFilter] = useState("All");
  const [templateWeekStart, setTemplateWeekStart] = useState("");
  const [templateWeeksCount, setTemplateWeeksCount] = useState(1);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "shift_templates_v3",
          JSON.stringify(templates)
        );
      }
    } catch {}
  }, [templates]);

  function buildEmptyGridFromStaff() {
    const grid = {};
    (staff || []).forEach((s) => {
      grid[s.id] = {
        staffId: s.id,
        unit: "",
        assignmentNumber: "",
        days: Array.from({ length: 7 }, () => ({
          active: false,
          shiftType: "Day",
        })),
      };
    });
    return grid;
  }

  function openTemplateModal() {
    if (activeTemplateId) {
      const tmpl = templates.find((t) => t.id === activeTemplateId);
      if (tmpl) {
        const base = buildEmptyGridFromStaff();
        tmpl.patterns.forEach((p) => {
          if (!base[p.staffId]) return;
          base[p.staffId] = {
            staffId: p.staffId,
            unit: p.unit || "",
            assignmentNumber: p.assignmentNumber || "",
            days:
              p.days && p.days.length === 7
                ? p.days
                : Array.from({ length: 7 }, () => ({
                    active: false,
                    shiftType: "Day",
                  })),
          };
        });
        setTemplateGrid(base);
        setTemplateName(tmpl.name);
      } else {
        setTemplateGrid(buildEmptyGridFromStaff());
        setTemplateName("");
      }
    } else {
      setTemplateGrid(buildEmptyGridFromStaff());
      setTemplateName("");
    }

    setTemplateWeekStart("");
    setTemplateWeeksCount(1);
    setTemplateModalOpen(true);
  }

  function updateTemplateCell(staffId, updater) {
    setTemplateGrid((prev) => {
      const existing =
        prev[staffId] || {
          staffId,
          unit: "",
          assignmentNumber: "",
          days: Array.from({ length: 7 }, () => ({
            active: false,
            shiftType: "Day",
          })),
        };
      return {
        ...prev,
        [staffId]:
          typeof updater === "function"
            ? updater(existing)
            : { ...existing, ...updater },
      };
    });
  }

  function handleChangeUnitForStaff(staffId, unitName) {
    updateTemplateCell(staffId, (row) => ({ ...row, unit: unitName }));
  }

  function handleChangeAssignmentForStaff(staffId, assignmentNumber) {
    updateTemplateCell(staffId, (row) => ({ ...row, assignmentNumber }));
  }

  function handleToggleDay(staffId, dayIndex) {
    updateTemplateCell(staffId, (row) => {
      const days = row.days.slice();
      const current = days[dayIndex] || { active: false, shiftType: "Day" };
      days[dayIndex] = { ...current, active: !current.active };
      return { ...row, days };
    });
  }

  function handleSetDayShiftType(staffId, dayIndex, shiftType) {
    updateTemplateCell(staffId, (row) => {
      const days = row.days.slice();
      const current = days[dayIndex] || { active: false, shiftType: "Day" };
      days[dayIndex] = { ...current, shiftType };
      return { ...row, days };
    });
  }

  function handleNewTemplate() {
    setActiveTemplateId(null);
    setTemplateName("");
    setTemplateGrid(buildEmptyGridFromStaff());
  }

  function handleSelectTemplate(id) {
    setActiveTemplateId(id);
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    const base = buildEmptyGridFromStaff();
    tmpl.patterns.forEach((p) => {
      if (!base[p.staffId]) return;
      base[p.staffId] = {
        staffId: p.staffId,
        unit: p.unit || "",
        assignmentNumber: p.assignmentNumber || "",
        days:
          p.days && p.days.length === 7
            ? p.days
            : Array.from({ length: 7 }, () => ({
                active: false,
                shiftType: "Day",
              })),
      };
    });
    setTemplateGrid(base);
    setTemplateName(tmpl.name);
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) {
      alert("Template needs a name.");
      return;
    }

    const patterns = Object.values(templateGrid)
      .filter((row) => row && row.days && row.days.some((d) => d.active))
      .map((row) => ({
        staffId: row.staffId,
        unit: row.unit || "",
        assignmentNumber: row.assignmentNumber || "",
        days: row.days.map((d) => ({
          active: !!d.active,
          shiftType: d.shiftType || "Day",
        })),
      }));

    if (patterns.length === 0) {
      alert("No staff have active days selected.");
      return;
    }

    if (activeTemplateId) {
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === activeTemplateId
            ? { ...t, name: templateName.trim(), patterns }
            : t
        )
      );
    } else {
      const newId = Date.now();
      setTemplates((prev) => [
        ...prev,
        { id: newId, name: templateName.trim(), patterns },
      ]);
      setActiveTemplateId(newId);
    }

    alert("Template saved.");
  }

  function handleDeleteTemplate() {
    if (!activeTemplateId) return;
    if (!window.confirm("Delete this template?")) return;

    setTemplates((prev) => prev.filter((t) => t.id !== activeTemplateId));
    setActiveTemplateId(null);
    setTemplateName("");
    setTemplateGrid(buildEmptyGridFromStaff());
  }

  async function handleApplyTemplate() {
    if (!templateWeekStart) {
      alert("Please choose a week start date.");
      return;
    }
    const tmpl = activeTemplateId
      ? templates.find((t) => t.id === activeTemplateId)
      : null;

    if (!tmpl) {
      alert("No template selected. Save and select a template first.");
      return;
    }

    const weeks = Math.max(1, Number(templateWeeksCount) || 1);
    const baseDate = new Date(templateWeekStart + "T00:00:00");

    const payloads = [];

    tmpl.patterns.forEach((pattern) => {
      const worker = staff.find((s) => s.id === pattern.staffId);
      if (!worker) return;

      pattern.days.forEach((day, idx) => {
        if (!day.active) return;

        for (let w = 0; w < weeks; w++) {
          const dayDate = new Date(baseDate);
          dayDate.setDate(baseDate.getDate() + w * 7 + idx);
          const ymd = toYMD(dayDate);

          const isCNA = String(worker.role || "").toUpperCase() === "CNA";

          payloads.push({
            staff_id: worker.id,
            shift_date: ymd,
            unit: pattern.unit || "",
            shiftType: day.shiftType || "Day",
            assignment_number:
              isCNA && pattern.assignmentNumber
                ? Number(pattern.assignmentNumber)
                : null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      });
    });

    if (payloads.length === 0) {
      alert("Nothing to apply from this template (no active days).");
      return;
    }

    try {
      const createdShifts = [];
      for (const payload of payloads) {
        const created = await api.post("/shifts", payload);
        createdShifts.push(created);
      }
      setShifts((prev) => [...prev, ...createdShifts]);
      alert("Template applied.");
    } catch (err) {
      console.error("APPLY TEMPLATE ERROR:", err);
      alert(err?.message || "Error applying template. See console for details.");
    }
  }

  const templateFilteredStaff = useMemo(() => {
    return (staff || []).filter((s) => {
      if (
        templateSearch &&
        !s.name.toLowerCase().includes(templateSearch.toLowerCase())
      ) {
        return false;
      }
      if (
        templateRoleFilter !== "All" &&
        s.role &&
        s.role !== templateRoleFilter
      ) {
        return false;
      }
      return true;
    });
  }, [staff, templateSearch, templateRoleFilter]);

  // ==============================================================
  // PRINT WHOLE MONTH (5 PAGES) — NO POPUPS
  // Pages:
  // 1) Day Nurses (RN/LPN)
  // 2) Night Nurses (RN/LPN)
  // 3) Day CNAs
  // 4) Evening CNAs
  // 5) Night CNAs
  // ==============================================================

  function buildMonthlyPrintHTML(year, monthIndex) {
    const monthTitle = new Date(year, monthIndex, 1).toLocaleDateString(
      "en-US",
      {
        month: "long",
        year: "numeric",
      }
    );

    const orgTitle = orgName || "Schedule";
    const printedAt = new Date().toLocaleString();

    // Collect entries for the month
    const dayNurses = [];
    const nightNurses = [];
    const dayCNAs = [];
    const eveCNAs = [];
    const nightCNAs = [];

    (shifts || []).forEach((shift) => {
      if (!shift?.shift_date) return;

      const d = new Date(shift.shift_date + "T00:00:00");
      if (isNaN(d.getTime())) return;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return;

      const worker = staffById[shift.staff_id];
      const role = String(worker?.role || shift.role || "").toUpperCase();
      const name = worker?.name || `Staff #${shift.staff_id}`;
      const unit = shift.unit || "";
      const assignment = shift.assignment_number
        ? String(shift.assignment_number)
        : "";

      const st = getShiftTypeForShift(shift, role); // Day / Evening / Night
      const shiftType =
        st === "Evening" ? "Evening" : st === "Night" ? "Night" : "Day";

      const row = {
        date: shift.shift_date,
        datePretty: formatPrettyDate(shift.shift_date),
        name,
        unit,
        assignment,
        role,
        shiftType,
      };

      const isNurse = role === "RN" || role === "LPN";
      const isCNA = role === "CNA";

      if (isNurse) {
        if (shiftType === "Night") nightNurses.push(row);
        else dayNurses.push(row); // everything not Night -> Day page
      } else if (isCNA) {
        if (shiftType === "Night") nightCNAs.push(row);
        else if (shiftType === "Evening") eveCNAs.push(row);
        else dayCNAs.push(row);
      }
    });

    // Sort: date then name
    function sortRows(arr) {
      return arr.sort((a, b) => {
        if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
        return String(a.name).localeCompare(String(b.name));
      });
    }

    sortRows(dayNurses);
    sortRows(nightNurses);
    sortRows(dayCNAs);
    sortRows(eveCNAs);
    sortRows(nightCNAs);

    // Group rows by date so we can add date header rows
    function groupByDate(rows) {
      const map = {};
      (rows || []).forEach((r) => {
        if (!map[r.date]) map[r.date] = [];
        map[r.date].push(r);
      });
      const orderedDates = Object.keys(map).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
      return { map, orderedDates };
    }

    const renderTable = (rows, showAssignment) => {
      if (!rows.length) {
        return `<div class="empty">No shifts scheduled.</div>`;
      }

      const { map, orderedDates } = groupByDate(rows);

      const colCount = showAssignment ? 4 : 3;

      const body = orderedDates
        .map((dateKey) => {
          const dateLabel = formatPrettyDate(dateKey);

          const dateHeader = `
            <tr class="dateRow">
              <td colspan="${colCount}">${escapeHtml(dateLabel)}</td>
            </tr>
          `;

          const lines = (map[dateKey] || [])
            .map(
              (r) => `
              <tr>
                <td class="col-date">${escapeHtml(r.datePretty)}</td>
                <td>${escapeHtml(r.name)}</td>
                <td class="col-unit">${escapeHtml(r.unit || "—")}</td>
                ${
                  showAssignment
                    ? `<td class="col-asg">${escapeHtml(
                        r.assignment || "—"
                      )}</td>`
                    : ``
                }
              </tr>
            `
            )
            .join("");

          return dateHeader + lines;
        })
        .join("");

      return `
        <table>
          <thead>
            <tr>
              <th class="col-date">Date</th>
              <th>Name</th>
              <th class="col-unit">Unit</th>
              ${showAssignment ? `<th class="col-asg">Assignment</th>` : ``}
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      `;
    };

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(orgTitle)} • ${escapeHtml(monthTitle)}</title>
  <style>
    @page { size: portrait; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#111; }
    .topbar { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px; }
    .org { font-size:20px; font-weight:900; }
    .sub { font-size:12px; color:#444; font-weight:700; }
    h2 { margin: 10px 0 8px; font-size:16px; }
    table { width:100%; border-collapse:collapse; }
    th, td { border:1px solid #d1d5db; padding:6px; font-size:12px; vertical-align:top; }
    th { background:#f3f4f6; text-transform:uppercase; letter-spacing:0.06em; font-size:11px; }
    .col-date { width: 34%; font-weight:800; }
    .col-unit { width: 22%; }
    .col-asg { width: 18%; }

    .dateRow td {
      background: #111827;
      color: #fff;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 11px;
      padding: 8px 6px;
    }

    .page { page-break-before: always; }
    .page:first-of-type { page-break-before: auto; }
    .empty { padding: 10px; border: 1px dashed #9ca3af; color:#374151; font-weight:700; }
    .tiny { margin-top:10px; font-size:10px; color:#6b7280; }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <div class="org">${escapeHtml(orgTitle)}</div>
      <div class="sub">${escapeHtml(monthTitle)} • Monthly Schedule</div>
    </div>
    <div class="sub">Printed: ${escapeHtml(printedAt)}</div>
  </div>

  <div class="page">
    <h2>Day Nurses (RN/LPN)</h2>
    ${renderTable(dayNurses, false)}
  </div>

  <div class="page">
    <h2>Night Nurses (RN/LPN)</h2>
    ${renderTable(nightNurses, false)}
  </div>

  <div class="page">
    <h2>Day CNAs</h2>
    ${renderTable(dayCNAs, true)}
  </div>

  <div class="page">
    <h2>Evening CNAs</h2>
    ${renderTable(eveCNAs, true)}
  </div>

  <div class="page">
    <h2>Night CNAs</h2>
    ${renderTable(nightCNAs, true)}
  </div>

  <div class="tiny">
    ShiftCensus • Do not include patient identifiers on posted schedules.
  </div>

  <script>
    window.onload = () => setTimeout(() => { window.focus(); window.print(); }, 60);
  </script>
</body>
</html>`;
  }

  function printMonth() {
    const year = currentMonth.getFullYear();
    const monthIndex = currentMonth.getMonth();
    const html = buildMonthlyPrintHTML(year, monthIndex);

    // ✅ NO POPUP: hidden iframe printing
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");

    iframe.srcdoc = html;

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("Print failed:", e);
        alert("Print failed. Check browser permissions.");
      } finally {
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 1000);
      }
    };

    document.body.appendChild(iframe);
  }

  // ==============================================================
  // TEMPLATE VIEW HELPERS
  // ==============================================================
  function getAssignmentsForUnitLocal(unitName) {
    return (assignments || []).filter((a) => a.unit === unitName);
  }

  // RENDER --------------------------------------------------------
  const isDark = true;
  const bgColor = "#050509";
  const textColor = "#ffffff";
  const calendarCellBg = "rgba(255,255,255,0.03)";

  return (
    <div
      style={{
        padding: "24px",
        minHeight: "100vh",
        background: bgColor,
        color: textColor,
        transition: "background 0.25s ease, color 0.25s ease",
        position: "relative",
      }}
    >
      {/* ORG NOT READY BANNER */}
      {orgNotReady && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
            color: textColor,
            fontWeight: 700,
          }}
        >
          Loading organization context… (waiting for org selection)
        </div>
      )}

      {/* ERROR BANNER */}
      {!!lastLoadError && !orgNotReady && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: textColor,
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span>Load error: {lastLoadError}</span>
          <button onClick={() => loadPage()} style={navButtonStyle}>
            Retry
          </button>
        </div>
      )}

      {/* PRINT BUTTON (NO POPUPS) */}
      <button
        onClick={printMonth}
        style={{
          position: "fixed",
          top: "90px",
          right: "28px",
          zIndex: 40,
          padding: "8px 14px",
          borderRadius: "999px",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
        title="Print the current month"
      >
        🖨 Print
      </button>

      <div style={{ marginBottom: "16px" }}>
        {orgLogo ? (
          <img
            src={orgLogo}
            alt={orgName || "Facility Logo"}
            style={{
              height: "100px",
              width: "auto",
              objectFit: "contain",
              marginBottom: "6px",
            }}
          />
        ) : (
          <h1 style={{ fontSize: "28px" }}>{orgName || "Shifts"}</h1>
        )}
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Org: {orgCode || "—"}{" "}
          {orgId ? `(${String(orgId).slice(0, 8)}…)` : ""}
        </div>
      </div>

      {!anyShifts && !orgNotReady && (
        <div style={{ opacity: 0.8, marginBottom: "16px", fontSize: "18px" }}>
          No shifts found — your database may be empty.
        </div>
      )}

      {/* FILTER BAR */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "16px",
          alignItems: "center",
        }}
      >
        {/* Month controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() =>
              setCurrentMonth(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
              )
            }
            style={navButtonStyle}
          >
            ◀
          </button>
          <div style={{ fontSize: "18px", fontWeight: 600 }}>
            {formatMonthTitle(currentMonth)}
          </div>
          <button
            onClick={() =>
              setCurrentMonth(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
              )
            }
            style={navButtonStyle}
          >
            ▶
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search staff..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            ...inputStyle,
            background: "rgba(0,0,0,0.5)",
            color: textColor,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        />

        {/* Role filter */}
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{
            ...selectStyle,
            background: "rgba(0,0,0,0.5)",
            color: textColor,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <option value="All">All Roles</option>
          {availableRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {/* Unit filter */}
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          style={{
            ...selectStyle,
            background: "rgba(0,0,0,0.5)",
            color: textColor,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <option value="All">All Units</option>
          {availableUnits.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        {/* Shift type filter */}
        <select
          value={filterShiftType}
          onChange={(e) => setFilterShiftType(e.target.value)}
          style={{
            ...selectStyle,
            background: "rgba(0,0,0,0.5)",
            color: textColor,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <option value="All">All Shift Types</option>
          <option value="Day">Day</option>
          <option value="Evening">Evening</option>
          <option value="Night">Night</option>
        </select>

        {/* Template button */}
        <button
          onClick={openTemplateModal}
          style={{
            ...navButtonStyle,
            background: "#2563eb",
          }}
        >
          Templates
        </button>
      </div>

      {/* WEEKDAY HEADERS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: "4px",
          marginBottom: "4px",
          fontSize: "12px",
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          opacity: 0.8,
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* CALENDAR GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: "6px",
          minHeight: "280px",
        }}
      >
        {calendarDays.map((date, idx) => {
          if (!date) {
            return (
              <div
                key={`blank-${idx}`}
                style={{
                  borderRadius: "8px",
                  padding: "6px",
                  minHeight: "60px",
                  background: calendarCellBg,
                }}
              />
            );
          }

          const key = date.toISOString().slice(0, 10);
          const dayShifts = shiftsByDay[key] || [];
          const isToday = sameDay(date, new Date());

          return (
            <div
              key={key}
              onClick={() => openAddModal(date)}
              style={{
                borderRadius: "8px",
                padding: "6px",
                minHeight: "80px",
                background: calendarCellBg,
                border: isToday
                  ? "1px solid rgba(59,130,246,0.9)"
                  : "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {/* Day number */}
              <div
                style={{
                  marginBottom: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px" }}>
                  {date.getDate()}
                </span>
                {dayShifts.length > 0 && (
                  <span style={{ fontSize: "10px", opacity: 0.7 }}>
                    {dayShifts.length} shift{dayShifts.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Shifts within the day */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  overflowY: "auto",
                  maxHeight: "120px",
                }}
              >
                {dayShifts.map((shift) => {
                  const worker = staffById[shift.staff_id];
                  const role = worker?.role || shift.role || "STAFF";
                  const roleUpper = String(role).toUpperCase();
                  const shiftType = getShiftTypeForShift(shift, roleUpper);
                  const roleColor = roleColors[roleUpper] || "#777";

                  // --- OT badges (restored) ---
                  let showOTBadge = false;
                  let showApproachingBadge = false;

                  if (shift.shift_date) {
                    const weekKey = getWeekStart(shift.shift_date);

                    const weekShifts = (shifts || [])
                      .filter(
                        (s) =>
                          s &&
                          s.staff_id === shift.staff_id &&
                          getWeekStart(s.shift_date) === weekKey
                      )
                      .sort((a, b) => {
                        const ad = new Date(a.shift_date + "T00:00:00");
                        const bd = new Date(b.shift_date + "T00:00:00");
                        const dateDiff = ad - bd;
                        if (dateDiff !== 0) return dateDiff;
                        const aTime = a.start_local || "";
                        const bTime = b.start_local || "";
                        return aTime.localeCompare(bTime);
                      });

                    let running = 0;
                    for (const s of weekShifts) {
                      const hrs = calculateShiftHours(s);
                      const before = running;
                      running += hrs;

                      if (s.id === shift.id) {
                        if (before < 40 && running > 40) showOTBadge = true;
                        else if (before < 36 && running >= 36 && running <= 40)
                          showApproachingBadge = true;
                        break;
                      }
                    }
                  }

                  return (
                    <div
                      key={shift.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(shift);
                      }}
                      style={{
                        borderRadius: "6px",
                        padding: "4px 6px",
                        background: "rgba(0,0,0,0.6)",
                        borderLeft: `4px solid ${roleColor}`,
                        fontSize: "11px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {worker?.name || `Staff #${shift.staff_id}`}
                        </span>
                        <span style={{ fontSize: "10px", opacity: 0.8 }}>
                          {shiftType}
                        </span>
                      </div>

                      <div style={{ fontSize: "10px", opacity: 0.85 }}>
                        {roleUpper} • {shift.unit || "No unit"}
                      </div>

                      {shift.assignment_number && (
                        <div style={{ fontSize: "10px", opacity: 0.7 }}>
                          Assignment #{shift.assignment_number}
                        </div>
                      )}

                      {shift.start_local && shift.end_local && (
                        <div style={{ fontSize: "10px", opacity: 0.7 }}>
                          {shift.start_local}–{shift.end_local}
                        </div>
                      )}

                      {(showOTBadge || showApproachingBadge) && (
                        <div
                          style={{
                            marginTop: "4px",
                            display: "flex",
                            justifyContent: "flex-end",
                          }}
                        >
                          {showOTBadge && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "999px",
                                background: "#dc2626",
                                color: "white",
                                fontSize: "9px",
                                fontWeight: "700",
                              }}
                            >
                              OT
                            </span>
                          )}

                          {showApproachingBadge && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "999px",
                                background: "#eab308",
                                color: "#422006",
                                fontSize: "9px",
                                fontWeight: "700",
                                marginLeft: showOTBadge ? "4px" : 0,
                              }}
                            >
                              ⚠
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD / EDIT MODALS */}
      {(addModalOpen || editModalOpen) && (
        <Modal onClose={closeAllModals}>
          <h2 style={{ marginBottom: "10px", fontSize: "18px" }}>
            {editModalOpen ? "Edit Shift" : "Add Shift"}
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            <label style={labelStyle}>
              <span>Staff member</span>
              <select
                value={form.staffId}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    staffId: e.target.value,
                    assignmentNumber: "",
                  }))
                }
                style={fieldSelectStyle}
              >
                <option value="">Select staff…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                style={fieldInputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span>Unit</span>
              <select
                value={form.unit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    unit: e.target.value,
                    assignmentNumber: "",
                  }))
                }
                style={fieldSelectStyle}
              >
                <option value="">Select unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>

            {/* CNA Assignment */}
            {isSelectedCNA && (
              <label style={labelStyle}>
                <span>Assignment (required for CNA)</span>
                <select
                  value={form.assignmentNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, assignmentNumber: e.target.value }))
                  }
                  style={fieldSelectStyle}
                  disabled={!form.unit}
                >
                  <option value="">
                    {form.unit ? "Select assignment…" : "Select a unit first…"}
                  </option>
                  {unitAssignmentsForForm.map((a) => (
                    <option key={a.id} value={a.number}>
                      #{a.number}
                      {a.label ? ` – ${a.label}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={labelStyle}>
              <span>Shift type</span>
              <select
                value={form.shiftType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shiftType: e.target.value }))
                }
                style={fieldSelectStyle}
              >
                <option value="">Select a shift type…</option>
                <option value="Day">Day</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "8px",
              marginTop: "4px",
              flexWrap: "wrap",
            }}
          >
            <div>
              {editModalOpen && (
                <button onClick={handleDeleteShift} style={dangerButtonStyle}>
                  Delete shift
                </button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button onClick={closeAllModals} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                onClick={
                  editModalOpen ? handleSubmitEditShift : handleSubmitNewShift
                }
                style={primaryButtonStyle}
              >
                {editModalOpen ? "Save changes" : "Create shift"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* TEMPLATE MODAL */}
      {templateModalOpen && (
        <Modal onClose={closeAllModals}>
          <h2 style={{ marginBottom: "10px", fontSize: "18px" }}>
            Weekly Staffing Template
          </h2>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "12px",
              alignItems: "center",
            }}
          >
            <select
              value={activeTemplateId || ""}
              onChange={(e) =>
                e.target.value
                  ? handleSelectTemplate(Number(e.target.value))
                  : handleNewTemplate()
              }
              style={fieldSelectStyle}
            >
              <option value="">New template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              style={{ ...fieldInputStyle, flex: "1 1 160px" }}
            />

            <button onClick={handleSaveTemplate} style={primaryButtonStyle}>
              Save template
            </button>

            {activeTemplateId && (
              <button
                onClick={handleDeleteTemplate}
                style={smallDangerButtonStyle}
              >
                Delete
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "12px",
              alignItems: "center",
            }}
          >
            <label style={{ ...labelStyle, maxWidth: "200px" }}>
              <span>Week start (Sunday)</span>
              <input
                type="date"
                value={templateWeekStart}
                onChange={(e) => setTemplateWeekStart(e.target.value)}
                style={fieldInputStyle}
              />
            </label>

            <label style={{ ...labelStyle, maxWidth: "120px" }}>
              <span># of weeks</span>
              <input
                type="number"
                min="1"
                max="12"
                value={templateWeeksCount}
                onChange={(e) =>
                  setTemplateWeeksCount(Number(e.target.value) || 1)
                }
                style={fieldInputStyle}
              />
            </label>

            <button
              onClick={handleApplyTemplate}
              style={{ ...primaryButtonStyle, marginTop: "16px" }}
            >
              Apply to calendar
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "10px",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Filter by staff name…"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              style={{ ...fieldInputStyle, flex: "1 1 180px" }}
            />

            <select
              value={templateRoleFilter}
              onChange={(e) => setTemplateRoleFilter(e.target.value)}
              style={fieldSelectStyle}
            >
              <option value="All">All roles</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              maxHeight: "420px",
              overflowY: "auto",
              borderRadius: "8px",
              border: "1px solid rgba(148,163,184,0.4)",
              padding: "6px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.2fr 1.2fr repeat(7, 1.2fr)",
                gap: "6px",
                padding: "4px 2px",
                fontSize: "11px",
                fontWeight: 600,
                borderBottom: "1px solid rgba(148,163,184,0.4)",
                marginBottom: "4px",
              }}
            >
              <div>Staff</div>
              <div>Unit</div>
              <div>Assignment (CNA)</div>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} style={{ textAlign: "center" }}>
                  {d}
                </div>
              ))}
            </div>

            {templateFilteredStaff.length === 0 && (
              <div style={{ fontSize: "12px", opacity: 0.7, padding: "4px" }}>
                No staff match your filters.
              </div>
            )}

            {templateFilteredStaff.map((s) => {
              const row =
                templateGrid[s.id] || {
                  staffId: s.id,
                  unit: "",
                  assignmentNumber: "",
                  days: Array.from({ length: 7 }, () => ({
                    active: false,
                    shiftType: "Day",
                  })),
                };

              const unitAssignments = getAssignmentsForUnitLocal(row.unit);

              return (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1.2fr 1.2fr repeat(7, 1.2fr)",
                    gap: "6px",
                    alignItems: "center",
                    padding: "4px 2px",
                    fontSize: "11px",
                    borderBottom: "1px solid rgba(30,64,175,0.25)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {s.name} <span style={{ opacity: 0.7 }}>({s.role})</span>
                    </div>
                  </div>

                  <div>
                    <select
                      value={row.unit}
                      onChange={(e) =>
                        handleChangeUnitForStaff(s.id, e.target.value)
                      }
                      style={{ ...fieldSelectStyle, fontSize: "11px" }}
                    >
                      <option value="">Unit…</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    {String(s.role || "").toUpperCase() === "CNA" ? (
                      <select
                        value={row.assignmentNumber || ""}
                        onChange={(e) =>
                          handleChangeAssignmentForStaff(s.id, e.target.value)
                        }
                        style={{ ...fieldSelectStyle, fontSize: "11px" }}
                      >
                        <option value="">Assignment…</option>
                        {unitAssignments.map((a) => (
                          <option key={a.id} value={a.number}>
                            #{a.number}
                            {a.label ? ` – ${a.label}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: "11px", opacity: 0.7 }}>
                        Whole unit
                      </span>
                    )}
                  </div>

                  {row.days.map((day, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={day.active}
                        onChange={() => handleToggleDay(s.id, idx)}
                        style={{
                          width: "14px",
                          height: "14px",
                          cursor: "pointer",
                        }}
                      />

                      {day.active && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                            fontSize: "9px",
                            alignItems: "center",
                          }}
                        >
                          {["Day", "Evening", "Night"].map((st) => (
                            <label
                              key={st}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "2px",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="radio"
                                name={`st-${s.id}-${idx}`}
                                checked={day.shiftType === st}
                                onChange={() =>
                                  handleSetDayShiftType(s.id, idx, st)
                                }
                                style={{
                                  width: "10px",
                                  height: "10px",
                                  cursor: "pointer",
                                }}
                              />
                              <span>{st[0]}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "14px",
            }}
          >
            <button onClick={closeAllModals} style={secondaryButtonStyle}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Reusable Modal component
// ------------------------------------------------------------------
function Modal({ children, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: "1000px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#0b1120",
          color: "#e5e7eb",
          borderRadius: "12px",
          padding: "18px 18px 14px",
          boxShadow: "0 18px 45px rgba(0,0,0,0.7)",
          border: "1px solid rgba(148,163,184,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Small shared styles
// ------------------------------------------------------------------
const inputStyle = {
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(148,163,184,0.6)",
  background: "rgba(15,23,42,0.9)",
  color: "#f9fafb",
  minWidth: "180px",
  fontSize: "13px",
};

const selectStyle = {
  ...inputStyle,
  minWidth: "120px",
};

const navButtonStyle = {
  padding: "4px 10px",
  borderRadius: "6px",
  border: "none",
  background: "#4b5563",
  color: "#f9fafb",
  cursor: "pointer",
  fontSize: "13px",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "13px",
};

const fieldInputStyle = {
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid rgba(148,163,184,0.7)",
  background: "#020617",
  color: "#e5e7eb",
  fontSize: "13px",
};

const fieldSelectStyle = {
  ...fieldInputStyle,
};

const primaryButtonStyle = {
  padding: "6px 14px",
  borderRadius: "999px",
  border: "none",
  background: "#22c55e",
  color: "#022c22",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "13px",
};

const secondaryButtonStyle = {
  padding: "6px 14px",
  borderRadius: "999px",
  border: "1px solid rgba(148,163,184,0.7)",
  background: "transparent",
  color: "#e5e7eb",
  cursor: "pointer",
  fontSize: "13px",
};

const smallDangerButtonStyle = {
  padding: "4px 8px",
  borderRadius: "999px",
  border: "none",
  background: "#ef4444",
  color: "#fef2f2",
  cursor: "pointer",
  fontSize: "12px",
};

const dangerButtonStyle = {
  padding: "6px 12px",
  borderRadius: "999px",
  border: "none",
  background: "#ef4444",
  color: "#fff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 800,
};
