// src/pages/AdminPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";

const SHIFT_TYPES = ["Day", "Evening", "Night"];

export default function AdminPage() {
  const { orgName, orgLogo, role } = useUser();

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "staff";
    return window.localStorage.getItem("admin_active_tab") || "staff";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin_active_tab", activeTab);
    }
  }, [activeTab]);

  const [loading, setLoading] = useState(false);

  // ---------------------------
  // Core Admin Data
  // ---------------------------
  const [staff, setStaff] = useState([]);
  const [units, setUnits] = useState([]);
  const [shiftSettings, setShiftSettings] = useState([]);

  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingShiftId, setEditingShiftId] = useState(null);

  const [staffForm, setStaffForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [unitForm, setUnitForm] = useState({ name: "" });
  const [shiftForm, setShiftForm] = useState({
    role: "",
    shift_type: "Day",
    start_local: "07:00",
    end_local: "15:00",
  });

  // ---------------------------
  // PRIVACY SETTINGS
  // ---------------------------
  const [orgSettings, setOrgSettings] = useState(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [showAck, setShowAck] = useState(false);

  // ---------------------------
  // ROOMS & BEDS (NEW)
  // ---------------------------
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [roomForm, setRoomForm] = useState({ name: "", is_active: true });
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomSaving, setRoomSaving] = useState(false);

  const [beds, setBeds] = useState([]);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [bedForm, setBedForm] = useState({ label: "", is_active: true });
  const [editingBedId, setEditingBedId] = useState(null);
  const [bedSaving, setBedSaving] = useState(false);

  const dragBedIdRef = useRef(null);

  const canManagePrivacy = ["superadmin", "admin", "don", "ed"].includes(String(role || "").toLowerCase());
  const canManageFacility = ["superadmin", "admin", "don", "ed"].includes(String(role || "").toLowerCase());

  useEffect(() => {
    loadAll();
    loadOrgSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, u, ss] = await Promise.all([api.get("/staff"), api.get("/units"), api.get("/shift-settings")]);
      setStaff(Array.isArray(s) ? s : []);
      setUnits(Array.isArray(u) ? u : []);
      setShiftSettings(Array.isArray(ss) ? ss : []);
    } catch (err) {
      console.error("ADMIN LOAD ERROR:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrgSettings() {
    try {
      const data = await api.get("/org-settings");
      setOrgSettings(data);
    } catch (e) {
      console.error("ORG SETTINGS LOAD ERROR:", e);
      setOrgSettings({
        show_patient_identifiers: false,
        identifier_format: "first_last_initial",
      });
    }
  }

  // ---------------------------
  // Rooms/Beds load
  // ---------------------------
  async function loadRooms() {
    setRoomsLoading(true);
    try {
      const data = await api.get("/facility/rooms");
      const list = Array.isArray(data) ? data : [];

      // Ensure stable order (backend already sorts, but keep UI safe)
      const sorted = list.slice().sort(sortByOrderThenName);

      setRooms(sorted);

      const firstActive = sorted.find((r) => r.is_active !== false) || sorted[0] || null;
      setSelectedRoomId((prev) => prev ?? firstActive?.id ?? null);

      // IMPORTANT: backend returns beds nested on each room
      const currentRoomId = (selectedRoomId ?? firstActive?.id) || null;
      if (currentRoomId) {
        const room = sorted.find((r) => r.id === currentRoomId);
        setBeds(Array.isArray(room?.beds) ? room.beds.slice().sort(sortByOrderThenLabel) : []);
      } else {
        setBeds([]);
      }
    } catch (e) {
      console.error("LOAD ROOMS ERROR:", e);
      alert(
        e?.message ||
          "Failed to load rooms. If you haven’t added the backend /api/facility routes yet, say so and I’ll wire them."
      );
    } finally {
      setRoomsLoading(false);
      setBedsLoading(false);
    }
  }

  function syncBedsFromRooms(roomId, roomsList) {
    const list = Array.isArray(roomsList) ? roomsList : rooms;
    const room = list.find((r) => r.id === roomId);
    const nextBeds = Array.isArray(room?.beds) ? room.beds.slice().sort(sortByOrderThenLabel) : [];
    setBeds(nextBeds);
  }

  // Load rooms when tab opens
  useEffect(() => {
    if (activeTab !== "rooms_beds") return;
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // When room selection changes, derive beds from rooms (NO extra API call)
  useEffect(() => {
    if (activeTab !== "rooms_beds") return;
    if (!selectedRoomId) {
      setBeds([]);
      return;
    }
    setBedsLoading(true);
    try {
      syncBedsFromRooms(selectedRoomId);
    } finally {
      setBedsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, activeTab, rooms]);

  // ---------------------------
  // Privacy save
  // ---------------------------
  async function savePrivacy({ enabled, format, acknowledged }) {
    setPrivacySaving(true);
    try {
      const updated = await api.put("/org-settings/identifiers", { enabled, format, acknowledged });
      setOrgSettings(updated);
    } catch (e) {
      alert(e.message || "Failed to update privacy settings");
    } finally {
      setPrivacySaving(false);
    }
  }

  // ==================================================
  // STAFF ACTIONS
  // ==================================================
  async function saveStaff(id) {
    const payload = {
      name: String(staffForm.name || "").trim(),
      role: String(staffForm.role || "").trim(),
      email: String(staffForm.email || "").trim() || null,
      phone: String(staffForm.phone || "").trim() || null,
    };
    const updated = await api.patch(`/staff/${id}`, payload);
    setStaff((prev) => prev.map((s) => (s.id === id ? updated : s)));
    setEditingStaffId(null);
  }

  async function deleteStaff(id) {
    if (!window.confirm("Delete this staff member?")) return;
    await api.delete(`/staff/${id}`);
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  // ==================================================
  // UNIT ACTIONS
  // ==================================================
  async function addUnit() {
    const name = String(unitForm.name || "").trim();
    if (!name) return;
    const created = await api.post("/units", { name });
    setUnits((prev) => [...prev, created]);
    setUnitForm({ name: "" });
  }

  async function saveUnit(id) {
    const name = String(unitForm.name || "").trim();
    if (!name) return;
    const updated = await api.patch(`/units/${id}`, { name });
    setUnits((prev) => prev.map((u) => (u.id === id ? updated : u)));
    setEditingUnitId(null);
  }

  async function deleteUnit(id) {
    if (!window.confirm("Delete this unit?")) return;
    await api.delete(`/units/${id}`);
    setUnits((prev) => prev.filter((u) => u.id !== id));
  }

  // ==================================================
  // SHIFT SETTINGS ACTIONS
  // ==================================================
  async function addShift() {
    const roleVal = String(shiftForm.role || "").trim();
    if (!roleVal) return;
    const created = await api.post("/shift-settings", { ...shiftForm, role: roleVal });
    setShiftSettings((prev) => [...prev, created]);
    setShiftForm({ role: "", shift_type: "Day", start_local: "07:00", end_local: "15:00" });
  }

  async function saveShift(id) {
    const roleVal = String(shiftForm.role || "").trim();
    if (!roleVal) return;
    const updated = await api.patch(`/shift-settings/${id}`, { ...shiftForm, role: roleVal });
    setShiftSettings((prev) => prev.map((s) => (s.id === id ? updated : s)));
    setEditingShiftId(null);
  }

  async function deleteShift(id) {
    if (!window.confirm("Delete this shift setting?")) return;
    await api.delete(`/shift-settings/${id}`);
    setShiftSettings((prev) => prev.filter((s) => s.id !== id));
  }

  // ==================================================
  // ROOMS ACTIONS (NEW)
  // ==================================================
  async function addRoom() {
    if (!canManageFacility) return;
    const name = String(roomForm.name || "").trim();
    if (!name) return;
    setRoomSaving(true);
    try {
      const created = await api.post("/facility/rooms", { name, is_active: !!roomForm.is_active });

      setRooms((prev) => {
        const next = [...prev, created].sort(sortByOrderThenName);
        // If we just created the first room, select it
        if (!selectedRoomId && created?.id) setSelectedRoomId(created.id);
        return next;
      });

      setRoomForm({ name: "", is_active: true });

      // If currently selected room is the created one, sync beds
      if (!selectedRoomId && created?.id) {
        setBeds([]);
      }
    } catch (e) {
      alert(e?.message || "Failed to add room.");
    } finally {
      setRoomSaving(false);
    }
  }

  async function saveRoom(id) {
    if (!canManageFacility) return;
    const name = String(roomForm.name || "").trim();
    if (!name) return;
    setRoomSaving(true);
    try {
      const updated = await api.patch(`/facility/rooms/${id}`, { name, is_active: !!roomForm.is_active });
      setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)).sort(sortByOrderThenName));
      setEditingRoomId(null);
      setRoomForm({ name: "", is_active: true });
    } catch (e) {
      alert(e?.message || "Failed to save room.");
    } finally {
      setRoomSaving(false);
    }
  }

  async function toggleRoomActive(room) {
    if (!canManageFacility) return;
    setRoomSaving(true);
    try {
      const updated = await api.patch(`/facility/rooms/${room.id}`, { is_active: !(room.is_active !== false) });
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, ...updated } : r)).sort(sortByOrderThenName));
    } catch (e) {
      alert(e?.message || "Failed to update room.");
    } finally {
      setRoomSaving(false);
    }
  }

  // ==================================================
  // BEDS ACTIONS (NEW)
  // ==================================================
  async function addBed() {
    if (!canManageFacility) return;
    if (!selectedRoomId) return alert("Select a room first.");
    const label = String(bedForm.label || "").trim();
    if (!label) return;
    setBedSaving(true);
    try {
      const created = await api.post(`/facility/rooms/${selectedRoomId}/beds`, {
        label,
        is_active: !!bedForm.is_active,
      });

      // Update beds list
      setBeds((prev) => [...prev, created].sort(sortByOrderThenLabel));

      // Also update rooms state so switching rooms keeps beds in sync
      setRooms((prev) =>
        prev
          .map((r) => {
            if (r.id !== selectedRoomId) return r;
            const nextBeds = Array.isArray(r.beds) ? [...r.beds, created] : [created];
            return { ...r, beds: nextBeds };
          })
          .sort(sortByOrderThenName)
      );

      setBedForm({ label: "", is_active: true });
    } catch (e) {
      alert(e?.message || "Failed to add bed.");
    } finally {
      setBedSaving(false);
    }
  }

  async function saveBed(id) {
    if (!canManageFacility) return;
    const label = String(bedForm.label || "").trim();
    if (!label) return;
    setBedSaving(true);
    try {
      const updated = await api.patch(`/facility/beds/${id}`, { label, is_active: !!bedForm.is_active });

      setBeds((prev) => prev.map((b) => (b.id === id ? updated : b)).sort(sortByOrderThenLabel));

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRoomId) return r;
          const nextBeds = (Array.isArray(r.beds) ? r.beds : []).map((b) => (b.id === id ? updated : b));
          return { ...r, beds: nextBeds };
        })
      );

      setEditingBedId(null);
      setBedForm({ label: "", is_active: true });
    } catch (e) {
      alert(e?.message || "Failed to save bed.");
    } finally {
      setBedSaving(false);
    }
  }

  async function toggleBedActive(bed) {
    if (!canManageFacility) return;
    setBedSaving(true);
    try {
      const updated = await api.patch(`/facility/beds/${bed.id}`, { is_active: !(bed.is_active !== false) });

      setBeds((prev) => prev.map((b) => (b.id === bed.id ? updated : b)).sort(sortByOrderThenLabel));

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRoomId) return r;
          const nextBeds = (Array.isArray(r.beds) ? r.beds : []).map((b) => (b.id === bed.id ? updated : b));
          return { ...r, beds: nextBeds };
        })
      );
    } catch (e) {
      alert(e?.message || "Failed to update bed.");
    } finally {
      setBedSaving(false);
    }
  }

  async function persistBedOrder(nextBeds) {
    if (!canManageFacility) return;
    if (!selectedRoomId) return;

    // UI update first
    setBeds(nextBeds);

    // Keep rooms state in sync too
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== selectedRoomId) return r;
        return { ...r, beds: nextBeds };
      })
    );

    try {
      // ✅ backend expects: { room_id, bed_ids }
      const bed_ids = nextBeds.map((b) => b.id);
      await api.post("/facility/beds/reorder", { room_id: selectedRoomId, bed_ids });
    } catch (e) {
      console.error("REORDER SAVE ERROR:", e);
      alert(e?.message || "Failed to save bed order. (Tell me if you need the backend reorder route.)");
    }
  }

  function moveBedByIndex(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= beds.length) return;
    const next = beds.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    persistBedOrder(next);
  }

  function onBedDragStart(bedId) {
    dragBedIdRef.current = bedId;
  }

  function onBedDrop(targetBedId) {
    const fromId = dragBedIdRef.current;
    dragBedIdRef.current = null;
    if (!fromId || fromId === targetBedId) return;

    const fromIdx = beds.findIndex((b) => b.id === fromId);
    const toIdx = beds.findIndex((b) => b.id === targetBedId);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = beds.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    persistBedOrder(next);
  }

  const headerSubtitle = useMemo(() => {
    const roomCount = rooms?.length ? rooms.length : null;
    const bedCount = beds?.length ? beds.length : null;
    if (activeTab !== "rooms_beds") return null;
    const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
    const roomLabel = selectedRoom ? `Room: ${selectedRoom.name}` : "No room selected";
    const suffix = bedCount !== null ? ` • ${bedCount} beds` : "";
    return `${roomLabel}${suffix}${roomCount !== null ? ` • ${roomCount} rooms total` : ""}`;
  }, [activeTab, rooms, beds, selectedRoomId]);

  // ==================================================
  // RENDER
  // ==================================================
  return (
    <div style={ui.page}>
      {/* TOP BAR */}
      <div style={ui.topBar}>
        <div style={ui.brand}>
          {orgLogo ? <img src={orgLogo} alt={orgName} style={ui.logo} /> : null}
          <div style={{ minWidth: 0 }}>
            <div style={ui.h1}>Admin Panel</div>
            <div style={ui.sub}>
              <span style={{ color: "#E5E7EB", fontWeight: 900 }}>{orgName}</span>
              {headerSubtitle ? <span style={{ marginLeft: 10, color: "#9CA3AF" }}>{headerSubtitle}</span> : null}
              {loading ? <span style={{ marginLeft: 10, color: "#9CA3AF" }}>Loading…</span> : null}
            </div>
          </div>
        </div>

        <div style={ui.topActions}>
          <button style={ui.btnGhost} onClick={loadAll} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={ui.tabs}>
        <TabButton active={activeTab === "staff"} onClick={() => setActiveTab("staff")} label="Staff" />
        <TabButton active={activeTab === "units"} onClick={() => setActiveTab("units")} label="Units" />
        <TabButton active={activeTab === "shifts"} onClick={() => setActiveTab("shifts")} label="Shift Settings" />
        <TabButton active={activeTab === "rooms_beds"} onClick={() => setActiveTab("rooms_beds")} label="Rooms & Beds" />
        <TabButton active={activeTab === "privacy"} onClick={() => setActiveTab("privacy")} label="Privacy" />
      </div>

      {/* CONTENT */}
      <div style={ui.contentGrid}>
        {/* STAFF */}
        {activeTab === "staff" && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Staff</div>
                <div style={ui.cardSub}>Manage staff directory for scheduling and assignments.</div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>ID</th>
                    <th style={ui.th}>Name</th>
                    <th style={ui.th}>Role</th>
                    <th style={ui.th}>Email</th>
                    <th style={ui.th}>Phone</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const isEdit = editingStaffId === s.id;
                    return (
                      <tr key={s.id} style={ui.tr}>
                        <td style={ui.tdMono}>{s.id}</td>

                        <td style={ui.td}>
                          {isEdit ? (
                            <input
                              style={ui.input}
                              value={staffForm.name || ""}
                              onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                            />
                          ) : (
                            <span style={ui.cellStrong}>{s.name}</span>
                          )}
                        </td>

                        <td style={ui.td}>
                          {isEdit ? (
                            <input
                              style={ui.input}
                              value={staffForm.role || ""}
                              onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                            />
                          ) : (
                            <span style={ui.pill}>{s.role}</span>
                          )}
                        </td>

                        <td style={ui.td}>
                          {isEdit ? (
                            <input
                              style={ui.input}
                              value={staffForm.email || ""}
                              onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                            />
                          ) : (
                            <span style={ui.muted}>{s.email || "—"}</span>
                          )}
                        </td>

                        <td style={ui.td}>
                          {isEdit ? (
                            <input
                              style={ui.input}
                              value={staffForm.phone || ""}
                              onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                            />
                          ) : (
                            <span style={ui.muted}>{s.phone || "—"}</span>
                          )}
                        </td>

                        <td style={{ ...ui.td, textAlign: "right" }}>
                          {isEdit ? (
                            <div style={ui.actions}>
                              <button style={ui.btnPrimary} onClick={() => saveStaff(s.id)}>
                                Save
                              </button>
                              <button
                                style={ui.btnGhost}
                                onClick={() => {
                                  setEditingStaffId(null);
                                  setStaffForm({ name: "", role: "", email: "", phone: "" });
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={ui.actions}>
                              <button
                                style={ui.btnGhost}
                                onClick={() => {
                                  setEditingStaffId(s.id);
                                  setStaffForm({
                                    name: s.name || "",
                                    role: s.role || "",
                                    email: s.email || "",
                                    phone: s.phone || "",
                                  });
                                }}
                              >
                                Edit
                              </button>
                              <button style={ui.btnDanger} onClick={() => deleteStaff(s.id)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {staff.length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={6}>
                        No staff yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* UNITS */}
        {activeTab === "units" && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Units</div>
                <div style={ui.cardSub}>Create and manage units (ex: East Hall, Memory Care).</div>
              </div>
            </div>

            <div style={ui.inlineForm}>
              <input
                style={ui.input}
                placeholder="New unit name"
                value={unitForm.name}
                onChange={(e) => setUnitForm({ name: e.target.value })}
              />
              <button style={ui.btnPrimary} onClick={addUnit}>
                Add Unit
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Unit</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const isEdit = editingUnitId === u.id;
                    return (
                      <tr key={u.id} style={ui.tr}>
                        <td style={ui.td}>
                          {isEdit ? (
                            <input
                              style={ui.input}
                              value={unitForm.name}
                              onChange={(e) => setUnitForm({ name: e.target.value })}
                            />
                          ) : (
                            <span style={ui.cellStrong}>{u.name}</span>
                          )}
                        </td>
                        <td style={{ ...ui.td, textAlign: "right" }}>
                          {isEdit ? (
                            <div style={ui.actions}>
                              <button style={ui.btnPrimary} onClick={() => saveUnit(u.id)}>
                                Save
                              </button>
                              <button style={ui.btnGhost} onClick={() => setEditingUnitId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={ui.actions}>
                              <button
                                style={ui.btnGhost}
                                onClick={() => {
                                  setEditingUnitId(u.id);
                                  setUnitForm({ name: u.name || "" });
                                }}
                              >
                                Edit
                              </button>
                              <button style={ui.btnDanger} onClick={() => deleteUnit(u.id)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {units.length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={2}>
                        No units yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SHIFT SETTINGS */}
        {activeTab === "shifts" && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Shift Settings</div>
                <div style={ui.cardSub}>Define standard shifts by role (CNA/LPN/RN).</div>
              </div>
            </div>

            <div style={ui.inlineFormWrap}>
              <input
                style={{ ...ui.input, minWidth: 200 }}
                placeholder="Role (CNA, LPN, RN)"
                value={shiftForm.role}
                onChange={(e) => setShiftForm({ ...shiftForm, role: e.target.value })}
              />

              <select
                style={ui.select}
                value={shiftForm.shift_type}
                onChange={(e) => setShiftForm({ ...shiftForm, shift_type: e.target.value })}
              >
                {SHIFT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <input
                style={ui.input}
                type="time"
                value={shiftForm.start_local}
                onChange={(e) => setShiftForm({ ...shiftForm, start_local: e.target.value })}
              />
              <input
                style={ui.input}
                type="time"
                value={shiftForm.end_local}
                onChange={(e) => setShiftForm({ ...shiftForm, end_local: e.target.value })}
              />

              <button style={ui.btnPrimary} onClick={addShift}>
                Add
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Role</th>
                    <th style={ui.th}>Shift</th>
                    <th style={ui.th}>Time</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftSettings.map((s) => {
                    const isEdit = editingShiftId === s.id;
                    return (
                      <tr key={s.id} style={ui.tr}>
                        <td style={ui.td}>
                          {isEdit ? (
                            <input
                              style={ui.input}
                              value={shiftForm.role}
                              onChange={(e) => setShiftForm({ ...shiftForm, role: e.target.value })}
                            />
                          ) : (
                            <span style={ui.cellStrong}>{s.role}</span>
                          )}
                        </td>

                        <td style={ui.td}>
                          {isEdit ? (
                            <select
                              style={ui.select}
                              value={shiftForm.shift_type}
                              onChange={(e) => setShiftForm({ ...shiftForm, shift_type: e.target.value })}
                            >
                              {SHIFT_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={ui.pill}>{s.shift_type}</span>
                          )}
                        </td>

                        <td style={ui.td}>
                          {isEdit ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                style={ui.input}
                                type="time"
                                value={shiftForm.start_local}
                                onChange={(e) => setShiftForm({ ...shiftForm, start_local: e.target.value })}
                              />
                              <span style={{ color: "#9CA3AF", fontWeight: 900 }}>–</span>
                              <input
                                style={ui.input}
                                type="time"
                                value={shiftForm.end_local}
                                onChange={(e) => setShiftForm({ ...shiftForm, end_local: e.target.value })}
                              />
                            </div>
                          ) : (
                            <span style={ui.muted}>
                              {s.start_local}–{s.end_local}
                            </span>
                          )}
                        </td>

                        <td style={{ ...ui.td, textAlign: "right" }}>
                          {isEdit ? (
                            <div style={ui.actions}>
                              <button style={ui.btnPrimary} onClick={() => saveShift(s.id)}>
                                Save
                              </button>
                              <button style={ui.btnGhost} onClick={() => setEditingShiftId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={ui.actions}>
                              <button
                                style={ui.btnGhost}
                                onClick={() => {
                                  setEditingShiftId(s.id);
                                  setShiftForm({
                                    role: s.role || "",
                                    shift_type: s.shift_type || "Day",
                                    start_local: s.start_local || "07:00",
                                    end_local: s.end_local || "15:00",
                                  });
                                }}
                              >
                                Edit
                              </button>
                              <button style={ui.btnDanger} onClick={() => deleteShift(s.id)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {shiftSettings.length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={4}>
                        No shift settings yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ROOMS & BEDS (UPDATED FIXES) */}
        {activeTab === "rooms_beds" && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Rooms & Beds</div>
                <div style={ui.cardSub}>
                  Fully customizable facility layout. Create rooms with any names, then add beds per room (A/B, 1/2, “Window”, etc.).
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button style={ui.btnGhost} onClick={loadRooms} disabled={roomsLoading}>
                  {roomsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {!canManageFacility ? (
              <div style={ui.notice}>You don’t have permission to manage facility layout for this organization.</div>
            ) : (
              <div style={ui.rbGrid}>
                {/* Left: Rooms list */}
                <div style={ui.rbLeft}>
                  <div style={ui.rbPanelTitle}>Rooms</div>

                  <div style={ui.inlineForm}>
                    <input
                      style={{ ...ui.input, minWidth: 0, flex: 1 }}
                      placeholder="Add room (ex: 101, 1A, Memory-1, Rehab-12)"
                      value={roomForm.name}
                      onChange={(e) => setRoomForm((p) => ({ ...p, name: e.target.value }))}
                    />
                    <label style={ui.smallCheck}>
                      <input
                        type="checkbox"
                        checked={!!roomForm.is_active}
                        onChange={(e) => setRoomForm((p) => ({ ...p, is_active: e.target.checked }))}
                      />
                      Active
                    </label>

                    {editingRoomId ? (
                      <>
                        <button style={ui.btnPrimary} onClick={() => saveRoom(editingRoomId)} disabled={roomSaving}>
                          {roomSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          style={ui.btnGhost}
                          onClick={() => {
                            setEditingRoomId(null);
                            setRoomForm({ name: "", is_active: true });
                          }}
                          disabled={roomSaving}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button style={ui.btnPrimary} onClick={addRoom} disabled={roomSaving}>
                        {roomSaving ? "Adding…" : "Add"}
                      </button>
                    )}
                  </div>

                  <div style={ui.rbList}>
                    {roomsLoading ? (
                      <div style={ui.emptyRow}>Loading rooms…</div>
                    ) : rooms.length === 0 ? (
                      <div style={ui.emptyRow}>No rooms yet. Add one above.</div>
                    ) : (
                      rooms
                        .slice()
                        .sort(sortByOrderThenName)
                        .map((r) => {
                          const selected = r.id === selectedRoomId;
                          const inactive = r.is_active === false;
                          return (
                            <div
                              key={r.id}
                              onClick={() => setSelectedRoomId(r.id)}
                              style={ui.roomRow(selected, inactive)}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ fontWeight: 950, color: "white", opacity: inactive ? 0.55 : 1 }}>
                                    {r.name}
                                  </div>
                                  {inactive ? <span style={ui.badgeOff}>Inactive</span> : <span style={ui.badgeOn}>Active</span>}
                                </div>
                                <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                                  {r.room_type ? r.room_type : "Room"} • order {r.display_order ?? "—"}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button
                                  style={ui.btnMini}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingRoomId(r.id);
                                    setRoomForm({ name: r.name || "", is_active: r.is_active !== false });
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  style={ui.btnMiniGhost}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRoomActive(r);
                                  }}
                                >
                                  {inactive ? "Activate" : "Deactivate"}
                                </button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Right: Beds for selected room */}
                <div style={ui.rbRight}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <div style={ui.rbPanelTitle}>Beds</div>
                      <div style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.4 }}>
                        Drag beds to reorder. This order controls how beds display on your Census board.
                      </div>
                    </div>

                    <div style={{ color: "#9CA3AF", fontSize: 12, whiteSpace: "nowrap" }}>
                      {bedsLoading ? "Loading…" : selectedRoomId ? `${beds.length} beds` : "Select a room"}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={ui.inlineForm}>
                      <input
                        style={{ ...ui.input, minWidth: 0, flex: 1 }}
                        placeholder='Add bed label (ex: A, B, 1, 2, "Window", "Door")'
                        value={bedForm.label}
                        onChange={(e) => setBedForm((p) => ({ ...p, label: e.target.value }))}
                        disabled={!selectedRoomId}
                      />
                      <label style={ui.smallCheck}>
                        <input
                          type="checkbox"
                          checked={!!bedForm.is_active}
                          onChange={(e) => setBedForm((p) => ({ ...p, is_active: e.target.checked }))}
                          disabled={!selectedRoomId}
                        />
                        Active
                      </label>

                      {editingBedId ? (
                        <>
                          <button
                            style={ui.btnPrimary}
                            onClick={() => saveBed(editingBedId)}
                            disabled={bedSaving || !selectedRoomId}
                          >
                            {bedSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            style={ui.btnGhost}
                            onClick={() => {
                              setEditingBedId(null);
                              setBedForm({ label: "", is_active: true });
                            }}
                            disabled={bedSaving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button style={ui.btnPrimary} onClick={addBed} disabled={bedSaving || !selectedRoomId}>
                          {bedSaving ? "Adding…" : "Add"}
                        </button>
                      )}
                    </div>

                    <div style={ui.bedList}>
                      {!selectedRoomId ? (
                        <div style={ui.emptyRow}>Select a room to manage its beds.</div>
                      ) : bedsLoading ? (
                        <div style={ui.emptyRow}>Loading beds…</div>
                      ) : beds.length === 0 ? (
                        <div style={ui.emptyRow}>No beds yet. Add one above.</div>
                      ) : (
                        beds
                          .slice()
                          .sort(sortByOrderThenLabel)
                          .map((b, idx) => {
                            const inactive = b.is_active === false;
                            return (
                              <div
                                key={b.id}
                                draggable
                                onDragStart={() => onBedDragStart(b.id)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => onBedDrop(b.id)}
                                style={ui.bedRow(inactive)}
                                title="Drag to reorder"
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                  <div style={ui.dragHandle}>⋮⋮</div>

                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <div style={{ fontWeight: 950, color: "white", opacity: inactive ? 0.55 : 1 }}>
                                        {b.label}
                                      </div>
                                      {inactive ? <span style={ui.badgeOff}>Inactive</span> : <span style={ui.badgeOn}>Active</span>}
                                      <span style={ui.orderPill}>#{b.display_order ?? idx + 1}</span>
                                    </div>
                                    <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                                      bed_id:{" "}
                                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                        {b.id}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <button
                                    style={ui.btnMiniGhost}
                                    onClick={() => moveBedByIndex(idx, idx - 1)}
                                    disabled={idx === 0}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    style={ui.btnMiniGhost}
                                    onClick={() => moveBedByIndex(idx, idx + 1)}
                                    disabled={idx === beds.length - 1}
                                  >
                                    ↓
                                  </button>

                                  <button
                                    style={ui.btnMini}
                                    onClick={() => {
                                      setEditingBedId(b.id);
                                      setBedForm({ label: b.label || "", is_active: b.is_active !== false });
                                    }}
                                  >
                                    Edit
                                  </button>

                                  <button style={ui.btnMiniGhost} onClick={() => toggleBedActive(b)}>
                                    {inactive ? "Activate" : "Deactivate"}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>

                    <div style={{ marginTop: 10, color: "#9CA3AF", fontSize: 12 }}>
                      Tip: If a facility has non-sequential beds, just label them exactly how they use them (ex: “1”, “2”, “3”, “Overflow”, “ISO”).
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PRIVACY */}
        {activeTab === "privacy" && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Privacy</div>
                <div style={ui.cardSub}>Control whether limited patient identifiers may be shown on the Census board.</div>
              </div>
            </div>

            {!canManagePrivacy ? (
              <div style={ui.notice}>You don’t have permission to change privacy settings for this organization.</div>
            ) : (
              <>
                <div style={ui.notice}>
                  When enabled, the Census page may display a limited identifier (like initials). This increases HIPAA risk if used improperly.
                  Require acknowledgment before enabling.
                </div>

                <div style={ui.privacyRow}>
                  <label style={ui.checkRow}>
                    <input
                      type="checkbox"
                      checked={!!orgSettings?.show_patient_identifiers}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (next) setShowAck(true);
                        else {
                          savePrivacy({
                            enabled: false,
                            format: orgSettings?.identifier_format || "first_last_initial",
                            acknowledged: false,
                          });
                        }
                      }}
                      disabled={privacySaving}
                    />
                    <div>
                      <div style={{ fontWeight: 950 }}>Allow patient identifiers on Census</div>
                      <div style={{ color: "#9CA3AF", fontSize: 12 }}>Only initials / limited label. Never full name, DOB, MRN.</div>
                    </div>
                  </label>

                  <div style={{ minWidth: 260 }}>
                    <div style={ui.label}>Format</div>
                    <select
                      style={ui.select}
                      value={orgSettings?.identifier_format || "first_last_initial"}
                      onChange={(e) => {
                        const fmt = e.target.value;
                        savePrivacy({
                          enabled: !!orgSettings?.show_patient_identifiers,
                          format: fmt,
                          acknowledged: false,
                        });
                      }}
                      disabled={privacySaving}
                    >
                      <option value="first_last_initial">First + Last Initial (John D.)</option>
                      <option value="initials">Initials (J.D.)</option>
                    </select>
                  </div>

                  {privacySaving ? <span style={{ color: "#9CA3AF" }}>Saving…</span> : null}
                </div>
              </>
            )}

            {/* ACK MODAL */}
            {showAck ? (
              <div onMouseDown={() => setShowAck(false)} style={ui.modalOverlay}>
                <div onMouseDown={(e) => e.stopPropagation()} style={ui.modal}>
                  <div style={ui.modalTitle}>Acknowledge Privacy Risk</div>
                  <div style={ui.modalBody}>
                    You are enabling limited patient identifiers on the Census board. Only enable this if your facility policy allows it and access is restricted.
                    Do not enter full names or MRNs. You are responsible for operating compliantly.
                  </div>

                  <div style={ui.modalActions}>
                    <button style={ui.btnGhost} onClick={() => setShowAck(false)} disabled={privacySaving}>
                      Cancel
                    </button>
                    <button
                      style={ui.btnPrimary}
                      onClick={() => {
                        setShowAck(false);
                        savePrivacy({
                          enabled: true,
                          format: orgSettings?.identifier_format || "first_last_initial",
                          acknowledged: true,
                        });
                      }}
                      disabled={privacySaving}
                    >
                      I Understand — Enable
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- helpers ----------------------------- */

function TabButton({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={ui.tab(active)} type="button">
      {label}
    </button>
  );
}

// ✅ FIXED: display_order (not sort_order)
function sortByOrderThenName(a, b) {
  const ao = a?.display_order ?? 999999;
  const bo = b?.display_order ?? 999999;
  if (ao !== bo) return ao - bo;
  return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

// ✅ FIXED: display_order (not sort_order)
function sortByOrderThenLabel(a, b) {
  const ao = a?.display_order ?? 999999;
  const bo = b?.display_order ?? 999999;
  if (ao !== bo) return ao - bo;
  return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

/* ----------------------------- styles ----------------------------- */

const ui = {
  page: { padding: 18, color: "white", minHeight: "100vh" },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10))",
    boxShadow: "0 16px 50px rgba(0,0,0,0.40)",
    marginBottom: 14,
  },

  brand: { display: "flex", gap: 12, alignItems: "center", minWidth: 0 },
  logo: { height: 52, width: 52, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(255,255,255,0.10)" },

  h1: { fontSize: 18, fontWeight: 1000, letterSpacing: "-0.02em", lineHeight: 1.1 },
  sub: {
    marginTop: 4,
    color: "#9CA3AF",
    fontSize: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  topActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  tabs: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 },

  tab: (active) => ({
    padding: "10px 12px",
    borderRadius: 999,
    border: active ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
  }),

  contentGrid: { display: "grid", gap: 14 },

  card: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.28)",
    boxShadow: "0 18px 70px rgba(0,0,0,0.45)",
    padding: 14,
    overflow: "hidden",
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },

  cardTitle: { fontSize: 15, fontWeight: 1000, letterSpacing: "-0.01em" },
  cardSub: { marginTop: 4, color: "#9CA3AF", fontSize: 12, lineHeight: 1.35 },

  inlineForm: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },
  inlineFormWrap: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, overflow: "hidden" },

  th: {
    textAlign: "left",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#9CA3AF",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
  },

  tr: { borderBottom: "1px solid rgba(255,255,255,0.06)" },

  td: { padding: "10px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", verticalAlign: "middle" },

  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    color: "#E5E7EB",
    fontSize: 12,
  },

  emptyRow: { padding: 14, color: "#9CA3AF", textAlign: "center" },

  cellStrong: { fontWeight: 950, color: "#E5E7EB" },
  muted: { color: "#9CA3AF" },

  actions: { display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" },

  input: {
    height: 40,
    borderRadius: 14,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    outline: "none",
    minWidth: 160,
  },

  select: {
    height: 40,
    borderRadius: 14,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    outline: "none",
    minWidth: 160,
    cursor: "pointer",
  },

  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    fontWeight: 900,
    fontSize: 12,
  },

  btnPrimary: {
    height: 40,
    borderRadius: 14,
    padding: "10px 14px",
    background: "white",
    color: "#0b0b0b",
    border: "none",
    cursor: "pointer",
    fontWeight: 950,
  },

  btnGhost: {
    height: 40,
    borderRadius: 14,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    fontWeight: 900,
  },

  btnDanger: {
    height: 40,
    borderRadius: 14,
    padding: "10px 14px",
    background: "rgba(239,68,68,0.14)",
    color: "white",
    border: "1px solid rgba(239,68,68,0.35)",
    cursor: "pointer",
    fontWeight: 900,
  },

  btnMini: {
    height: 34,
    borderRadius: 12,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  btnMiniGhost: {
    height: 34,
    borderRadius: 12,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  notice: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    padding: 12,
    color: "#E5E7EB",
    lineHeight: 1.45,
  },

  privacyRow: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 12 },

  checkRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.62)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 999,
  },

  modal: {
    width: "min(760px, 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.88)",
    boxShadow: "0 30px 110px rgba(0,0,0,0.75)",
    padding: 16,
  },

  modalTitle: { fontSize: 16, fontWeight: 1000, marginBottom: 10 },
  modalBody: { color: "#E5E7EB", lineHeight: 1.55, fontSize: 13 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, flexWrap: "wrap" },

  // Rooms & Beds layout
  rbGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 360px) 1fr",
    gap: 12,
    alignItems: "start",
  },

  rbLeft: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    padding: 12,
    overflow: "hidden",
  },

  rbRight: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    padding: 12,
    overflow: "hidden",
  },

  rbPanelTitle: { fontSize: 13, fontWeight: 1000, marginBottom: 10 },

  rbList: {
    display: "grid",
    gap: 10,
    marginTop: 6,
    maxHeight: 520,
    overflow: "auto",
    paddingRight: 4,
  },

  roomRow: (selected, inactive) => ({
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    border: selected ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.10)",
    background: selected ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.18)",
    cursor: "pointer",
    opacity: inactive ? 0.7 : 1,
  }),

  bedList: {
    display: "grid",
    gap: 10,
    marginTop: 10,
    maxHeight: 520,
    overflow: "auto",
    paddingRight: 4,
  },

  bedRow: (inactive) => ({
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    opacity: inactive ? 0.7 : 1,
  }),

  dragHandle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#E5E7EB",
    fontWeight: 900,
    userSelect: "none",
  },

  badgeOn: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(34,197,94,0.35)",
    background: "rgba(34,197,94,0.10)",
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: 900,
  },

  badgeOff: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.10)",
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: 900,
  },

  orderPill: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: 900,
  },

  smallCheck: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "0 10px",
    height: 40,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 900,
    fontSize: 12,
    userSelect: "none",
  },
};
