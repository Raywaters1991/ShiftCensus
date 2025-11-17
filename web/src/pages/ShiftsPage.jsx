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
  const [sortOption, setSortOption] = useState("start-asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editShift, setEditShift] = useState(null);

  // Delete Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteShiftId, setDeleteShiftId] = useState(null);

  // LOAD DATA
  useEffect(() => {
    loadPage();
    const interval = setInterval(loadPage, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadPage = async () => {
    const shiftRes = await api.get("/shifts");
    const staffRes = await api.get("/staff");

    setShifts(shiftRes.data);
    setStaff(staffRes.data);
  };

  // Format readable date
  const formatDate = (dt) => {
    if (!dt) return "-";
    return new Date(dt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Determine shift type
  const getShiftType = (start) => {
    const hour = new Date(start).getHours();
    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  // Row color by shift
  const shiftColor = (shift) => {
    const t = getShiftType(shift.start_time);
    if (t === "Day") return "#2e8b57";       // Green
    if (t === "Evening") return "#c97a20";   // Orange
    return "#1e5aa8";                        // Blue
  };

  // Add Shift
  const addShift = async () => {
    if (!staffId || !role || !start || !end) {
      alert("Fill all required fields");
      return;
    }

    const payload = {
      staffId: Number(staffId),
      role,
      start,
      end,
      unit,
      assignment_number: assignment ? Number(assignment) : null,
    };

    const res = await api.post("/shifts", payload);
    setShifts([...shifts, res.data]);

    // Reset form
    setStaffId("");
    setRole("");
    setStart("");
    setEnd("");
    setUnit("");
    setAssignment("");
  };

  // FILTER + SORT
  const normalizedSearch = searchTerm.toLowerCase();

  const filtered = shifts.filter((shift) => {
    const worker = staff.find((s) => s.id === shift.staff_id);
    if (!worker) return false;

    const matchesSearch =
      !normalizedSearch || worker.name.toLowerCase().includes(normalizedSearch);

    const matchesRole =
      filterRole === "All" || worker.role === filterRole;

    const matchesUnit =
      filterUnit === "All" || shift.unit === filterUnit;

    const matchesShift =
      filterShift === "All" ||
      filterShift === getShiftType(shift.start_time);

    return matchesSearch && matchesRole && matchesUnit && matchesShift;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aStaff = staff.find((s) => s.id === a.staff_id);
    const bStaff = staff.find((s) => s.id === b.staff_id);

    switch (sortOption) {
      case "name-asc":
        return aStaff.name.localeCompare(bStaff.name);
      case "name-desc":
        return bStaff.name.localeCompare(aStaff.name);
      case "role-asc":
        return aStaff.role.localeCompare(bStaff.role);
      case "role-desc":
        return bStaff.role.localeCompare(aStaff.role);
      case "start-asc":
        return new Date(a.start_time) - new Date(b.start_time);
      case "start-desc":
        return new Date(b.start_time) - new Date(a.start_time);
      default:
        return 0;
    }
  });

  // Pagination
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(startIndex, startIndex + pageSize);

  // EDIT SHIFT
  const openEditModal = (shift) => {
    setEditShift({ ...shift });
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    const res = await api.put(`/shifts/${editShift.id}`, {
      staffId: editShift.staff_id,
      role: editShift.role,
      start: editShift.start_time,
      end: editShift.end_time,
      unit: editShift.unit,
      assignment_number: editShift.assignment_number,
    });

    setShifts(shifts.map((sh) => (sh.id === editShift.id ? res.data : sh)));
    setEditModalOpen(false);
  };

  // DELETE SHIFT
  const openDeleteModal = (id) => {
    setDeleteShiftId(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    await api.delete(`/shifts/${deleteShiftId}`);
    setShifts(shifts.filter((s) => s.id !== deleteShiftId));
    setDeleteModalOpen(false);
  };

  return (
    <div style={{ padding: "20px", color: "white" }}>
      <h1>Shift Management</h1>

      {/* Add Shift Form */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">Select Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.role})
            </option>
          ))}
        </select>

        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Role</option>
          <option value="RN">RN</option>
          <option value="LPN">LPN</option>
          <option value="CNA">CNA</option>
        </select>

        <input type="datetime-local" value={start}
          onChange={(e) => setStart(e.target.value)} />

        <input type="datetime-local" value={end}
          onChange={(e) => setEnd(e.target.value)} />

        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">Unit</option>
          <option value="A Wing">A Wing</option>
          <option value="B Wing">B Wing</option>
          <option value="Middle">Middle</option>
        </select>

        <select value={assignment} onChange={(e) => setAssignment(e.target.value)}>
          <option value="">Assignment #</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <button onClick={addShift}>Add Shift</button>
      </div>

      {/* Table */}
      <table border="1" cellPadding="10" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Unit</th>
            <th>Assignment</th>
            <th>Shift</th>
            <th>Start</th>
            <th>End</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {pageItems.map((shift) => {
            const person = staff.find((s) => s.id === shift.staff_id);

            return (
              <tr key={shift.id}
                style={{ backgroundColor: shiftColor(shift), color: "white" }}>
                <td>{person?.name}</td>
                <td>{person?.role}</td>
                <td>{shift.unit || "-"}</td>
                <td>{shift.assignment_number || "-"}</td>
                <td>{getShiftType(shift.start_time)}</td>
                <td>{formatDate(shift.start_time)}</td>
                <td>{formatDate(shift.end_time)}</td>

                <td>
                  {/* EDIT BUTTON */}
                  <button
                    onClick={() => openEditModal(shift)}
                    style={{
                      padding: "6px 12px",
                      background: "#4466ff",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      marginRight: "6px",
                      transition: "0.2s"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "#3355dd"}
                    onMouseLeave={(e) => e.target.style.background = "#4466ff"}
                  >
                    Edit
                  </button>

                  {/* DELETE BUTTON */}
                  <button
                    onClick={() => openDeleteModal(shift.id)}
                    style={{
                      padding: "6px 12px",
                      background: "#b33",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      transition: "0.2s"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "#992222"}
                    onMouseLeave={(e) => e.target.style.background = "#b33"}
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
      <div style={{ marginTop: "20px" }}>
        <button disabled={currentPage === 1}
          onClick={() => setCurrentPage(currentPage - 1)}>
          Prev
        </button>

        <span style={{ margin: "0 10px" }}>
          Page {currentPage} / {totalPages}
        </span>

        <button disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(currentPage + 1)}>
          Next
        </button>
      </div>

      {/* Edit Modal */}
      {editModalOpen && editShift && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2>Edit Shift</h2>

            <label>Start Time</label>
            <input
              type="datetime-local"
              value={editShift.start_time}
              onChange={(e) =>
                setEditShift({ ...editShift, start_time: e.target.value })
              }
            />

            <label>End Time</label>
            <input
              type="datetime-local"
              value={editShift.end_time}
              onChange={(e) =>
                setEditShift({ ...editShift, end_time: e.target.value })
              }
            />

            <label>Unit</label>
            <select
              value={editShift.unit || ""}
              onChange={(e) =>
                setEditShift({ ...editShift, unit: e.target.value })
              }
            >
              <option value="">None</option>
              <option value="A Wing">A Wing</option>
              <option value="B Wing">B Wing</option>
              <option value="Middle">Middle</option>
            </select>

            <label>Assignment #</label>
            <select
              value={editShift.assignment_number || ""}
              onChange={(e) =>
                setEditShift({
                  ...editShift,
                  assignment_number: Number(e.target.value)
                })
              }
            >
              <option value="">None</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <div className="modal-actions">
              <button onClick={saveEdit}>Save</button>
              <button onClick={() => setEditModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2>Confirm Delete</h2>
            <p>Are you sure you want to delete this shift?</p>

            <div className="modal-actions">
              <button
                onClick={confirmDelete}
                style={{
                  padding: "8px 15px",
                  background: "#b33",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "0.2s"
                }}
                onMouseEnter={(e) => e.target.style.background = "#992222"}
                onMouseLeave={(e) => e.target.style.background = "#b33"}
              >
                Delete
              </button>

              <button
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  padding: "8px 15px",
                  background: "#555",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "0.2s"
                }}
                onMouseEnter={(e) => e.target.style.background = "#444"}
                onMouseLeave={(e) => e.target.style.background = "#555"}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Styling */}
      <style>{`
        table {
          border-collapse: collapse;
          background: #1a1a1a;
        }

        th {
          background: #333;
          color: white;
          padding: 10px;
          font-weight: bold;
        }

        td {
          padding: 8px;
          border-top: 1px solid #444;
        }

        tr:hover {
          filter: brightness(1.15);
        }

        .modal-overlay {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-box {
          background: #222;
          padding: 25px;
          border-radius: 10px;
          width: 400px;
          color: white;
        }

        .modal-box input, .modal-box select {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          background: #333;
          border: 1px solid #555;
          color: white;
        }

        .modal-actions {
          display: flex;
          justify-content: space-between;
        }
      `}</style>
    </div>
  );
}
