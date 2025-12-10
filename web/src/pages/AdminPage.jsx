// src/pages/AdminPage.jsx

import { useEffect, useState } from "react";
import api from "../services/api";

export default function AdminPage() {
  // TAB SYSTEM ----------------------------------------------------
  const [activeTab, setActiveTab] = useState(
    localStorage.getItem("admin_active_tab") || "staff"
  );

  useEffect(() => {
    localStorage.setItem("admin_active_tab", activeTab);
  }, [activeTab]);

  // STAFF DATA ----------------------------------------------------
  const [staff, setStaff] = useState([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [editId, setEditId] = useState(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const [deleteId, setDeleteId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("name-asc");

  // UNIT DATA -----------------------------------------------------
  const [units, setUnits] = useState([]);
  const [newUnit, setNewUnit] = useState("");

  const [editUnitId, setEditUnitId] = useState(null);
  const [editUnitName, setEditUnitName] = useState("");

  const [deleteUnitId, setDeleteUnitId] = useState(null);
  const [showUnitModal, setShowUnitModal] = useState(false);

  // ASSIGNMENTS DATA ---------------------------------------------
  const [assignments, setAssignments] = useState([]);
  const [newAssignUnit, setNewAssignUnit] = useState("");
  const [newAssignNumber, setNewAssignNumber] = useState("");
  const [newAssignLabel, setNewAssignLabel] = useState("");

  const [editAssignId, setEditAssignId] = useState(null);
  const [editAssignUnit, setEditAssignUnit] = useState("");
  const [editAssignNumber, setEditAssignNumber] = useState("");
  const [editAssignLabel, setEditAssignLabel] = useState("");

  const [deleteAssignId, setDeleteAssignId] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // SHIFT SETTINGS DATA -------------------------------------------
  const [shiftSettings, setShiftSettings] = useState([]);
  const [newShiftRole, setNewShiftRole] = useState("");
  const [newShiftType, setNewShiftType] = useState("");
  const [newStartLocal, setNewStartLocal] = useState("");
  const [newEndLocal, setNewEndLocal] = useState("");

  const [editShiftId, setEditShiftId] = useState(null);
  const [editShiftRole, setEditShiftRole] = useState("");
  const [editShiftType, setEditShiftType] = useState("");
  const [editStartLocal, setEditStartLocal] = useState("");
  const [editEndLocal, setEditEndLocal] = useState("");

  // LOAD STAFF + UNITS + ASSIGNMENTS + SHIFT SETTINGS ------------
  useEffect(() => {
    loadStaff();
    loadUnits();
    loadAssignments();
    loadShiftSettings();
  }, []);

  const loadStaff = async () => {
    try {
      const data = await api.get("/staff");
      setStaff(data || []);
    } catch (err) {
      console.error("Failed to load staff:", err);
      setStaff([]);
    }
  };

  const loadUnits = async () => {
    try {
      const data = await api.get("/units");
      setUnits(data || []);
    } catch (err) {
      console.error("Failed to load units:", err);
      setUnits([]);
    }
  };

  const loadAssignments = async () => {
    try {
      const data = await api.get("/assignments");
      setAssignments(data || []);
    } catch (err) {
      console.error("Failed to load assignments:", err);
      setAssignments([]);
    }
  };

  const loadShiftSettings = async () => {
    try {
      const data = await api.get("/shift-settings");
      setShiftSettings(data || []);
    } catch (err) {
      console.error("Failed to load shift settings:", err);
      setShiftSettings([]);
    }
  };

  // STAFF FUNCTIONS -----------------------------------------------
  const addStaff = async () => {
    if (!firstName || !lastName || !role) {
      alert("Please fill in all required fields");
      return;
    }

    const payload = {
      name: `${firstName.trim()} ${lastName.trim()}`,
      role,
      email,
      phone,
    };

    try {
      const newStaffMember = await api.post("/staff", payload);
      setStaff([...staff, newStaffMember]);
      setFirstName("");
      setLastName("");
      setRole("");
      setEmail("");
      setPhone("");
    } catch (err) {
      console.error("Add staff failed:", err);
    }
  };

  const startEdit = (person) => {
    const [first, ...rest] = person.name.split(" ");
    const last = rest.join(" ");

    setEditId(person.id);
    setEditFirst(first);
    setEditLast(last);
    setEditRole(person.role);
    setEditEmail(person.email || "");
    setEditPhone(person.phone || "");
  };

  const saveEdit = async () => {
    const fullName = `${editFirst.trim()} ${editLast.trim()}`;
    const payload = {
      name: fullName,
      role: editRole,
      email: editEmail,
      phone: editPhone,
    };

    try {
      await api.put(`/staff/${editId}`, payload);
      setStaff(staff.map((s) => (s.id === editId ? { ...s, ...payload } : s)));
      setEditId(null);
    } catch (err) {
      console.error("Edit failed:", err);
    }
  };

  const confirmDelete = (id) => {
    setDeleteId(id);
    setShowModal(true);
  };

  const deleteStaff = async () => {
    try {
      await api.delete(`/staff/${deleteId}`);
      setStaff(staff.filter((s) => s.id !== deleteId));
    } catch (err) {
      console.error("Delete failed:", err);
    }

    setShowModal(false);
    setDeleteId(null);
  };

  // STAFF SEARCH + SORT -------------------------------------------
  const filtered = staff.filter((s) =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortOption === "name-asc") return a.name.localeCompare(b.name);
    if (sortOption === "name-desc") return b.name.localeCompare(a.name);
    if (sortOption === "role-asc") return a.role.localeCompare(b.role);
    if (sortOption === "role-desc") return b.role.localeCompare(a.role);
    return 0;
  });

  // UNIT FUNCTIONS -----------------------------------------------
  const addUnit = async () => {
    if (!newUnit.trim()) return alert("Unit name required.");

    try {
      const created = await api.post("/units", { name: newUnit.trim() });
      setUnits([...units, created]);
      setNewUnit("");
    } catch (err) {
      console.error("Add unit failed:", err);
      alert("Failed to add unit.");
    }
  };

  const startEditUnit = (unit) => {
    setEditUnitId(unit.id);
    setEditUnitName(unit.name);
  };

  const saveUnitEdit = async () => {
    try {
      const updated = await api.put(`/units/${editUnitId}`, {
        name: editUnitName.trim(),
      });

      setUnits(units.map((u) => (u.id === editUnitId ? updated : u)));

      setEditUnitId(null);
      setEditUnitName("");
    } catch (err) {
      console.error("Update unit failed:", err);
      alert("Failed to update unit.");
    }
  };

  const confirmDeleteUnit = (id) => {
    setDeleteUnitId(id);
    setShowUnitModal(true);
  };

  const deleteUnit = async () => {
    try {
      await api.delete(`/units/${deleteUnitId}`);
      setUnits(units.filter((u) => u.id !== deleteUnitId));
    } catch (err) {
      console.error("Delete unit failed:", err);
      alert("Could not delete — unit may be in use.");
    }

    setShowUnitModal(false);
    setDeleteUnitId(null);
  };

  // ASSIGNMENTS FUNCTIONS ----------------------------------------
  const addAssignment = async () => {
    if (!newAssignUnit || !newAssignNumber) {
      return alert("Unit and assignment number are required.");
    }

    const payload = {
      unit: newAssignUnit,
      number: Number(newAssignNumber),
      label: newAssignLabel.trim() || null,
    };

    try {
      const created = await api.post("/assignments", payload);
      setAssignments([...assignments, created]);
      setNewAssignUnit("");
      setNewAssignNumber("");
      setNewAssignLabel("");
    } catch (err) {
      console.error("Add assignment failed:", err);
      alert("Failed to add assignment.");
    }
  };

  const startEditAssignment = (assignment) => {
    setEditAssignId(assignment.id);
    setEditAssignUnit(assignment.unit);
    setEditAssignNumber(assignment.number);
    setEditAssignLabel(assignment.label || "");
  };

  const saveAssignEdit = async () => {
    if (!editAssignUnit || !editAssignNumber) {
      return alert("Unit and assignment number are required.");
    }

    const payload = {
      unit: editAssignUnit,
      number: Number(editAssignNumber),
      label: editAssignLabel.trim() || null,
    };

    try {
      const updated = await api.put(`/assignments/${editAssignId}`, payload);
      setAssignments(
        assignments.map((a) => (a.id === editAssignId ? updated : a))
      );
      setEditAssignId(null);
    } catch (err) {
      console.error("Update assignment failed:", err);
      alert("Failed to update assignment.");
    }
  };

  const confirmDeleteAssignment = (id) => {
    setDeleteAssignId(id);
    setShowAssignModal(true);
  };

  const deleteAssignment = async () => {
    try {
      await api.delete(`/assignments/${deleteAssignId}`);
      setAssignments(assignments.filter((a) => a.id !== deleteAssignId));
    } catch (err) {
      console.error("Delete assignment failed:", err);
      alert("Failed to delete assignment.");
    }

    setShowAssignModal(false);
    setDeleteAssignId(null);
  };

  // SHIFT SETTINGS FUNCTIONS -------------------------------------
  const addShiftSetting = async () => {
    if (!newShiftRole || !newShiftType || !newStartLocal || !newEndLocal) {
      return alert("Role, shift type, start and end times are required.");
    }

    const payload = {
      role: newShiftRole,
      shift_type: newShiftType,
      start_local: newStartLocal,
      end_local: newEndLocal,
    };

    try {
      const created = await api.post("/shift-settings", payload);
      setShiftSettings([...shiftSettings, created]);
      setNewShiftRole("");
      setNewShiftType("");
      setNewStartLocal("");
      setNewEndLocal("");
    } catch (err) {
      console.error("Add shift setting failed:", err);
      alert("Failed to add shift setting.");
    }
  };

  const startEditShiftSetting = (setting) => {
    setEditShiftId(setting.id);
    setEditShiftRole(setting.role);
    setEditShiftType(setting.shift_type);
    setEditStartLocal(setting.start_local);
    setEditEndLocal(setting.end_local);
  };

  const saveShiftSettingEdit = async () => {
    if (!editShiftRole || !editShiftType || !editStartLocal || !editEndLocal) {
      return alert("All fields are required.");
    }

    const payload = {
      role: editShiftRole,
      shift_type: editShiftType,
      start_local: editStartLocal,
      end_local: editEndLocal,
    };

    try {
      const updated = await api.put(`/shift-settings/${editShiftId}`, payload);
      setShiftSettings(
        shiftSettings.map((s) => (s.id === editShiftId ? updated : s))
      );
      setEditShiftId(null);
    } catch (err) {
      console.error("Update shift setting failed:", err);
      alert("Failed to update shift setting.");
    }
  };

  const deleteShiftSetting = async (id) => {
    if (!window.confirm("Delete this shift rule?")) return;

    try {
      await api.delete(`/shift-settings/${id}`);
      setShiftSettings(shiftSettings.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Delete shift setting failed:", err);
      alert("Failed to delete shift setting.");
    }
  };

  // MAIN RENDER ---------------------------------------------------
  return (
    <div style={{ padding: "20px", color: "white" }}>
      <h1>Admin Panel</h1>

      {/* TABS */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("staff")}
          style={{
            padding: "10px 18px",
            borderRadius: "6px",
            background: activeTab === "staff" ? "#2563eb" : "#374151",
            color: "white",
            border: "none",
          }}
        >
          Staff Management
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          style={{
            padding: "10px 18px",
            borderRadius: "6px",
            background: activeTab === "settings" ? "#2563eb" : "#374151",
            color: "white",
            border: "none",
          }}
        >
          Facility Settings
        </button>
      </div>

      {/* STAFF TAB ------------------------------------------------ */}
      {activeTab === "staff" && (
        <>
          {/* Search / sort */}
          <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
            <input
              placeholder="Search staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: "8px", width: "200px" }}
            />

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              style={{ padding: "8px" }}
            >
              <option value="name-asc">Name A → Z</option>
              <option value="name-desc">Name Z → A</option>
              <option value="role-asc">Role A → Z</option>
              <option value="role-desc">Role Z → A</option>
            </select>
          </div>

          {/* Add staff */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <input
              placeholder="First"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{ padding: "8px" }}
            />
            <input
              placeholder="Last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{ padding: "8px" }}
            />
            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: "8px" }}
            />
            <input
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ padding: "8px" }}
            />

            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ padding: "8px" }}
            >
              <option value="">Role</option>
              <option value="RN">RN</option>
              <option value="LPN">LPN</option>
              <option value="CNA">CNA</option>
            </select>

            <button onClick={addStaff} style={{ padding: "8px 14px" }}>
              Add
            </button>
          </div>

          {/* Staff table */}
          <table
            border="1"
            cellPadding="10"
            style={{ width: "100%", textAlign: "left" }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((s) => {
                const editing = editId === s.id;

                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>

                    <td>
                      {editing ? (
                        <>
                          <input
                            value={editFirst}
                            onChange={(e) => setEditFirst(e.target.value)}
                          />
                          <input
                            value={editLast}
                            onChange={(e) => setEditLast(e.target.value)}
                          />
                        </>
                      ) : (
                        s.name
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                        >
                          <option value="RN">RN</option>
                          <option value="LPN">LPN</option>
                          <option value="CNA">CNA</option>
                        </select>
                      ) : (
                        s.role
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                      ) : (
                        s.email || "-"
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                        />
                      ) : (
                        s.phone || "-"
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <>
                          <button onClick={saveEdit}>Save</button>
                          <button onClick={() => setEditId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(s)}>Edit</button>
                          <button onClick={() => confirmDelete(s.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* SETTINGS TAB --------------------------------------------- */}
      {activeTab === "settings" && (
        <>
          {/* UNITS --------------------------------------------------- */}
          <h2>Facility Units</h2>

          {/* Add Unit */}
          <div
            style={{ display: "flex", gap: "10px", marginBottom: "20px" }}
          >
            <input
              placeholder="Add new unit..."
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              style={{ padding: "8px", width: "200px" }}
            />

            <button onClick={addUnit} style={{ padding: "8px 14px" }}>
              Add Unit
            </button>
          </div>

          {/* Units table */}
          <table
            border="1"
            cellPadding="10"
            style={{ width: "100%", textAlign: "left", marginBottom: "40px" }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Unit Name</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {units.map((u) => {
                const editing = editUnitId === u.id;

                return (
                  <tr key={u.id}>
                    <td>{u.id}</td>

                    <td>
                      {editing ? (
                        <input
                          value={editUnitName}
                          onChange={(e) => setEditUnitName(e.target.value)}
                        />
                      ) : (
                        u.name
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <>
                          <button onClick={saveUnitEdit}>Save</button>
                          <button
                            onClick={() => {
                              setEditUnitId(null);
                              setEditUnitName("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditUnit(u)}>Edit</button>
                          <button onClick={() => confirmDeleteUnit(u.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* CNA ASSIGNMENTS ---------------------------------------- */}
          <h2 style={{ marginTop: "40px" }}>CNA Assignments</h2>

          {/* Add Assignment */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <select
              value={newAssignUnit}
              onChange={(e) => setNewAssignUnit(e.target.value)}
              style={{ padding: "8px" }}
            >
              <option value="">Select Unit…</option>
              {units.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>

            <input
              placeholder="Assignment #"
              type="number"
              value={newAssignNumber}
              onChange={(e) => setNewAssignNumber(e.target.value)}
              style={{ padding: "8px", width: "120px" }}
            />

            <input
              placeholder="Label (optional)"
              value={newAssignLabel}
              onChange={(e) => setNewAssignLabel(e.target.value)}
              style={{ padding: "8px", width: "200px" }}
            />

            <button onClick={addAssignment} style={{ padding: "8px 14px" }}>
              Add Assignment
            </button>
          </div>

          {/* Assignments table */}
          <table
            border="1"
            cellPadding="10"
            style={{ width: "100%", textAlign: "left", marginBottom: "40px" }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Unit</th>
                <th>#</th>
                <th>Label</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {assignments.map((a) => {
                const editing = editAssignId === a.id;

                return (
                  <tr key={a.id}>
                    <td>{a.id}</td>

                    <td>
                      {editing ? (
                        <select
                          value={editAssignUnit}
                          onChange={(e) => setEditAssignUnit(e.target.value)}
                        >
                          {units.map((u) => (
                            <option key={u.id} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        a.unit
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          type="number"
                          value={editAssignNumber}
                          onChange={(e) =>
                            setEditAssignNumber(e.target.value)
                          }
                        />
                      ) : (
                        a.number
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          value={editAssignLabel}
                          onChange={(e) =>
                            setEditAssignLabel(e.target.value)
                          }
                        />
                      ) : (
                        a.label || "-"
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <>
                          <button onClick={saveAssignEdit}>Save</button>
                          <button onClick={() => setEditAssignId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditAssignment(a)}>
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDeleteAssignment(a.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* SHIFT SETTINGS ----------------------------------------- */}
          <h2>Shift Settings (per Role & Shift Type)</h2>
          <p style={{ marginBottom: "10px", opacity: 0.8 }}>
            These settings control what times are used when you schedule shifts
            on the calendar. Times should be entered in 24-hour format, e.g.
            <code> 06:00</code>, <code>14:00</code>, <code>22:00</code>.
          </p>

          {/* Add shift setting */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            <select
              value={newShiftRole}
              onChange={(e) => setNewShiftRole(e.target.value)}
              style={{ padding: "8px" }}
            >
              <option value="">Role</option>
              <option value="RN">RN</option>
              <option value="LPN">LPN</option>
              <option value="CNA">CNA</option>
            </select>

            <select
              value={newShiftType}
              onChange={(e) => setNewShiftType(e.target.value)}
              style={{ padding: "8px" }}
            >
              <option value="">Shift Type</option>
              <option value="Day">Day</option>
              <option value="Evening">Evening</option>
              <option value="Night">Night</option>
            </select>

            <input
              placeholder="Start (e.g. 06:00)"
              value={newStartLocal}
              onChange={(e) => setNewStartLocal(e.target.value)}
              style={{ padding: "8px", width: "150px" }}
            />
            <input
              placeholder="End (e.g. 18:00)"
              value={newEndLocal}
              onChange={(e) => setNewEndLocal(e.target.value)}
              style={{ padding: "8px", width: "150px" }}
            />

            <button onClick={addShiftSetting} style={{ padding: "8px 14px" }}>
              Add Rule
            </button>
          </div>

          {/* Shift settings table */}
          <table
            border="1"
            cellPadding="10"
            style={{ width: "100%", textAlign: "left" }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Role</th>
                <th>Shift Type</th>
                <th>Start (local)</th>
                <th>End (local)</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {shiftSettings.map((s) => {
                const editing = editShiftId === s.id;

                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>

                    <td>
                      {editing ? (
                        <select
                          value={editShiftRole}
                          onChange={(e) => setEditShiftRole(e.target.value)}
                        >
                          <option value="RN">RN</option>
                          <option value="LPN">LPN</option>
                          <option value="CNA">CNA</option>
                        </select>
                      ) : (
                        s.role
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <select
                          value={editShiftType}
                          onChange={(e) => setEditShiftType(e.target.value)}
                        >
                          <option value="Day">Day</option>
                          <option value="Evening">Evening</option>
                          <option value="Night">Night</option>
                        </select>
                      ) : (
                        s.shift_type
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          value={editStartLocal}
                          onChange={(e) => setEditStartLocal(e.target.value)}
                        />
                      ) : (
                        s.start_local
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          value={editEndLocal}
                          onChange={(e) => setEditEndLocal(e.target.value)}
                        />
                      ) : (
                        s.end_local
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <>
                          <button onClick={saveShiftSettingEdit}>Save</button>
                          <button onClick={() => setEditShiftId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditShiftSetting(s)}>
                            Edit
                          </button>
                          <button
                            onClick={() => deleteShiftSetting(s.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* STAFF DELETE MODAL */}
      {showModal && (
        <DeleteModal
          title="Delete Staff Member?"
          onConfirm={deleteStaff}
          onCancel={() => setShowModal(false)}
        />
      )}

      {/* UNIT DELETE MODAL */}
      {showUnitModal && (
        <DeleteModal
          title="Delete Unit?"
          onConfirm={deleteUnit}
          onCancel={() => setShowUnitModal(false)}
        />
      )}

      {/* ASSIGNMENT DELETE MODAL */}
      {showAssignModal && (
        <DeleteModal
          title="Delete CNA Assignment?"
          onConfirm={deleteAssignment}
          onCancel={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// REUSABLE MODAL COMPONENT
// ----------------------------------------------------------------------

function DeleteModal({ title, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: "white",
          padding: "30px",
          borderRadius: "12px",
          textAlign: "center",
          color: "#111",
          width: "90%",
          maxWidth: "350px",
        }}
      >
        <h3 style={{ marginBottom: "10px" }}>{title}</h3>
        <p style={{ marginBottom: "20px" }}>This action cannot be undone.</p>

        <button
          onClick={onConfirm}
          style={{
            background: "red",
            color: "white",
            padding: "8px 16px",
            border: "none",
            borderRadius: "6px",
            marginRight: "12px",
          }}
        >
          Delete
        </button>

        <button
          onClick={onCancel}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid black",
            background: "white",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
