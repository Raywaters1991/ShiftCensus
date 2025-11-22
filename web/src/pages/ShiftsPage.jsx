import { useEffect, useState } from "react";
import api from "../services/api";

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);

  // ADD SHIFT FORM
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [unit, setUnit] = useState("");
  const [assignment, setAssignment] = useState("");

  // FILTERS
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterUnit, setFilterUnit] = useState("All");
  const [filterShift, setFilterShift] = useState("All");
  const [filterDate, setFilterDate] = useState("");

  // SORTING
  const [sortOption, setSortOption] = useState("start-asc");

  // TEMPLATE STATE
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateWeekStart, setTemplateWeekStart] = useState("");
  const [templateWeeksCount, setTemplateWeeksCount] = useState(1);
  const [templateRows, setTemplateRows] = useState({});
  const [templateFilterName, setTemplateFilterName] = useState("");
  const [templateFilterRole, setTemplateFilterRole] = useState("All");

  // EDIT/DELETE
  const [editingShift, setEditingShift] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // CALENDAR
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

  const getShiftType = (start) => {
    const hour = new Date(start).getHours();
    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const getWeekStartKey = (dLike) => {
    const d = new Date(dLike);
    const day = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return sunday.toLocaleDateString("en-CA");
  };

  const calcHours = (s, e) =>
    Math.max(0, (new Date(e) - new Date(s)) / 3600000);

  const weeklyBuckets = {};
  shifts.forEach((shift) => {
    const key = `${shift.staff_id}|${getWeekStartKey(shift.start_time)}`;
    if (!weeklyBuckets[key]) weeklyBuckets[key] = [];
    weeklyBuckets[key].push(shift);
  });

  Object.values(weeklyBuckets).forEach((bucket) =>
    bucket.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  );

  const addShift = async () => {
    if (!staffId || !role || !start || !end || !unit) {
      alert("Fill all fields");
      return;
    }
    const org_code = localStorage.getItem("org_code");
    const payload = {
      staffId: Number(staffId),
      role,
      start,
      end,
      unit,
      assignment_number: assignment ? Number(assignment) : null,
      org_code,
    };
    const res = await api.post("/shifts", payload);
    setShifts((p) => [...p, res.data]);

    setStaffId("");
    setRole("");
    setStart("");
    setEnd("");
    setUnit("");
    setAssignment("");
  };

  const getDefaultRow = () => ({
    include: false,
    unit: "",
    assignment: "",
    shiftType: "",
    days: Array(7).fill(false),
  });

  const updateTemplateRow = (id, patch) =>
    setTemplateRows((p) => {
      const row = p[id] || getDefaultRow();
      return { ...p, [id]: { ...row, ...patch } };
    });

  const toggleTemplateDay = (id, idx) =>
    setTemplateRows((p) => {
      const row = p[id] || getDefaultRow();
      const days = [...row.days];
      days[idx] = !days[idx];
      return { ...p, [id]: { ...row, days } };
    });

  const saveTemplate = () => {
    if (!templateName.trim()) return alert("Enter template name.");

    const employees = staff
      .map((p) => {
        const row = templateRows[p.id] || getDefaultRow();
        const hasDays = row.days.some((d) => d);
        if (!row.include || !row.shiftType || !hasDays) return null;
        return {
          staffId: p.id,
          role: p.role,
          unit: row.unit,
          assignment: p.role === "CNA" ? Number(row.assignment) || null : null,
          shiftType: row.shiftType,
          days: row.days,
        };
      })
      .filter(Boolean);

    const newTemplate = {
      id: Date.now(),
      name: templateName.trim(),
      employees,
    };

    const updated = [...templates, newTemplate];
    localStorage.setItem("shift_templates", JSON.stringify(updated));
    setTemplates(updated);

    setTemplateName("");
    setTemplateRows({});
    alert("Template saved.");
  };

  const applyTemplate = async (tpl) => {
    if (!templateWeekStart) return alert("Choose week start.");
    const base = new Date(templateWeekStart);
    const org_code = localStorage.getItem("org_code");

    const items = [];
    for (let w = 0; w < templateWeeksCount; w++) {
      for (const emp of tpl.employees) {
        const p = staff.find((x) => x.id === emp.staffId);
        for (let i = 0; i < 7; i++) {
          if (!emp.days[i]) continue;

          let d = new Date(base);
          d.setDate(base.getDate() + i + w * 7);

          let startTime, endTime;
          if (p.role === "RN" || p.role === "LPN") {
            if (emp.shiftType === "Day") {
              startTime = new Date(d).setHours(6, 0, 0, 0);
              endTime = new Date(d).setHours(18, 0, 0, 0);
            } else {
              startTime = new Date(d).setHours(18, 0, 0, 0);
              const e = new Date(d);
              e.setDate(e.getDate() + 1);
              endTime = e.setHours(6, 0, 0, 0);
            }
          } else {
            if (emp.shiftType === "Day") {
              startTime = new Date(d).setHours(6, 0, 0, 0);
              endTime = new Date(d).setHours(14, 0, 0, 0);
            } else if (emp.shiftType === "Evening") {
              startTime = new Date(d).setHours(14, 0, 0, 0);
              endTime = new Date(d).setHours(22, 0, 0, 0);
            } else {
              startTime = new Date(d).setHours(22, 0, 0, 0);
              const e = new Date(d);
              e.setDate(e.getDate() + 1);
              endTime = e.setHours(6, 0, 0, 0);
            }
          }

          items.push({
            staffId: emp.staffId,
            role: p.role,
            start: new Date(startTime).toISOString(),
            end: new Date(endTime).toISOString(),
            unit: emp.unit,
            assignment_number: emp.assignment,
            org_code,
          });
        }
      }
    }

    for (const it of items) await api.post("/shifts", it);

    alert("Template applied.");
    loadPage();
  };

  const startEdit = (s) =>
    setEditingShift({
      ...s,
      start_time: s.start_time.slice(0, 16),
      end_time: s.end_time.slice(0, 16),
    });

  const saveEdit = async () => {
    const payload = {
      role: editingShift.role,
      start: editingShift.start_time,
      end: editingShift.end_time,
      unit: editingShift.unit,
      assignment_number: editingShift.assignment_number,
    };

    const res = await api.put(`/shifts/${editingShift.id}`, payload);
    setShifts((p) => p.map((x) => (x.id === editingShift.id ? res.data : x)));
    setEditingShift(null);
  };

  const filtered = shifts.filter((s) => {
    const w = staff.find((p) => p.id === s.staff_id);
    if (!w) return false;

    const matchName = !searchTerm || w.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = filterRole === "All" || w.role === filterRole;
    const matchUnit = filterUnit === "All" || s.unit === filterUnit;
    const matchShift = filterShift === "All" || getShiftType(s.start_time) === filterShift;

    let matchDate = true;
    if (filterDate) {
      const d = new Date(s.start_time).toLocaleDateString("en-CA");
      matchDate = d === filterDate;
    }

    return matchName && matchRole && matchUnit && matchShift && matchDate;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortOption === "start-asc") return new Date(a.start_time) - new Date(b.start_time);
    if (sortOption === "start-desc") return new Date(b.start_time) - new Date(a.start_time);
    return 0;
  });

  const shiftsByDay = {};
  sorted.forEach((s) => {
    const key = new Date(s.start_time).toLocaleDateString("en-CA");
    if (!shiftsByDay[key]) shiftsByDay[key] = [];
    shiftsByDay[key].push(s);
  });

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

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <div style={{ padding: "20px" }}>
      <h1>Shift Management</h1>

      {/* ADD SHIFT FORM */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <select
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            const p = staff.find((x) => x.id === Number(e.target.value));
            if (p) setRole(p.role);
          }}
        >
          <option value="">Select Staff</option>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.role})
            </option>
          ))}
        </select>

        <input value={role} placeholder="Role" readOnly style={{ width: "80px" }} />

        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">Unit</option>
          <option value="A Wing">A Wing</option>
          <option value="Middle">Middle</option>
          <option value="B Wing">B Wing</option>
        </select>

        <select value={assignment} onChange={(e) => setAssignment(e.target.value)}>
          <option value="">Assignment #</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />

        <button onClick={addShift}>Add Shift</button>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "15px" }}>
        <input
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option>All</option>
          <option>RN</option>
          <option>LPN</option>
          <option>CNA</option>
        </select>

        <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
          <option>All</option>
          <option>A Wing</option>
          <option>Middle</option>
          <option>B Wing</option>
        </select>

        <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
          <option>All</option>
          <option>Day</option>
          <option>Evening</option>
          <option>Night</option>
        </select>

        <input
          type="date"
          value={filterDate}
          onChange={(e) => {
            const val = e.target.value;
            setFilterDate(val);
            if (val) {
              const d = new Date(val);
              setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }
          }}
        />

        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
          <option value="start-asc">Start ↑</option>
          <option value="start-desc">Start ↓</option>
        </select>
      </div>

      {/* TEMPLATE BUILDER TOGGLE */}
      <button
        onClick={() => setTemplateBuilderOpen((p) => !p)}
        style={{ marginTop: "20px" }}
      >
        {templateBuilderOpen ? "Close Template Builder" : "Create Template"}
      </button>

      {/* TEMPLATE BUILDER BLOCK */}
      {templateBuilderOpen && (
  <div className="panel" style={{ marginTop: "10px" }}>
    <h3>Create Weekly Template</h3>

    {/* Template Options */}
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      <input
        placeholder="Template name..."
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
      />

      <input
        placeholder="Filter employee name..."
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
    </div>

    {/* TEMPLATE BUILDER TABLE */}
    <div style={{ marginTop: "15px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Include</th>
            <th>Name</th>
            <th>Role</th>
            <th>Unit</th>
            <th>Assignment</th>
            <th>Shift</th>
            <th style={{ textAlign: "center" }}>Sun</th>
            <th style={{ textAlign: "center" }}>Mon</th>
            <th style={{ textAlign: "center" }}>Tue</th>
            <th style={{ textAlign: "center" }}>Wed</th>
            <th style={{ textAlign: "center" }}>Thu</th>
            <th style={{ textAlign: "center" }}>Fri</th>
            <th style={{ textAlign: "center" }}>Sat</th>
          </tr>
        </thead>

        <tbody>
          {staff
            .filter((p) =>
              templateFilterName
                ? p.name.toLowerCase().includes(templateFilterName.toLowerCase())
                : true
            )
            .filter((p) =>
              templateFilterRole === "All" ? true : p.role === templateFilterRole
            )
            .map((p) => {
              const row = templateRows[p.id] || {
                include: false,
                unit: "",
                assignment: "",
                shiftType: "",
                days: Array(7).fill(false),
              };

              return (
                <tr key={p.id}>
                  {/* Include checkbox */}
                  <td>
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) =>
                        updateTemplateRow(p.id, { include: e.target.checked })
                      }
                    />
                  </td>

                  {/* Name */}
                  <td>{p.name}</td>

                  {/* Role */}
                  <td>{p.role}</td>

                  {/* Unit */}
                  <td>
                    <select
                      value={row.unit}
                      onChange={(e) =>
                        updateTemplateRow(p.id, { unit: e.target.value })
                      }
                    >
                      <option value="">--</option>
                      <option value="A Wing">A Wing</option>
                      <option value="Middle">Middle</option>
                      <option value="B Wing">B Wing</option>
                    </select>
                  </td>

                  {/* Assignment (CNA only) */}
                  <td>
                    {p.role === "CNA" ? (
                      <select
                        value={row.assignment}
                        onChange={(e) =>
                          updateTemplateRow(p.id, {
                            assignment: e.target.value,
                          })
                        }
                      >
                        <option value="">--</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ opacity: 0.5 }}>N/A</span>
                    )}
                  </td>

                  {/* Shift type */}
                  <td>
                    <select
                      value={row.shiftType}
                      onChange={(e) =>
                        updateTemplateRow(p.id, { shiftType: e.target.value })
                      }
                    >
                      <option value="">--</option>

                      {/* Nurses: Day/Night only */}
                      {p.role === "RN" || p.role === "LPN" ? (
                        <>
                          <option value="Day">Day (6a–6p)</option>
                          <option value="Night">Night (6p–6a)</option>
                        </>
                      ) : (
                        <>
                          <option value="Day">Day (6a–2p)</option>
                          <option value="Evening">Evening (2p–10p)</option>
                          <option value="Night">Night (10p–6a)</option>
                        </>
                      )}
                    </select>
                  </td>

                  {/* Days of week */}
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
        </tbody>
      </table>
    </div>

    <button
      style={{ marginTop: "15px", width: "200px" }}
      onClick={saveTemplate}
    >
      Save Template
    </button>
  </div>
)}

      {/* APPLY TEMPLATE */}
      <div className="panel" style={{ marginTop: "20px" }}>
        <h4>Apply Template</h4>

        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          style={{ minWidth: "250px" }}
        >
          <option value="">Select Template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <div>
            <div style={{ fontSize: "12px" }}>Week Start (Sunday)</div>
            <input
              type="date"
              value={templateWeekStart}
              onChange={(e) => setTemplateWeekStart(e.target.value)}
            />
          </div>

          <div>
            <div style={{ fontSize: "12px" }}>Weeks</div>
            <input
              type="number"
              min="1"
              value={templateWeeksCount}
              onChange={(e) => setTemplateWeeksCount(e.target.value)}
              style={{ width: "70px" }}
            />
          </div>
        </div>

        <button
          style={{ marginTop: "10px" }}
          onClick={() => {
            const tpl = templates.find((x) => x.id === Number(selectedTemplateId));
            if (!tpl) return alert("Choose a template.");
            applyTemplate(tpl);
          }}
        >
          Apply Template
        </button>
      </div>

      {/* CALENDAR HEADER */}
      <div
        style={{
          marginTop: "30px",
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

      {/* ROLE COLOR LEGEND */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "15px",
          fontSize: "14px",
          color: "var(--text-muted)",
        }}
      >
        Green = CNA · Blue = RN · Purple = LPN · Yellow ≥32h · Red = OT &gt; 40h
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
            const isToday = isSameDay(date, today);
            const inMonth =
              date.getMonth() === currentMonth.getMonth() &&
              date.getFullYear() === currentMonth.getFullYear();

            return (
              <div
                key={`${wi}-${di}`}
                className="calendar-cell"
                style={{
                  padding: "6px",
                  minHeight: "110px",
                  background: "var(--surface)",
                  border:
                    isToday
                      ? "2px solid var(--button-bg)"
                      : "1px solid var(--border)",
                  opacity: inMonth ? 1 : 0.35,
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
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
                    const w = staff.find((x) => x.id === s.staff_id) || {};

                    const weekKey = `${s.staff_id}|${getWeekStartKey(
                      s.start_time
                    )}`;
                    const bucket = weeklyBuckets[weekKey] || [];

                    let cumulative = 0;
                    for (const sh of bucket) {
                      cumulative += calcHours(sh.start_time, sh.end_time);
                      if (sh.id === s.id) break;
                    }

                    let borderColor = "transparent";
                    let showOT = false;
                    if (cumulative > 40) {
                      borderColor = "red";
                      showOT = true;
                    } else if (cumulative >= 32) {
                      borderColor = "yellow";
                    }

                    let bg = "#555";
                    if (w.role === "CNA") bg = "#00c853";
                    if (w.role === "RN") bg = "#4a90e2";
                    if (w.role === "LPN") bg = "#ba68c8";

                    return (
                      <div
                        key={s.id}
                        onClick={() => startEdit(s)}
                        style={{
                          padding: "4px 6px",
                          borderRadius: "999px",
                          background: bg,
                          border: `2px solid ${borderColor}`,
                          fontSize: "11px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          cursor: "pointer",
                        }}
                      >
                        {w.name} · {formatShiftRange(s.start_time, s.end_time)}
                        {showOT && <strong> OT</strong>}
                      </div>
                    );
                  })}

                  {dayShifts.length === 0 && (
                    <div style={{ fontSize: "11px", opacity: 0.25 }}>
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
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 5000,
          }}
        >
          <div className="modal" style={{ width: "380px" }}>
            <h3>Edit Shift</h3>

            <label>Start:</label>
            <input
              type="datetime-local"
              value={editingShift.start_time}
              onChange={(e) =>
                setEditingShift({ ...editingShift, start_time: e.target.value })
              }
            />

            <label>End:</label>
            <input
              type="datetime-local"
              value={editingShift.end_time}
              onChange={(e) =>
                setEditingShift({ ...editingShift, end_time: e.target.value })
              }
            />

            <label>Unit:</label>
            <select
              value={editingShift.unit}
              onChange={(e) =>
                setEditingShift({ ...editingShift, unit: e.target.value })
              }
            >
              <option value="A Wing">A Wing</option>
              <option value="Middle">Middle</option>
              <option value="B Wing">B Wing</option>
            </select>

            <label>Assignment:</label>
            <select
              value={editingShift.assignment_number || ""}
              onChange={(e) =>
                setEditingShift({
                  ...editingShift,
                  assignment_number: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            >
              <option value="">None</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
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

      {deleteId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 5000,
          }}
        >
          <div className="modal" style={{ width: "350px" }}>
            <h3>Delete Shift?</h3>
            <p>This cannot be undone.</p>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                style={{ background: "#b33", flex: 1 }}
                onClick={async () => {
                  await api.delete(`/shifts/${deleteId}`);
                  setShifts((p) => p.filter((x) => x.id !== deleteId));
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
  );
}
