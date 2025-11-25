import { useEffect, useState } from "react";
import api from "../services/api";

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);

  // FILTERS
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterUnit, setFilterUnit] = useState("All");
  const [filterShift, setFilterShift] = useState("All");
  const [filterDate, setFilterDate] = useState("");

  // SORTING
  const [sortOption, setSortOption] = useState("start-asc");

  // ADD SHIFT (dropdown)
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [formStaffId, setFormStaffId] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formAssignment, setFormAssignment] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formShiftType, setFormShiftType] = useState("");

  // TEMPLATES
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateWeekStart, setTemplateWeekStart] = useState("");
  const [templateWeeksCount, setTemplateWeeksCount] = useState(1);
  const [templateRows, setTemplateRows] = useState({});
  const [templateFilterName, setTemplateFilterName] = useState("");
  const [templateFilterRole, setTemplateFilterRole] = useState("All");

  // EDIT / DELETE
  const [editingShift, setEditingShift] = useState(null);
  const [editingShiftDate, setEditingShiftDate] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  // CALENDAR
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // ROLE COLORS (user editable)
  const defaultRoleColors = {
    CNA: "#00c853",
    RN: "#4a90e2",
    LPN: "#ba68c8",
  };

  const [roleColors, setRoleColors] = useState(() => {
    try {
      const stored = localStorage.getItem("role_colors");
      return stored ? JSON.parse(stored) : defaultRoleColors;
    } catch {
      return defaultRoleColors;
    }
  });

  useEffect(() => {
    localStorage.setItem("role_colors", JSON.stringify(roleColors));
  }, [roleColors]);

  // -----------------------------
  // LOAD DATA
  // -----------------------------
  useEffect(() => {
    loadPage();
    const interval = setInterval(loadPage, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadPage = async () => {
    const [shiftRes, staffRes] = await Promise.all([
      api.get("/shifts"),
      api.get("/staff"),
    ]);

    setShifts(shiftRes.data);
    setStaff(staffRes.data);

    const stored = JSON.parse(localStorage.getItem("shift_templates") || "[]");
    setTemplates(stored);
  };

  // -----------------------------
  // HELPERS
  // -----------------------------
  const formatDateToYMD = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const parseYMD = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const formatTimeShort = (date) => {
    const d = new Date(date);
    let h = d.getHours();
    const m = d.getMinutes();
    const suffix = h >= 12 ? "p" : "a";
    h = h % 12;
    if (h === 0) h = 12;
    const min = m ? `:${String(m).padStart(2, "0")}` : "";
    return `${h}${min}${suffix}`;
  };

  const formatShiftRange = (start, end) =>
    `${formatTimeShort(start)}–${formatTimeShort(end)}`;

  const getShiftType = (start, role) => {
    const hour = new Date(start).getHours();

    // Nurses 12-hour
    if (role === "RN" || role === "LPN") {
      if (hour >= 6 && hour < 18) return "Day";
      return "Night";
    }

    // CNA 8-hour
    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const getWeekStartKey = (dLike) => {
    const d = new Date(dLike);
    const day = d.getDay(); // 0 = Sun
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return sunday.toLocaleDateString("en-CA");
  };

  const calcHours = (s, e) =>
    Math.max(0, (new Date(e) - new Date(s)) / 3600000);

  const formatDateTimePretty = (dLike) => {
    const d = new Date(dLike);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // -----------------------------
  // CUSTOM DATE PICKER (with Today + Clear + optional disablePast)
  // -----------------------------
  const DatePicker = ({
    label,
    value,
    onChange,
    placeholder = "Select date...",
    disablePast = false,
  }) => {
    const [open, setOpen] = useState(false);
    const [viewYear, setViewYear] = useState(() => {
      const d = value ? parseYMD(value) : new Date();
      return d.getFullYear();
    });
    const [viewMonth, setViewMonth] = useState(() => {
      const d = value ? parseYMD(value) : new Date();
      return d.getMonth();
    });

    useEffect(() => {
      if (value) {
        const d = parseYMD(value);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }, [value]);

    const buildMonthMatrix = () => {
      const first = new Date(viewYear, viewMonth, 1);
      const dow = first.getDay();
      const start = new Date(viewYear, viewMonth, 1 - dow);

      const matrix = [];
      let cur = new Date(start);
      for (let w = 0; w < 6; w++) {
        const row = [];
        for (let d = 0; d < 7; d++) {
          row.push(new Date(cur));
          cur.setDate(cur.getDate() + 1);
        }
        matrix.push(row);
      }
      return matrix;
    };

    const monthMatrix = buildMonthMatrix();
    const selectedDate = value ? parseYMD(value) : null;

    const isSameDayLocal = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    const handleSelectDate = (date) => {
      onChange(formatDateToYMD(date));
      setOpen(false);
    };

    const handleToday = () => {
      const today = new Date();
      onChange(formatDateToYMD(today));
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
      setOpen(false);
    };

    const handleClear = () => {
      onChange("");
      setOpen(false);
    };

    const handlePrevMonth = () => {
      let m = viewMonth - 1;
      let y = viewYear;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      setViewMonth(m);
      setViewYear(y);
    };

    const handleNextMonth = () => {
      let m = viewMonth + 1;
      let y = viewYear;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      setViewMonth(m);
      setViewYear(y);
    };

    return (
      <div style={{ display: "inline-block", position: "relative" }}>
        {label && (
          <div style={{ fontSize: "12px", marginBottom: "4px" }}>{label}</div>
        )}

        <div
          onClick={() => setOpen((p) => !p)}
          style={{
            minWidth: "150px",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--input-border)",
            background: "var(--input-bg)",
            color: "var(--input-text)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "14px",
          }}
        >
          <span>
            {value
              ? formatDateTimePretty(value + "T00:00:00").split(",")[0] +
                " " +
                formatDateTimePretty(value + "T00:00:00").split(",")[1]
              : placeholder}
          </span>
          <span style={{ opacity: 0.7 }}>📅</span>
        </div>

        {open && (
          <div
            style={{
              position: "absolute",
              zIndex: 6000,
              marginTop: "4px",
              background: "var(--surface)",
              color: "var(--text)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
              padding: "8px",
              width: "260px",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{ padding: "2px 6px" }}
              >
                ◀
              </button>

              <div style={{ fontWeight: "bold" }}>
                {new Date(viewYear, viewMonth, 1).toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                style={{ padding: "2px 6px" }}
              >
                ▶
              </button>
            </div>

            {/* Today & Clear buttons */}
            <div
              style={{
                marginBottom: "6px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <button type="button" onClick={handleToday}>
                Today
              </button>

              <button
                type="button"
                onClick={handleClear}
                style={{ background: "#b33", color: "#fff" }}
              >
                Clear
              </button>
            </div>

            {/* Days header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                fontSize: "11px",
                marginBottom: "4px",
                textAlign: "center",
                opacity: 0.8,
              }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* Dates */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "2px",
                fontSize: "12px",
              }}
            >
              {monthMatrix.map((week, wi) =>
                week.map((date, di) => {
                  const inMonth =
                    date.getMonth() === viewMonth &&
                    date.getFullYear() === viewYear;

                  const selected =
                    selectedDate && isSameDayLocal(date, selectedDate);

                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  const isPast = disablePast && date < today;

                  return (
                    <div
                      key={`${wi}-${di}`}
                      onClick={() => {
                        if (!isPast) handleSelectDate(date);
                      }}
                      style={{
                        padding: "4px 0",
                        textAlign: "center",
                        borderRadius: "4px",
                        cursor: isPast ? "not-allowed" : "pointer",
                        background: selected
                          ? "var(--button-bg)"
                          : "transparent",
                        color: isPast
                          ? "#777"
                          : selected
                          ? "var(--button-text)"
                          : inMonth
                          ? "var(--text)"
                          : "var(--text-muted)",
                        opacity: isPast ? 0.4 : 1,
                      }}
                    >
                      {date.getDate()}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // -----------------------------
  // WEEKLY BUCKETS FOR OT
  // -----------------------------
  const weeklyBuckets = {};
  shifts.forEach((shift) => {
    const key = `${shift.staff_id}|${getWeekStartKey(shift.start_time)}`;
    if (!weeklyBuckets[key]) weeklyBuckets[key] = [];
    weeklyBuckets[key].push(shift);
  });
  Object.values(weeklyBuckets).forEach((bucket) =>
    bucket.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  );

  // -----------------------------
  // ADD SHIFT (uses date + shiftType)
  // -----------------------------
  const handleAddShift = async () => {
    if (!formStaffId || !formRole || !formUnit || !formDate || !formShiftType) {
      alert("Fill all required fields (staff, role, date, shift, unit).");
      return;
    }

    const worker = staff.find((s) => s.id === Number(formStaffId));
    if (!worker) {
      alert("Invalid staff selected.");
      return;
    }

    const baseDate = parseYMD(formDate); // date-only
    let startTime;
    let endTime;

    if (worker.role === "RN" || worker.role === "LPN") {
      if (formShiftType === "Day") {
        const s = new Date(baseDate);
        s.setHours(6, 0, 0, 0);
        const e = new Date(baseDate);
        e.setHours(18, 0, 0, 0);
        startTime = s;
        endTime = e;
      } else if (formShiftType === "Night") {
        const s = new Date(baseDate);
        s.setHours(18, 0, 0, 0);
        const e = new Date(baseDate);
        e.setDate(e.getDate() + 1);
        e.setHours(6, 0, 0, 0);
        startTime = s;
        endTime = e;
      } else {
        alert("RN/LPN can only work Day or Night (12-hour).");
        return;
      }
    } else if (worker.role === "CNA") {
      const s = new Date(baseDate);
      const e = new Date(baseDate);

      if (formShiftType === "Day") {
        s.setHours(6, 0, 0, 0);
        e.setHours(14, 0, 0, 0);
      } else if (formShiftType === "Evening") {
        s.setHours(14, 0, 0, 0);
        e.setHours(22, 0, 0, 0);
      } else if (formShiftType === "Night") {
        s.setHours(22, 0, 0, 0);
        e.setDate(e.getDate() + 1);
        e.setHours(6, 0, 0, 0);
      } else {
        alert("Invalid CNA shift type.");
        return;
      }

      startTime = s;
      endTime = e;
    } else {
      alert("Unknown role.");
      return;
    }

    const org_code = localStorage.getItem("org_code");

    const payload = {
      staffId: Number(formStaffId),
      role: worker.role,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      unit: formUnit,
      assignment_number: formAssignment ? Number(formAssignment) : null,
      org_code,
    };

    const res = await api.post("/shifts", payload);
    setShifts((prev) => [...prev, res.data]);

    // reset form
    setFormStaffId("");
    setFormRole("");
    setFormUnit("");
    setFormAssignment("");
    setFormDate("");
    setFormShiftType("");
    setAddShiftOpen(false);
  };

  // -----------------------------
  // TEMPLATE HELPERS
  // -----------------------------
  const getDefaultTemplateRow = () => ({
    include: false,
    unit: "",
    assignment: "",
    shiftType: "",
    days: Array(7).fill(false),
  });

  const updateTemplateRow = (id, patch) => {
    setTemplateRows((prev) => {
      const row = prev[id] || getDefaultTemplateRow();
      return { ...prev, [id]: { ...row, ...patch } };
    });
  };

  const toggleTemplateDay = (id, idx) => {
    setTemplateRows((prev) => {
      const row = prev[id] || getDefaultTemplateRow();
      const days = [...row.days];
      days[idx] = !days[idx];
      return { ...prev, [id]: { ...row, days } };
    });
  };

  const buildEmployeesFromRows = () => {
    return staff
      .map((p) => {
        const row = templateRows[p.id] || getDefaultTemplateRow();
        const hasDays = row.days.some((d) => d);
        if (!row.include || !row.shiftType || !hasDays) return null;

        return {
          staffId: p.id,
          role: p.role,
          unit: row.unit || "",
          assignment:
            p.role === "CNA" && row.assignment ? Number(row.assignment) : null,
          shiftType: row.shiftType,
          days: row.days,
        };
      })
      .filter(Boolean);
  };

  const saveTemplate = () => {
    if (!templateName.trim()) {
      alert("Enter a template name.");
      return;
    }

    const employees = buildEmployeesFromRows();
    if (!employees.length) {
      alert("No employees selected for this template.");
      return;
    }

    const newTemplate = {
      id: Date.now(),
      name: templateName.trim(),
      employees,
    };

    const updated = [...templates, newTemplate];
    setTemplates(updated);
    localStorage.setItem("shift_templates", JSON.stringify(updated));

    alert("Template saved.");
  };

  const deleteTemplate = (id) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    localStorage.setItem("shift_templates", JSON.stringify(updated));
    if (String(id) === String(selectedTemplateId)) {
      setSelectedTemplateId("");
      setTemplateRows({});
    }
  };

  const loadTemplateIntoBuilder = (id) => {
    const tpl = templates.find((t) => String(t.id) === String(id));
    if (!tpl) return;

    setTemplateName(tpl.name);

    const newRows = {};
    tpl.employees.forEach((emp) => {
      newRows[emp.staffId] = {
        include: true,
        unit: emp.unit || "",
        assignment: emp.assignment ?? "",
        shiftType: emp.shiftType || "",
        days: emp.days || Array(7).fill(false),
      };
    });
    setTemplateRows(newRows);
  };

  const applyTemplate = async () => {
    const employees = buildEmployeesFromRows();
    if (!employees.length) {
      alert("No rows selected in template.");
      return;
    }

    if (!templateWeekStart) {
      alert("Choose a week start date.");
      return;
    }

    const weeks = Number(templateWeeksCount) || 1;
    const base = parseYMD(templateWeekStart);
    base.setHours(0, 0, 0, 0);

    // normalize base to REAL Sunday to fix Sun–Thu ↔ Sat–Wed bug
    const baseSunday = new Date(base);
    baseSunday.setDate(base.getDate() - base.getDay());

    const org_code = localStorage.getItem("org_code");
    const toCreate = [];

    for (let w = 0; w < weeks; w++) {
      for (const emp of employees) {
        const worker = staff.find((s) => s.id === emp.staffId);
        if (!worker) continue;

        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          if (!emp.days[dayIdx]) continue;

          const d = new Date(baseSunday);
          d.setDate(baseSunday.getDate() + dayIdx + w * 7);

          let startTime;
          let endTime;

          if (worker.role === "RN" || worker.role === "LPN") {
            if (emp.shiftType === "Day") {
              const s = new Date(d);
              s.setHours(6, 0, 0, 0);
              const e = new Date(d);
              e.setHours(18, 0, 0, 0);
              startTime = s;
              endTime = e;
            } else {
              const s = new Date(d);
              s.setHours(18, 0, 0, 0);
              const e = new Date(d);
              e.setDate(e.getDate() + 1);
              e.setHours(6, 0, 0, 0);
              startTime = s;
              endTime = e;
            }
          } else if (worker.role === "CNA") {
            const s = new Date(d);
            const e = new Date(d);
            if (emp.shiftType === "Day") {
              s.setHours(6, 0, 0, 0);
              e.setHours(14, 0, 0, 0);
            } else if (emp.shiftType === "Evening") {
              s.setHours(14, 0, 0, 0);
              e.setHours(22, 0, 0, 0);
            } else {
              s.setHours(22, 0, 0, 0);
              e.setDate(e.getDate() + 1);
              e.setHours(6, 0, 0, 0);
            }
            startTime = s;
            endTime = e;
          } else {
            continue;
          }

          toCreate.push({
            staffId: emp.staffId,
            role: worker.role,
            start: startTime.toISOString(),
            end: endTime.toISOString(),
            unit: emp.unit,
            assignment_number: emp.assignment,
            org_code,
          });
        }
      }
    }

    for (const item of toCreate) {
      await api.post("/shifts", item);
    }

    alert("Template applied.");
    loadPage();
  };

  // -----------------------------
  // EDIT / DELETE
  // -----------------------------
  const startEdit = (shift) => {
    const worker = staff.find((s) => s.id === shift.staff_id);
    const role = worker?.role || shift.role;
    const shiftType = getShiftType(shift.start_time, role);
    const ymd = new Date(shift.start_time).toLocaleDateString("en-CA");

    setEditingShift({
      ...shift,
      role,
      shiftType,
    });
    setEditingShiftDate(ymd);
  };

  const saveEdit = async () => {
    if (!editingShift) return;

    const worker = staff.find((s) => s.id === editingShift.staff_id);
    if (!worker) {
      alert("Invalid staff selected.");
      return;
    }

    const dateYMD =
      editingShiftDate ||
      new Date(editingShift.start_time).toLocaleDateString("en-CA");
    const d = parseYMD(dateYMD);

    let startTime;
    let endTime;

    if (worker.role === "RN" || worker.role === "LPN") {
      if (editingShift.shiftType === "Day") {
        const s = new Date(d);
        s.setHours(6, 0, 0, 0);
        const e = new Date(d);
        e.setHours(18, 0, 0, 0);
        startTime = s;
        endTime = e;
      } else {
        const s = new Date(d);
        s.setHours(18, 0, 0, 0);
        const e = new Date(d);
        e.setDate(e.getDate() + 1);
        e.setHours(6, 0, 0, 0);
        startTime = s;
        endTime = e;
      }
    } else if (worker.role === "CNA") {
      const s = new Date(d);
      const e = new Date(d);
      if (editingShift.shiftType === "Day") {
        s.setHours(6, 0, 0, 0);
        e.setHours(14, 0, 0, 0);
      } else if (editingShift.shiftType === "Evening") {
        s.setHours(14, 0, 0, 0);
        e.setHours(22, 0, 0, 0);
      } else {
        s.setHours(22, 0, 0, 0);
        e.setDate(e.getDate() + 1);
        e.setHours(6, 0, 0, 0);
      }
      startTime = s;
      endTime = e;
    } else {
      alert("Unknown role.");
      return;
    }

    const payload = {
      staffId: editingShift.staff_id,
      role: worker.role,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      unit: editingShift.unit,
      assignment_number: editingShift.assignment_number,
    };

    const res = await api.put(`/shifts/${editingShift.id}`, payload);

    setShifts((prev) =>
      prev.map((s) => (s.id === editingShift.id ? res.data : s))
    );
    setEditingShift(null);
    setEditingShiftDate("");
  };

  // -----------------------------
  // FILTERING / SORTING
  // -----------------------------
  const filtered = shifts.filter((s) => {
    const w = staff.find((p) => p.id === s.staff_id);
    if (!w) return false;

    const matchName =
      !searchTerm ||
      w.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchRole = filterRole === "All" || w.role === filterRole;

    const matchUnit = filterUnit === "All" || s.unit === filterUnit;

    const st = getShiftType(s.start_time, w.role);
    const matchShift = filterShift === "All" || st === filterShift;

    let matchDate = true;
    if (filterDate) {
      const d = new Date(s.start_time).toLocaleDateString("en-CA");
      matchDate = d === filterDate;
    }

    return matchName && matchRole && matchUnit && matchShift && matchDate;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortOption === "start-asc")
      return new Date(a.start_time) - new Date(b.start_time);
    if (sortOption === "start-desc")
      return new Date(b.start_time) - new Date(a.start_time);
    return 0;
  });

  // -----------------------------
  // GROUP BY DAY
  // -----------------------------
  const shiftsByDay = {};
  sorted.forEach((s) => {
    const key = new Date(s.start_time).toLocaleDateString("en-CA");
    if (!shiftsByDay[key]) shiftsByDay[key] = [];
    shiftsByDay[key].push(s);
  });

  // -----------------------------
  // CALENDAR MATRIX
  // -----------------------------
  const buildCalendar = (m) => {
    const y = m.getFullYear();
    const mo = m.getMonth();
    const first = new Date(y, mo, 1);
    const dow = first.getDay();
    const start = new Date(first);
    start.setDate(first.getDate() - dow);

    const matrix = [];
    let cur = new Date(start);

    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        row.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      matrix.push(row);
    }
    return matrix;
  };

  const calendar = buildCalendar(currentMonth);
  const today = new Date();
  const isSameDayGlobal = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // -----------------------------
  // TEMPLATE STAFF FILTERING
  // -----------------------------
  const templateNameFilter = templateFilterName.toLowerCase();
  const templateStaffFiltered = staff.filter((s) => {
    const matchName =
      !templateNameFilter ||
      s.name.toLowerCase().includes(templateNameFilter);
    const matchRole =
      templateFilterRole === "All" || s.role === templateFilterRole;
    return matchName && matchRole;
  });

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <div
      style={{
        padding: "20px",
        minHeight: "100vh",
        background: "var(--page-bg)", // themed page background
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "16px" }}>Shift Management</h1>

        {/* ADD SHIFT DROPDOWN */}
        <div style={{ marginBottom: "12px" }}>
          <button
            onClick={() => setAddShiftOpen((p) => !p)}
            style={{
              marginBottom: "10px",
              padding: "6px 12px",
              borderRadius: "6px",
            }}
          >
            {addShiftOpen ? "Hide Add Shift" : "Add Shift ▾"}
          </button>
        </div>

        {addShiftOpen && (
          <div
            className="panel"
            style={{
              marginBottom: "20px",
              padding: "12px",
              borderRadius: "10px",
              background: "var(--surface)",
              boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Add Shift</h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                alignItems: "center",
              }}
            >
              {/* Staff */}
              <select
                value={formStaffId}
                onChange={(e) => {
                  const id = e.target.value;
                  setFormStaffId(id);
                  const p = staff.find((x) => x.id === Number(id));
                  setFormRole(p?.role || "");
                  setFormShiftType("");
                }}
              >
                <option value="">Select Staff</option>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>

              {/* Role */}
              <input
                value={formRole}
                placeholder="Role"
                readOnly
                style={{ width: "90px" }}
              />

              {/* Date (custom picker) */}
              <DatePicker
                label="Shift Date"
                value={formDate}
                onChange={setFormDate}
                disablePast
              />

              {/* Shift */}
              <select
                value={formShiftType}
                onChange={(e) => setFormShiftType(e.target.value)}
              >
                <option value="">Shift</option>
                {formRole === "RN" || formRole === "LPN" ? (
                  <>
                    <option value="Day">Day (06–18)</option>
                    <option value="Night">Night (18–06)</option>
                  </>
                ) : formRole === "CNA" ? (
                  <>
                    <option value="Day">Day (06–14)</option>
                    <option value="Evening">Evening (14–22)</option>
                    <option value="Night">Night (22–06)</option>
                  </>
                ) : null}
              </select>

              {/* Unit */}
              <select
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
              >
                <option value="">Unit</option>
                <option value="A Wing">A Wing</option>
                <option value="Middle">Middle</option>
                <option value="B Wing">B Wing</option>
              </select>

              {/* Assignment (CNA only) */}
              <select
                value={formAssignment}
                onChange={(e) => setFormAssignment(e.target.value)}
                disabled={formRole !== "CNA"}
              >
                <option value="">Assignment #</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <button onClick={handleAddShift}>Save Shift</button>
            </div>
          </div>
        )}

        {/* FILTERS */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "12px",
            padding: "10px",
            borderRadius: "10px",
            background: "var(--surface)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          }}
        >
          <input
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option>All</option>
            <option>RN</option>
            <option>LPN</option>
            <option>CNA</option>
          </select>

          <select
            value={filterUnit}
            onChange={(e) => setFilterUnit(e.target.value)}
          >
            <option>All</option>
            <option>A Wing</option>
            <option>Middle</option>
            <option>B Wing</option>
          </select>

          <select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
          >
            <option>All</option>
            <option>Day</option>
            <option>Evening</option>
            <option>Night</option>
          </select>

          <DatePicker
            value={filterDate}
            onChange={(val) => {
              setFilterDate(val);
              if (val) {
                const d = new Date(val);
                setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              }
            }}
            placeholder="Any date..."
          />

          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
          >
            <option value="start-asc">Start ↑</option>
            <option value="start-desc">Start ↓</option>
          </select>
        </div>

        {/* ROLE COLOR EDITOR */}
        <div
          style={{
            marginBottom: "20px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600 }}>
            Role Colors:
          </span>
          {["CNA", "RN", "LPN"].map((role) => (
            <label
              key={role}
              style={{
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {role}
              <input
                type="color"
                value={roleColors[role]}
                onChange={(e) =>
                  setRoleColors((prev) => ({
                    ...prev,
                    [role]: e.target.value,
                  }))
                }
                style={{
                  width: "28px",
                  height: "20px",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              />
            </label>
          ))}
        </div>

        {/* TEMPLATES DROPDOWN PANEL */}
        <button
          onClick={() => setTemplatePanelOpen((p) => !p)}
          style={{ marginBottom: "10px", padding: "6px 12px" }}
        >
          {templatePanelOpen ? "Hide Templates" : "Templates ▾"}
        </button>

        {templatePanelOpen && (
          <div
            className="panel"
            style={{
              marginBottom: "20px",
              padding: "12px",
              borderRadius: "10px",
              background: "var(--surface)",
              boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Weekly Templates</h3>

            {/* Saved template selector */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "10px",
                alignItems: "center",
              }}
            >
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedTemplateId(id);
                  if (id) loadTemplateIntoBuilder(id);
                }}
                style={{ minWidth: "250px" }}
              >
                <option value="">Saved templates...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.employees.length} staff)
                  </option>
                ))}
              </select>

              {selectedTemplateId && (
                <button
                  style={{ background: "#b33", color: "#fff" }}
                  onClick={() => deleteTemplate(Number(selectedTemplateId))}
                >
                  Delete Template
                </button>
              )}
            </div>

            {/* Template name + filters + Select All */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "10px",
                alignItems: "center",
              }}
            >
              <input
                placeholder="Template name..."
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />

              <input
                placeholder="Filter staff by name..."
                value={templateFilterName}
                onChange={(e) => setTemplateFilterName(e.target.value)}
              />

              <select
                value={templateFilterRole}
                onChange={(e) => setTemplateFilterRole(e.target.value)}
              >
                <option value="All">All Roles</option>
                <option value="RN">RN</option>
                <option value="LPN">LPN</option>
                <option value="CNA">CNA</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  const allSelected = templateStaffFiltered.every((p) => {
                    const row =
                      templateRows[p.id] || getDefaultTemplateRow();
                    return row.include === true;
                  });

                  const updated = { ...templateRows };

                  templateStaffFiltered.forEach((p) => {
                    const existing =
                      templateRows[p.id] || getDefaultTemplateRow();

                    updated[p.id] = {
                      ...existing,
                      include: !allSelected,
                    };
                  });

                  setTemplateRows(updated);
                }}
              >
                Select All Visible
              </button>
            </div>

            {/* Template builder table */}
            <div style={{ maxHeight: "260px", overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Use</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Unit</th>
                    <th>Assignment</th>
                    <th>Shift</th>
                    <th>Sun</th>
                    <th>Mon</th>
                    <th>Tue</th>
                    <th>Wed</th>
                    <th>Thu</th>
                    <th>Fri</th>
                    <th>Sat</th>
                  </tr>
                </thead>
                <tbody>
                  {templateStaffFiltered.map((p) => {
                    const row = templateRows[p.id] || getDefaultTemplateRow();
                    const isNurse = p.role === "RN" || p.role === "LPN";
                    const isCNA = p.role === "CNA";

                    const shiftOptions = isNurse
                      ? ["Day", "Night"]
                      : ["Day", "Evening", "Night"];

                    return (
                      <tr key={p.id}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) =>
                              updateTemplateRow(p.id, {
                                include: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td>{p.name}</td>
                        <td>{p.role}</td>
                        <td>
                          <select
                            value={row.unit}
                            onChange={(e) =>
                              updateTemplateRow(p.id, {
                                unit: e.target.value,
                              })
                            }
                          >
                            <option value="">Unit</option>
                            <option value="A Wing">A Wing</option>
                            <option value="Middle">Middle</option>
                            <option value="B Wing">B Wing</option>
                          </select>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isCNA ? (
                            <select
                              value={row.assignment}
                              onChange={(e) =>
                                updateTemplateRow(p.id, {
                                  assignment: e.target.value,
                                })
                              }
                            >
                              <option value="">#</option>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ opacity: 0.4 }}>N/A</span>
                          )}
                        </td>
                        <td>
                          <select
                            value={row.shiftType}
                            onChange={(e) =>
                              updateTemplateRow(p.id, {
                                shiftType: e.target.value,
                              })
                            }
                          >
                            <option value="">Shift</option>
                            {shiftOptions.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        {row.days.map((val, idx) => (
                          <td key={idx} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={val}
                              onChange={() => toggleTemplateDay(p.id, idx)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {templateStaffFiltered.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ textAlign: "center" }}>
                        No staff match filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Week start + weeks + actions */}
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                flexWrap: "wrap",
                gap: "15px",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <DatePicker
                  label="Week Start (Sunday)"
                  value={templateWeekStart}
                  onChange={setTemplateWeekStart}
                  disablePast
                />

                <div>
                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                    Weeks
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={templateWeeksCount}
                    onChange={(e) => setTemplateWeeksCount(e.target.value)}
                    style={{ width: "80px" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={saveTemplate}>Save Template</button>
                <button onClick={applyTemplate}>Apply Template</button>
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR HEADER */}
        <div
          style={{
            marginTop: "10px",
            marginBottom: "10px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <button
            onClick={() =>
              setCurrentMonth(
                new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth() - 1,
                  1
                )
              )
            }
          >
            ◀
          </button>

          <h2>
            {currentMonth.toLocaleString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </h2>

          <button
            onClick={() =>
              setCurrentMonth(
                new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth() + 1,
                  1
                )
              )
            }
          >
            ▶
          </button>
        </div>

        {/* LEGEND */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "15px",
            fontSize: "14px",
            color: "var(--text-muted)",
          }}
        >
          Role colors as configured above · Yellow border = ≥32h · Red border =
          OT &gt; 40h
        </div>

        {/* CALENDAR GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "6px",
          }}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                padding: "6px",
                fontWeight: "bold",
                color: "var(--text)",
              }}
            >
              {d}
            </div>
          ))}

          {calendar.map((week, wi) =>
            week.map((date, di) => {
              const key = date.toLocaleDateString("en-CA");
              const dayShifts = shiftsByDay[key] || [];
              const inMonth =
                date.getMonth() === currentMonth.getMonth() &&
                date.getFullYear() === currentMonth.getFullYear();
              const isTodayFlag = isSameDayGlobal(date, today);

              return (
                <div
                  key={`${wi}-${di}`}
                  className="calendar-cell"
                  style={{
                    padding: "6px",
                    minHeight: "110px",
                    borderRadius: "8px",
                    border: isTodayFlag
                      ? "2px solid var(--button-bg)"
                      : "1px solid var(--border)",
                    opacity: inMonth ? 1 : 0.35,
                    display: "flex",
                    flexDirection: "column",
                    background: "var(--calendar-cell-bg)",
                  }}
                >
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: "13px",
                      opacity: 0.7,
                    }}
                  >
                    {date.getDate()}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      flex: 1,
                      overflow: "hidden",
                    }}
                  >
                    {dayShifts.map((s) => {
                      const w =
                        staff.find((x) => x.id === s.staff_id) || {};
                      const weekKey = `${s.staff_id}|${getWeekStartKey(
                        s.start_time
                      )}`;
                      const bucket = weeklyBuckets[weekKey] || [];

                      let cumulative = 0;
                      let weeklyTotal = 0;
                      bucket.forEach((sh) => {
                        weeklyTotal += calcHours(
                          sh.start_time,
                          sh.end_time
                        );
                      });

                      for (const sh of bucket) {
                        cumulative += calcHours(sh.start_time, sh.end_time);
                        if (sh.id === s.id) break;
                      }

                      let borderColor = "transparent";
                      let showOT = false;
                      if (cumulative > 40) {
                        borderColor = "#ff5252";
                        showOT = true;
                      } else if (cumulative >= 32) {
                        borderColor = "#ffeb3b";
                      }

                      let bg = "#555";
                      if (w.role && roleColors[w.role]) {
                        bg = roleColors[w.role];
                      }

                      return (
                        <div
                          key={s.id}
                          onClick={() => startEdit(s)}
                          title={`Weekly hours (incl this): ${cumulative.toFixed(
                            1
                          )}\nTotal week: ${weeklyTotal.toFixed(
                            1
                          )}\n${formatDateTimePretty(
                            s.start_time
                          )} - ${formatDateTimePretty(s.end_time)}`}
                          style={{
                            padding: "4px 6px",
                            borderRadius: "999px",
                            background: bg,
                            border: `2px solid ${borderColor}`,
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "pointer",
                            color: "#fff",
                          }}
                        >
                          {w.name || "Unknown"} ·{" "}
                          {formatShiftRange(
                            s.start_time,
                            s.end_time
                          )}
                          {showOT && <strong> OT</strong>}
                        </div>
                      );
                    })}

                    {dayShifts.length === 0 && (
                      <div style={{ fontSize: "11px", opacity: 0.3 }}>
                        No shifts
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* EDIT MODAL */}
        {editingShift && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 5000,
            }}
          >
            <div
              className="modal"
              style={{
                width: "420px",
                background: "var(--surface)",
                padding: "16px",
                borderRadius: "10px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              }}
            >
              <h3>Edit Shift</h3>

              {/* Staff */}
              <label>Staff Member:</label>
              <select
                value={editingShift.staff_id}
                onChange={(e) => {
                  const newId = Number(e.target.value);
                  const worker = staff.find((x) => x.id === newId);
                  setEditingShift((prev) => ({
                    ...prev,
                    staff_id: newId,
                    role: worker?.role || prev.role,
                    shiftType: "", // force re-pick for new role
                    assignment_number:
                      worker?.role === "CNA" ? prev.assignment_number : null,
                  }));
                }}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>

              {/* Date */}
              <label style={{ marginTop: "8px" }}>Shift Date:</label>
              <DatePicker
                value={editingShiftDate}
                onChange={setEditingShiftDate}
                disablePast
              />

              {/* Shift */}
              <label>Shift:</label>
              <select
                value={editingShift.shiftType || ""}
                onChange={(e) =>
                  setEditingShift((prev) => ({
                    ...prev,
                    shiftType: e.target.value,
                  }))
                }
              >
                <option value="">Select Shift</option>
                {(() => {
                  const worker = staff.find(
                    (x) => x.id === editingShift.staff_id
                  );
                  if (!worker) return null;

                  if (worker.role === "RN" || worker.role === "LPN") {
                    return (
                      <>
                        <option value="Day">Day (06–18)</option>
                        <option value="Night">Night (18–06)</option>
                      </>
                    );
                  }

                  if (worker.role === "CNA") {
                    return (
                      <>
                        <option value="Day">Day (06–14)</option>
                        <option value="Evening">Evening (14–22)</option>
                        <option value="Night">Night (22–06)</option>
                      </>
                    );
                  }

                  return null;
                })()}
              </select>

              {/* Unit */}
              <label>Unit:</label>
              <select
                value={editingShift.unit}
                onChange={(e) =>
                  setEditingShift((prev) => ({
                    ...prev,
                    unit: e.target.value,
                  }))
                }
              >
                <option value="A Wing">A Wing</option>
                <option value="Middle">Middle</option>
                <option value="B Wing">B Wing</option>
              </select>

              {/* Assignment */}
              <label>Assignment:</label>
              <select
                value={editingShift.assignment_number || ""}
                disabled={
                  staff.find((x) => x.id === editingShift.staff_id)?.role !==
                  "CNA"
                }
                onChange={(e) =>
                  setEditingShift((prev) => ({
                    ...prev,
                    assignment_number: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
              >
                <option value="">None</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <div
                style={{ marginTop: "15px", display: "flex", gap: "10px" }}
              >
                <button onClick={saveEdit}>Save</button>
                <button onClick={() => setEditingShift(null)}>Cancel</button>
                <button
                  style={{ marginLeft: "auto", background: "#b33" }}
                  onClick={() => {
                    setDeleteId(editingShift.id);
                    setEditingShift(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE CONFIRM MODAL */}
        {deleteId && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 5000,
            }}
          >
            <div
              className="modal"
              style={{
                width: "350px",
                background: "var(--surface)",
                padding: "16px",
                borderRadius: "10px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              }}
            >
              <h3>Delete Shift?</h3>
              <p>This cannot be undone.</p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={{ background: "#b33", flex: 1 }}
                  onClick={async () => {
                    await api.delete(`/shifts/${deleteId}`);
                    setShifts((prev) =>
                      prev.filter((s) => s.id !== deleteId)
                    );
                    setDeleteId(null);
                  }}
                >
                  Delete
                </button>
                <button
                  style={{ flex: 1 }}
                  onClick={() => setDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
