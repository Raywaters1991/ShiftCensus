import { useEffect, useState } from "react";
import api from "../services/api";

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);

  // Add shift form
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [unit, setUnit] = useState("");
  const [assignment, setAssignment] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterUnit, setFilterUnit] = useState("All");
  const [filterShift, setFilterShift] = useState("All");
  const [filterDate, setFilterDate] = useState("");

  // Sorting
  const [sortOption, setSortOption] = useState("start-asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Templates
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateBuilderOpen, setTemplateBuilderOpen] = useState(false);

  // Template builder fields
  const [templateName, setTemplateName] = useState("");
  const [templateStaffId, setTemplateStaffId] = useState("");
  const [templateRole, setTemplateRole] = useState("");
  const [templateUnit, setTemplateUnit] = useState("");
  const [templateAssignment, setTemplateAssignment] = useState("");
  const [templateShiftType, setTemplateShiftType] = useState("");
  const [templateDays, setTemplateDays] = useState([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const [templateWeekStart, setTemplateWeekStart] = useState("");
  const [templateWeeksCount, setTemplateWeeksCount] = useState(1);

  // RN/LPN: only Day/Night. CNA: Day/Evening/Night.
  const availableTemplateShiftTypes =
    templateRole === "RN" || templateRole === "LPN"
      ? ["Day", "Night"]
      : ["Day", "Evening", "Night"];

  // Edit + delete state
  const [editingShift, setEditingShift] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

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

  const formatDate = (dt) => {
    if (!dt) return "-";
    const date = new Date(dt);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getShiftType = (start) => {
    const hour = new Date(start).getHours();
    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const addShift = async () => {
    if (!staffId || !role || !start || !end || !unit) {
      alert("Fill all required fields");
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
    setShifts([...shifts, res.data]);

    setStaffId("");
    setRole("");
    setStart("");
    setEnd("");
    setUnit("");
    setAssignment("");
  };

  // ======= TEMPLATE HELPERS =======

  const toggleTemplateDay = (idx) => {
    const updated = [...templateDays];
    updated[idx] = !updated[idx];
    setTemplateDays(updated);
  };

  const saveTemplate = () => {
    if (!templateName || !templateStaffId || !templateShiftType) {
      alert("Fill all template fields.");
      return;
    }

    const newTemplate = {
      id: Date.now(),
      name: templateName,
      staffId: Number(templateStaffId),
      role: templateRole,
      unit: templateUnit,
      assignment: templateAssignment ? Number(templateAssignment) : null,
      shiftType: templateShiftType,
      days: templateDays,
    };

    const updated = [...templates, newTemplate];
    localStorage.setItem("shift_templates", JSON.stringify(updated));
    setTemplates(updated);

    alert("Template saved.");

    setTemplateName("");
    setTemplateStaffId("");
    setTemplateRole("");
    setTemplateUnit("");
    setTemplateAssignment("");
    setTemplateShiftType("");
    setTemplateDays([false, false, false, false, false, false, false]);
  };

  const deleteTemplate = (id) => {
    const updated = templates.filter((t) => t.id !== id);
    localStorage.setItem("shift_templates", JSON.stringify(updated));
    setTemplates(updated);
    if (String(id) === String(selectedTemplateId)) {
      setSelectedTemplateId("");
    }
  };

  const applyTemplate = async (tpl) => {
    if (!templateWeekStart) {
      alert("Select a week start date.");
      return;
    }
    if (!templateWeeksCount) {
      alert("Enter how many weeks to apply.");
      return;
    }

    const org_code = localStorage.getItem("org_code");
    const base = new Date(templateWeekStart);

    const toCreate = [];

    for (let w = 0; w < templateWeeksCount; w++) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        if (!tpl.days[dayIdx]) continue;

        const d = new Date(base);
        d.setDate(base.getDate() + dayIdx + w * 7);

        let startTime;
        let endTime;

        if (tpl.shiftType === "Day") {
          startTime = new Date(d);
          startTime.setHours(6, 0, 0, 0);
          endTime = new Date(d);
          endTime.setHours(18, 0, 0, 0);
        } else if (tpl.shiftType === "Evening") {
          startTime = new Date(d);
          startTime.setHours(14, 0, 0, 0);
          endTime = new Date(d);
          endTime.setHours(22, 0, 0, 0);
        } else {
          // Night: 18:00 to 06:00 next day
          startTime = new Date(d);
          startTime.setHours(18, 0, 0, 0);
          endTime = new Date(d);
          endTime.setDate(endTime.getDate() + 1);
          endTime.setHours(6, 0, 0, 0);
        }

        toCreate.push({
          staffId: tpl.staffId,
          role: tpl.role,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          unit: tpl.unit,
          assignment_number: tpl.assignment,
          org_code,
        });
      }
    }

    for (const payload of toCreate) {
      await api.post("/shifts", payload);
    }

    alert("Template applied.");
    loadPage();
  };

  // ======= EDIT / DELETE =======

  const startEdit = (shift) => {
    setEditingShift({
      ...shift,
      start_time: shift.start_time.slice(0, 16),
      end_time: shift.end_time.slice(0, 16),
    });
  };

  const saveEdit = async () => {
    if (!editingShift) return;

    const payload = {
      role: editingShift.role,
      start: editingShift.start_time,
      end: editingShift.end_time,
      unit: editingShift.unit,
      assignment_number: editingShift.assignment_number,
    };

    const res = await api.put(`/shifts/${editingShift.id}`, payload);

    setShifts((prev) =>
      prev.map((s) => (s.id === editingShift.id ? res.data : s))
    );
    setEditingShift(null);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await api.delete(`/shifts/${deleteId}`);
    setShifts((prev) => prev.filter((s) => s.id !== deleteId));
    setDeleteId(null);
  };

  // ======= FILTERING / SORT / PAGINATION =======

  const normalizedSearch = searchTerm.toLowerCase();

  const filtered = shifts.filter((shift) => {
    const worker = staff.find((s) => s.id === shift.staff_id);
    if (!worker) return false;

    const matchesSearch =
      !normalizedSearch ||
      worker.name.toLowerCase().includes(normalizedSearch);

    const matchesRole =
      filterRole === "All" || worker.role === filterRole;

    const matchesUnit =
      filterUnit === "All" || shift.unit === filterUnit;

    const shiftType = getShiftType(shift.start_time);
    const matchesShift =
      filterShift === "All" || filterShift === shiftType;

    let matchesDate = true;
    if (filterDate) {
      // use local date to avoid off-by-one from UTC
      const shiftDay = new Date(shift.start_time)
        .toLocaleDateString("en-CA"); // YYYY-MM-DD
      matchesDate = shiftDay === filterDate;
    }

    return (
      matchesSearch &&
      matchesRole &&
      matchesUnit &&
      matchesShift &&
      matchesDate
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const aStaff = staff.find((s) => s.id === a.staff_id) || {};
    const bStaff = staff.find((s) => s.id === b.staff_id) || {};

    if (sortOption === "name-asc")
      return (aStaff.name || "").localeCompare(bStaff.name || "");
    if (sortOption === "name-desc")
      return (bStaff.name || "").localeCompare(aStaff.name || "");

    if (sortOption === "role-asc")
      return (aStaff.role || "").localeCompare(bStaff.role || "");
    if (sortOption === "role-desc")
      return (bStaff.role || "").localeCompare(aStaff.role || "");

    if (sortOption === "start-asc")
      return new Date(a.start_time) - new Date(b.start_time);
    if (sortOption === "start-desc")
      return new Date(b.start_time) - new Date(a.start_time);

    return 0;
  });

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(startIndex, startIndex + pageSize);

  return (
    <div style={{ color: "white", padding: "20px" }}>
      <h1>Shift Management</h1>

      {/* ADD SHIFT FORM */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "20px",
          alignItems: "center",
        }}
      >
        <select
          value={staffId}
          onChange={(e) => {
            const id = e.target.value;
            setStaffId(id);
            const person = staff.find((s) => String(s.id) === id);
            if (person) setRole(person.role);
          }}
        >
          <option value="">Select Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.role})
            </option>
          ))}
        </select>

        <input
          placeholder="Role"
          value={role}
          readOnly
          style={{ width: "90px", background: "#222", color: "#ccc" }}
        />

        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">Unit</option>
          <option value="A Wing">A Wing</option>
          <option value="Middle">Middle</option>
          <option value="B Wing">B Wing</option>
        </select>

        <select
          value={assignment}
          onChange={(e) => setAssignment(e.target.value)}
        >
          <option value="">Assignment #</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />

        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />

        <button
          onClick={addShift}
          style={{
            padding: "8px 14px",
            background: "#3c7",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
          }}
        >
          Add Shift
        </button>
      </div>

      {/* FILTERS */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "20px",
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

        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />

        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
        >
          <option value="start-asc">Start ↑</option>
          <option value="start-desc">Start ↓</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="role-asc">Role A–Z</option>
          <option value="role-desc">Role Z–A</option>
        </select>
      </div>

      {/* TEMPLATE SECTION (button that opens builder) */}
      <div
        style={{
          marginBottom: "20px",
          padding: "14px",
          borderRadius: "10px",
          background: "#151515",
        }}
      >
        <button
          onClick={() => setTemplateBuilderOpen((prev) => !prev)}
          style={{
            padding: "10px 14px",
            background: "#4a90e2",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
            cursor: "pointer",
            color: "white",
            marginBottom: "10px",
          }}
        >
          {templateBuilderOpen ? "Close Template Builder" : "Create Template"}
        </button>

        {templateBuilderOpen && (
          <div style={{ paddingTop: "10px", borderTop: "1px solid #333" }}>
            <h3 style={{ marginTop: 0 }}>New Weekly Template</h3>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <input
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={{ padding: "6px", minWidth: "160px" }}
              />

              <select
                value={templateStaffId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateStaffId(id);
                  const person = staff.find((s) => String(s.id) === id);
                  if (person) setTemplateRole(person.role);
                }}
                style={{ padding: "6px" }}
              >
                <option value="">Employee</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>

              <input
                readOnly
                value={templateRole}
                placeholder="Role"
                style={{
                  padding: "6px",
                  width: "90px",
                  background: "#222",
                  border: "1px solid #333",
                  color: "#ccc",
                }}
              />

              <select
                value={templateUnit}
                onChange={(e) => setTemplateUnit(e.target.value)}
                style={{ padding: "6px" }}
              >
                <option value="">Unit</option>
                <option value="A Wing">A Wing</option>
                <option value="Middle">Middle</option>
                <option value="B Wing">B Wing</option>
              </select>

              <select
                value={templateAssignment}
                onChange={(e) => setTemplateAssignment(e.target.value)}
                style={{ padding: "6px" }}
              >
                <option value="">Assignment #</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <select
                value={templateShiftType}
                onChange={(e) => setTemplateShiftType(e.target.value)}
                style={{ padding: "6px" }}
              >
                <option value="">Shift Type</option>
                {availableTemplateShiftTypes.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{ marginBottom: "4px", fontWeight: "bold" }}
                >
                  Days of Week
                </div>
                {[
                  [0, "Sun"],
                  [1, "Mon"],
                  [2, "Tue"],
                  [3, "Wed"],
                  [4, "Thu"],
                  [5, "Fri"],
                  [6, "Sat"],
                ].map(([idx, label]) => (
                  <label key={idx} style={{ marginRight: "8px" }}>
                    <input
                      type="checkbox"
                      checked={templateDays[idx]}
                      onChange={() => toggleTemplateDay(idx)}
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={saveTemplate}
              style={{
                marginTop: "12px",
                padding: "8px 14px",
                background: "#3c7",
                borderRadius: "6px",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Save Template
            </button>
          </div>
        )}

        {/* APPLY TEMPLATE AREA */}
        <div
          style={{
            marginTop: "20px",
            paddingTop: "10px",
            borderTop: "1px solid #333",
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>Apply Template</h4>

          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            style={{ padding: "8px", minWidth: "280px", marginRight: "10px" }}
          >
            <option value="">Select a Template...</option>
            {templates.map((t) => {
              const tStaff = staff.find((s) => s.id === t.staffId);
              return (
                <option key={t.id} value={t.id}>
                  {t.name} — {tStaff ? tStaff.name : "Unknown"} (
                  {t.shiftType})
                </option>
              );
            })}
          </select>

          {selectedTemplateId && (
            <button
              onClick={() => deleteTemplate(Number(selectedTemplateId))}
              style={{
                marginRight: "10px",
                padding: "6px 10px",
                background: "#b33",
                border: "none",
                borderRadius: "4px",
                color: "white",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          )}

          <div style={{ marginTop: "12px", display: "flex", gap: "15px" }}>
            <div>
              <div style={{ fontSize: "13px" }}>Week Start (Sunday)</div>
              <input
                type="date"
                value={templateWeekStart}
                onChange={(e) => setTemplateWeekStart(e.target.value)}
                style={{ padding: "6px" }}
              />
            </div>

            <div>
              <div style={{ fontSize: "13px" }}>Weeks</div>
              <input
                type="number"
                min="1"
                value={templateWeeksCount}
                onChange={(e) => setTemplateWeeksCount(e.target.value)}
                style={{ padding: "6px", width: "80px" }}
              />
            </div>
          </div>

          <button
            onClick={() => {
              const tpl = templates.find(
                (temp) => String(temp.id) === String(selectedTemplateId)
              );
              if (!tpl) return alert("Select a template first.");
              applyTemplate(tpl);
            }}
            style={{
              marginTop: "12px",
              padding: "10px 18px",
              background: "#4a90e2",
              border: "none",
              borderRadius: "6px",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Apply Template
          </button>
        </div>
      </div>

      {/* SHIFT TABLE – BLUE THEME + EDIT/DELETE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: "20px",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <thead>
          <tr style={{ background: "#003366", color: "white" }}>
            <th style={{ padding: "10px", textAlign: "left" }}>Name</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Role</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Unit</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Assignment</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Start</th>
            <th style={{ padding: "10px", textAlign: "left" }}>End</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Shift</th>
            <th style={{ padding: "10px", textAlign: "left" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((s, idx) => {
            const worker = staff.find((x) => x.id === s.staff_id) || {};
            const shiftType = getShiftType(s.start_time);

            const baseColor = idx % 2 === 0 ? "#0a1a33" : "#11284d";

            return (
              <tr
                key={s.id}
                style={{
                  background: baseColor,
                  transition: "background 0.2s",
                }}
              >
                <td style={{ padding: "10px" }}>{worker.name}</td>
                <td style={{ padding: "10px" }}>{worker.role}</td>
                <td style={{ padding: "10px" }}>{s.unit}</td>
                <td style={{ padding: "10px" }}>
                  {s.assignment_number || "-"}
                </td>
                <td style={{ padding: "10px" }}>
                  {formatDate(s.start_time)}
                </td>
                <td style={{ padding: "10px" }}>
                  {formatDate(s.end_time)}
                </td>
                <td style={{ padding: "10px" }}>{shiftType}</td>
                <td
                  style={{
                    padding: "10px",
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => startEdit(s)}
                    style={{
                      padding: "4px 8px",
                      background: "#4a90e2",
                      borderRadius: "4px",
                      border: "none",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteId(s.id)}
                    style={{
                      padding: "4px 8px",
                      background: "#b33",
                      borderRadius: "4px",
                      border: "none",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      <div
        style={{
          marginTop: "20px",
          display: "flex",
          gap: "10px",
          alignItems: "center",
        }}
      >
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((c) => c - 1)}
        >
          Prev
        </button>
        <div>
          Page {currentPage} / {totalPages} (Total {totalItems} shifts)
        </div>
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((c) => c + 1)}
        >
          Next
        </button>
      </div>

      {/* EDIT MODAL */}
      {editingShift && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#111",
              padding: "20px",
              borderRadius: "12px",
              width: "380px",
              color: "white",
            }}
          >
            <h3>Edit Shift</h3>

            <div style={{ marginBottom: "10px" }}>
              <label>Start:</label>
              <input
                type="datetime-local"
                value={editingShift.start_time}
                onChange={(e) =>
                  setEditingShift({
                    ...editingShift,
                    start_time: e.target.value,
                  })
                }
              />
            </div>

            <div style={{ marginBottom: "10px" }}>
              <label>End:</label>
              <input
                type="datetime-local"
                value={editingShift.end_time}
                onChange={(e) =>
                  setEditingShift({
                    ...editingShift,
                    end_time: e.target.value,
                  })
                }
              />
            </div>

            <div style={{ marginBottom: "10px" }}>
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
            </div>

            <div style={{ marginBottom: "10px" }}>
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
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={saveEdit}
                style={{
                  padding: "6px 10px",
                  background: "#4a90e2",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Save
              </button>

              <button
                onClick={() => setEditingShift(null)}
                style={{
                  padding: "6px 10px",
                  background: "#666",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteId !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#222",
              padding: "20px",
              borderRadius: "12px",
              width: "360px",
              color: "white",
              textAlign: "center",
            }}
          >
            <h3>Delete Shift?</h3>
            <p>This action cannot be undone.</p>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  background: "#b33",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Yes, Delete
              </button>

              <button
                onClick={() => setDeleteId(null)}
                style={{
                  flex: 1,
                  background: "#666",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                }}
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
