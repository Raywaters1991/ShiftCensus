// src/pages/AdminPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";
import OrgSwitcher from "../components/OrgSwitcher";

const SHIFT_TYPES = ["Day", "Evening", "Night"];

export default function AdminPage() {
  const {
    orgName,
    orgId,
    orgCode,
    role,
    switchOrg,

    // ✅ org-scoped perms from your updated UserContext
    isSuperadmin,
    isOrgAdmin,
    canManageAdmins,
    canScheduleWrite,
  } = useUser();

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

  // ✅ facility switcher (normal users use OrgSwitcher memberships; superadmin uses all orgs list)
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [superOrgs, setSuperOrgs] = useState([]);
  const [superOrgsLoading, setSuperOrgsLoading] = useState(false);

  async function loadSuperOrgs() {
    if (!isSuperadmin) return;
    setSuperOrgsLoading(true);
    try {
      const data = await api.get("/organizations"); // assumes GET /organizations exists for superadmin
      setSuperOrgs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("LOAD SUPER ORGS ERROR:", e);
      setSuperOrgs([]);
    } finally {
      setSuperOrgsLoading(false);
    }
  }

  // ---------------------------
  // Core Admin Data
  // ---------------------------
  const [staff, setStaff] = useState([]);
  const [units, setUnits] = useState([]);
  const [shiftSettings, setShiftSettings] = useState([]);

  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingShiftId, setEditingShiftId] = useState(null);

  const [staffForm, setStaffForm] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
  });
  const [unitForm, setUnitForm] = useState({ name: "" });
  const [shiftForm, setShiftForm] = useState({
    role: "",
    shift_type: "Day",
    start_local: "07:00",
    end_local: "15:00",
  });

  // ---------------------------
  // SHIFT SETTINGS UI (ROLE BUBBLES)
  // ---------------------------
  const [selectedShiftRole, setSelectedShiftRole] = useState("ALL");

  const roleOptions = useMemo(() => {
    const set = new Set(
      (shiftSettings || [])
        .map((s) => String(s?.role || "").trim())
        .filter(Boolean)
    );

    (staff || []).forEach((st) => {
      const r = String(st?.role || "").trim();
      if (r) set.add(r);
    });

    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [shiftSettings, staff]);

  const filteredShiftSettings = useMemo(() => {
    if (selectedShiftRole === "ALL") return shiftSettings;
    return (shiftSettings || []).filter(
      (s) => String(s?.role || "").trim() === selectedShiftRole
    );
  }, [shiftSettings, selectedShiftRole]);

  // ---------------------------
  // STAFF ADD + CSV IMPORT
  // ---------------------------
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffAdding, setStaffAdding] = useState(false);

  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  const csvInputRef = useRef(null);

  // ✅ Departments
const [departments, setDepartments] = useState([]);
const [departmentsLoading, setDepartmentsLoading] = useState(false);

const [deptForm, setDeptForm] = useState({ name: "", is_active: true });
const [editingDeptId, setEditingDeptId] = useState(null);
const [deptSaving, setDeptSaving] = useState(false);

  // ---------------------------
  // PRIVACY SETTINGS
  // ---------------------------
  const [orgSettings, setOrgSettings] = useState(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [showAck, setShowAck] = useState(false);

  // ---------------------------
  // ROOMS & BEDS
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

  // ✅ Admin management
  const [adminMembers, setAdminMembers] = useState([]);
  const [adminMembersLoading, setAdminMembersLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [savingMemberUserId, setSavingMemberUserId] = useState(null);

  // ✅ Permissions derived from ORG SCOPED flags
  const canManagePrivacy = !!isOrgAdmin;   // you can tighten later if you want separate flag
  const canManageFacility = !!isOrgAdmin; // you can tighten later if you want separate flag

  // ✅ IMPORTANT: reload org-scoped data whenever orgId changes
  useEffect(() => {
    if (!orgId) return;
    loadAll();
    loadOrgSettings();
    if (activeTab === "rooms_beds") loadRooms();
    if (activeTab === "admin_access" && canManageAdmins) loadAdminMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // initial load for superadmin org list (for Change Facility)
  useEffect(() => {
    if (isSuperadmin) loadSuperOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, u, ss] = await Promise.all([
        api.get("/staff"),
        api.get("/units"),
        api.get("/shift-settings"),
      ]);
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
  // Admin memberships load
  // ---------------------------
  async function loadAdminMembers() {
    if (!orgId || !orgCode) return;
    if (!canManageAdmins && !isSuperadmin) return;

    setAdminMembersLoading(true);
    try {
      // api service should already include X-Org-Code header; but we also pass explicitly
      const data = await api.get("/admin/memberships", {
        headers: { "X-Org-Code": orgCode },
      });

      const list = Array.isArray(data?.memberships) ? data.memberships : [];
      setAdminMembers(list);
    } catch (e) {
      console.error("LOAD ADMIN MEMBERS ERROR:", e);
      alert(e?.message || "Failed to load admin memberships.");
      setAdminMembers([]);
    } finally {
      setAdminMembersLoading(false);
    }
  }

  async function saveMemberPerms(userId, patch) {
    if (!orgCode) return;
    setSavingMemberUserId(userId);
    try {
      const data = await api.patch(`/admin/memberships/${userId}`, patch, {
        headers: { "X-Org-Code": orgCode },
      });

      const updated = data?.membership || null;
      if (!updated?.user_id) return;

      setAdminMembers((prev) =>
        prev.map((m) => (String(m.user_id) === String(updated.user_id) ? { ...m, ...updated } : m))
      );
    } catch (e) {
      alert(e?.message || "Failed to update member permissions.");
    } finally {
      setSavingMemberUserId(null);
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
      const sorted = list.slice().sort(sortByOrderThenName);

      setRooms(sorted);

      const firstActive =
        sorted.find((r) => r.is_active !== false) || sorted[0] || null;

      setSelectedRoomId((prev) => {
        if (prev) return prev;
        return firstActive?.id ?? null;
      });

      const currentRoomId = (selectedRoomId ?? firstActive?.id) || null;

      if (currentRoomId) {
        const room = sorted.find((r) => r.id === currentRoomId);
        setBeds(
          Array.isArray(room?.beds)
            ? room.beds.slice().sort(sortByOrderThenLabel)
            : []
        );
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
    const nextBeds = Array.isArray(room?.beds)
      ? room.beds.slice().sort(sortByOrderThenLabel)
      : [];
    setBeds(nextBeds);
  }

  useEffect(() => {
    if (activeTab !== "rooms_beds") return;
    if (!orgId) return;
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId]);

  useEffect(() => {
    if (activeTab !== "admin_access") return;
    if (!orgId) return;
    if (!canManageAdmins && !isSuperadmin) return;
    loadAdminMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId, canManageAdmins, isSuperadmin]);

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
      const updated = await api.put("/org-settings/identifiers", {
        enabled,
        format,
        acknowledged,
      });
      setOrgSettings(updated);
    } catch (e) {
      alert(e.message || "Failed to update privacy settings");
    } finally {
      setPrivacySaving(false);
    }
  }

  // ==================================================
  // SHIFT SETTINGS UI HELPERS
  // ==================================================
  function selectShiftRole(roleName) {
    const next = roleName || "ALL";
    setSelectedShiftRole(next);

    if (next !== "ALL") {
      setShiftForm((p) => ({ ...p, role: next }));
    }

    setEditingShiftId(null);
  }

  // ==================================================
  // STAFF ACTIONS
  // ==================================================
  async function addStaff() {
    const payload = {
      name: String(staffForm.name || "").trim(),
      role: String(staffForm.role || "").trim(),
      email: String(staffForm.email || "").trim() || null,
      phone: String(staffForm.phone || "").trim() || null,
    };

    if (!payload.name || !payload.role) {
      return alert("Name and Role are required.");
    }

    setStaffAdding(true);
    try {
      const created = await api.post("/staff", payload);
      setStaff((prev) => [...prev, created]);
      setShowAddStaff(false);
      setStaffForm({ name: "", role: "", email: "", phone: "" });
    } catch (e) {
      alert(
        e?.message ||
          "Failed to add staff. If POST /staff isn't wired yet, tell me and I’ll add the backend route."
      );
    } finally {
      setStaffAdding(false);
    }
  }

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

  function normalizeHeader(h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }

      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (ch === "," && !inQuotes) {
        row.push(cur);
        cur = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cur);
        cur = "";
        if (row.some((c) => String(c).trim() !== "")) rows.push(row);
        row = [];
        continue;
      }

      cur += ch;
    }

    if (cur.length || row.length) {
      row.push(cur);
      if (row.some((c) => String(c).trim() !== "")) rows.push(row);
    }

    return rows;
  }

  function buildStaffFromCsvRows(rows) {
    if (!rows || rows.length < 2)
      return {
        staffRows: [],
        errors: ["CSV must include a header row and at least 1 data row."],
      };

    const header = rows[0].map(normalizeHeader);

    const idxName = header.findIndex((h) => h === "name" || h === "full_name");
    const idxRole = header.findIndex((h) => h === "role" || h === "title");
    const idxEmail = header.findIndex((h) => h === "email" || h === "e-mail");
    const idxPhone = header.findIndex(
      (h) => h === "phone" || h === "phone_number" || h === "mobile"
    );

    const errors = [];
    if (idxName < 0) errors.push('Missing required column: "name"');
    if (idxRole < 0) errors.push('Missing required column: "role"');
    if (errors.length) return { staffRows: [], errors };

    const staffRows = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const item = {
        name: String(r[idxName] ?? "").trim(),
        role: String(r[idxRole] ?? "").trim(),
        email: idxEmail >= 0 ? String(r[idxEmail] ?? "").trim() || null : null,
        phone: idxPhone >= 0 ? String(r[idxPhone] ?? "").trim() || null : null,
      };
      if (!item.name && !item.role && !item.email && !item.phone) continue;
      if (!item.name || !item.role) {
        errors.push(`Row ${i + 1}: name and role are required.`);
        continue;
      }
      staffRows.push(item);
    }

    if (staffRows.length === 0 && errors.length === 0)
      errors.push("No valid rows found.");
    return { staffRows, errors };
  }

  async function onCsvSelected(file) {
    setCsvError("");
    if (!file) return;

    const name = String(file.name || "").toLowerCase();
    if (!name.endsWith(".csv")) {
      setCsvError("Please upload a .csv file.");
      return;
    }

    setCsvUploading(true);
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      const { staffRows, errors } = buildStaffFromCsvRows(rows);

      if (errors.length) {
        setCsvError(errors.slice(0, 6).join(" "));
        return;
      }

      const created = [];
      for (const s of staffRows) {
        // eslint-disable-next-line no-await-in-loop
        const c = await api.post("/staff", s);
        created.push(c);
      }

      setStaff((prev) => [...prev, ...created]);
      alert(`Imported ${created.length} staff member(s).`);
    } catch (e) {
      console.error("CSV UPLOAD ERROR:", e);
      setCsvError(e?.message || "Failed to import CSV.");
    } finally {
      setCsvUploading(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
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
    const roleVal =
      selectedShiftRole !== "ALL"
        ? selectedShiftRole
        : String(shiftForm.role || "").trim();

    if (!roleVal) return;

    const created = await api.post("/shift-settings", { ...shiftForm, role: roleVal });
    setShiftSettings((prev) => [...prev, created]);

    setShiftForm((p) => ({
      ...p,
      role: selectedShiftRole !== "ALL" ? selectedShiftRole : "",
      shift_type: "Day",
      start_local: "07:00",
      end_local: "15:00",
    }));
  }

  async function saveShift(id) {
    const roleVal =
      selectedShiftRole !== "ALL"
        ? selectedShiftRole
        : String(shiftForm.role || "").trim();

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
  // ROOMS ACTIONS
  // ==================================================
  async function addRoom() {
    if (!canManageFacility) return;
    const name = String(roomForm.name || "").trim();
    if (!name) return;
    setRoomSaving(true);
    try {
      const created = await api.post("/facility/rooms", {
        name,
        is_active: !!roomForm.is_active,
      });

      setRooms((prev) => {
        const next = [...prev, created].sort(sortByOrderThenName);
        if (!selectedRoomId && created?.id) setSelectedRoomId(created.id);
        return next;
      });

      setRoomForm({ name: "", is_active: true });

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
      const updated = await api.patch(`/facility/rooms/${id}`, {
        name,
        is_active: !!roomForm.is_active,
      });
      setRooms((prev) =>
        prev
          .map((r) => (r.id === id ? { ...r, ...updated } : r))
          .sort(sortByOrderThenName)
      );
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
      const updated = await api.patch(`/facility/rooms/${room.id}`, {
        is_active: !(room.is_active !== false),
      });
      setRooms((prev) =>
        prev
          .map((r) => (r.id === room.id ? { ...r, ...updated } : r))
          .sort(sortByOrderThenName)
      );
    } catch (e) {
      alert(e?.message || "Failed to update room.");
    } finally {
      setRoomSaving(false);
    }
  }

  // ==================================================
  // BEDS ACTIONS
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

      setBeds((prev) => [...prev, created].sort(sortByOrderThenLabel));

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
      const updated = await api.patch(`/facility/beds/${id}`, {
        label,
        is_active: !!bedForm.is_active,
      });

      setBeds((prev) =>
        prev.map((b) => (b.id === id ? updated : b)).sort(sortByOrderThenLabel)
      );

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRoomId) return r;
          const nextBeds = (Array.isArray(r.beds) ? r.beds : []).map((b) =>
            b.id === id ? updated : b
          );
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
      const updated = await api.patch(`/facility/beds/${bed.id}`, {
        is_active: !(bed.is_active !== false),
      });

      setBeds((prev) =>
        prev
          .map((b) => (b.id === bed.id ? updated : b))
          .sort(sortByOrderThenLabel)
      );

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRoomId) return r;
          const nextBeds = (Array.isArray(r.beds) ? r.beds : []).map((b) =>
            b.id === bed.id ? updated : b
          );
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

    setBeds(nextBeds);

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== selectedRoomId) return r;
        return { ...r, beds: nextBeds };
      })
    );

    try {
      const bed_ids = nextBeds.map((b) => b.id);
      await api.post("/facility/beds/reorder", {
        room_id: selectedRoomId,
        bed_ids,
      });
    } catch (e) {
      console.error("REORDER SAVE ERROR:", e);
      alert(e?.message || "Failed to save bed order.");
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

  const filteredAdminMembers = useMemo(() => {
    const q = String(adminSearch || "").trim().toLowerCase();
    if (!q) return adminMembers;

    return (adminMembers || []).filter((m) => {
      const hay = [
        m.display_name,
        m.email,
        m.phone,
        m.role,
        m.user_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [adminMembers, adminSearch]);

  // ==================================================
  // RENDER
  // ==================================================
  return (
    <div style={ui.page}>
      {/* TOP BAR */}
      <div style={ui.topBar}>
        <div style={ui.brand}>
          <div style={{ minWidth: 0 }}>
            <div style={ui.h1}>Admin Panel</div>
            <div style={ui.sub}>
              <span style={{ color: "#E5E7EB", fontWeight: 900 }}>
                {orgName || "No facility selected"}
                {orgCode ? (
                  <>
                    {" "} •{" "}
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {orgCode}
                    </span>
                  </>
                ) : null}
              </span>

              {headerSubtitle ? (
                <span style={{ marginLeft: 10, color: "#9CA3AF" }}>{headerSubtitle}</span>
              ) : null}
              {loading ? <span style={{ marginLeft: 10, color: "#9CA3AF" }}>Loading…</span> : null}
            </div>
          </div>
        </div>

        <div style={ui.topActions}>
          <button style={ui.btnGhost} onClick={loadAll} disabled={loading || !orgId}>
            Refresh
          </button>
          <button
            style={ui.btnGhost}
            onClick={() => setOrgSwitcherOpen(true)}
            disabled={isSuperadmin ? superOrgsLoading : false}
          >
            Change Facility
          </button>
        </div>
      </div>

      {/* ✅ ORG SWITCHERS */}
      {!isSuperadmin ? (
        <OrgSwitcher open={orgSwitcherOpen} onClose={() => setOrgSwitcherOpen(false)} />
      ) : (
        <SuperAdminOrgSwitcher
          open={orgSwitcherOpen}
          onClose={() => setOrgSwitcherOpen(false)}
          orgs={superOrgs}
          loading={superOrgsLoading}
          onPick={(pickedOrgId) => {
            switchOrg(pickedOrgId);
            setOrgSwitcherOpen(false);
          }}
        />
      )}

      {/* TABS */}
      <div style={ui.tabs}>
        <TabButton active={activeTab === "staff"} onClick={() => setActiveTab("staff")} label="Staff" />
        <TabButton active={activeTab === "units"} onClick={() => setActiveTab("units")} label="Units" />
        <TabButton active={activeTab === "shifts"} onClick={() => setActiveTab("shifts")} label="Shift Settings" />
        <TabButton active={activeTab === "rooms_beds"} onClick={() => setActiveTab("rooms_beds")} label="Rooms & Beds" />
        <TabButton active={activeTab === "privacy"} onClick={() => setActiveTab("privacy")} label="Privacy" />

        {/* ✅ Only show if can_manage_admins */}
        {(canManageAdmins || isSuperadmin) ? (
          <TabButton
            active={activeTab === "admin_access"}
            onClick={() => setActiveTab("admin_access")}
            label="Admin Access"
          />
        ) : null}
      </div>

      {/* CONTENT */}
      <div style={ui.contentGrid}>
        {!orgId ? (
          <div style={ui.card}>
            <div style={ui.notice}>
              No facility selected. Click <b>Change Facility</b> to pick the organization you want to manage.
            </div>
          </div>
        ) : null}

        {/* ✅ ADMIN ACCESS */}
        {activeTab === "admin_access" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Admin Access</div>
                <div style={ui.cardSub}>
                  Toggle admin permissions for users in this organization. Only users with <b>can_manage_admins</b> can change these.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ ...ui.input, minWidth: 220 }}
                  placeholder="Search name, email, role…"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                />
                <button
                  style={ui.btnGhost}
                  onClick={loadAdminMembers}
                  disabled={adminMembersLoading}
                >
                  {adminMembersLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {(!canManageAdmins && !isSuperadmin) ? (
              <div style={ui.notice}>
                You don’t have permission to manage admins for this organization.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={ui.table}>
                  <thead>
                    <tr>
                      <th style={ui.th}>User</th>
                      <th style={ui.th}>Role</th>
                      <th style={ui.th}>Active</th>
                      <th style={ui.th}>Is Admin</th>
                      <th style={ui.th}>Can Manage Admins</th>
                      <th style={ui.th}>Can Schedule Write</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminMembers.map((m) => {
                      const isSaving = savingMemberUserId === m.user_id;

                      // basic UI lockout prevention:
                      // we cannot safely detect "self" here without auth id,
                      // but backend already prevents self removal. This is just UX.
                      const isAdmin = !!m.is_admin;
                      const canMgr = !!m.can_manage_admins;
                      const canSch = !!m.can_schedule_write;
                      const isActive = m.is_active !== false;

                      return (
                        <tr key={m.user_id} style={ui.tr}>
                          <td style={ui.td}>
                            <div style={{ display: "grid", gap: 4 }}>
                              <div style={ui.cellStrong}>
                                {m.display_name || m.email || "Unknown User"}
                              </div>
                              <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                                {m.email ? m.email : null}
                                {m.email && m.phone ? " • " : null}
                                {m.phone ? m.phone : null}
                                <span style={{ marginLeft: 8 }}>
                                  user_id:{" "}
                                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                    {m.user_id}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>

                          <td style={ui.td}>
                            <span style={ui.pill}>{m.role || "—"}</span>
                          </td>

                          <td style={ui.td}>
                            <label style={ui.smallCheck}>
                              <input
                                type="checkbox"
                                checked={isActive}
                                disabled={isSaving}
                                onChange={(e) =>
                                  saveMemberPerms(m.user_id, { is_active: e.target.checked })
                                }
                              />
                              Active
                            </label>
                          </td>

                          <td style={ui.td}>
                            <label style={ui.smallCheck}>
                              <input
                                type="checkbox"
                                checked={isAdmin}
                                disabled={isSaving}
                                onChange={(e) =>
                                  saveMemberPerms(m.user_id, { is_admin: e.target.checked })
                                }
                              />
                              Admin
                            </label>
                          </td>

                          <td style={ui.td}>
                            <label style={ui.smallCheck}>
                              <input
                                type="checkbox"
                                checked={canMgr}
                                disabled={isSaving}
                                onChange={(e) =>
                                  saveMemberPerms(m.user_id, { can_manage_admins: e.target.checked })
                                }
                              />
                              Manage Admins
                            </label>
                          </td>

                          <td style={ui.td}>
                            <label style={ui.smallCheck}>
                              <input
                                type="checkbox"
                                checked={canSch}
                                disabled={isSaving}
                                onChange={(e) =>
                                  saveMemberPerms(m.user_id, { can_schedule_write: e.target.checked })
                                }
                              />
                              Schedule Write
                            </label>
                          </td>

                          <td style={{ ...ui.td, textAlign: "right" }}>
                            {isSaving ? (
                              <span style={{ color: "#9CA3AF", fontWeight: 900 }}>Saving…</span>
                            ) : (
                              <span style={{ color: "#9CA3AF", fontSize: 12 }}>
                                Changes save instantly
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {!adminMembersLoading && filteredAdminMembers.length === 0 ? (
                      <tr>
                        <td style={ui.emptyRow} colSpan={7}>
                          No members found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* STAFF */}
        {activeTab === "staff" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Staff</div>
                <div style={ui.cardSub}>Manage staff directory for scheduling and assignments.</div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  style={ui.btnPrimary}
                  onClick={() => {
                    setStaffForm({ name: "", role: "", email: "", phone: "" });
                    setShowAddStaff(true);
                  }}
                >
                  + Add Staff
                </button>

                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => onCsvSelected(e.target.files?.[0])}
                />
                <button
                  style={ui.btnGhost}
                  onClick={() => csvInputRef.current?.click()}
                  disabled={csvUploading}
                  title="CSV columns: name, role, email, phone"
                >
                  {csvUploading ? "Importing…" : "Import CSV"}
                </button>
              </div>
            </div>

            {csvError ? <div style={{ ...ui.notice, borderColor: "rgba(239,68,68,0.35)" }}>{csvError}</div> : null}

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

            {/* ADD STAFF MODAL */}
            {showAddStaff ? (
              <div onMouseDown={() => setShowAddStaff(false)} style={ui.modalOverlay}>
                <div onMouseDown={(e) => e.stopPropagation()} style={ui.modal}>
                  <div style={ui.modalTitle}>Add Staff Member</div>
                  <div style={ui.modalBody}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <input
                        style={ui.input}
                        placeholder="Name *"
                        value={staffForm.name}
                        onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))}
                      />
                      <input
                        style={ui.input}
                        placeholder="Role * (CNA, LPN, RN, Scheduler, etc.)"
                        value={staffForm.role}
                        onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))}
                      />
                      <input
                        style={ui.input}
                        placeholder="Email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))}
                      />
                      <input
                        style={ui.input}
                        placeholder="Phone"
                        value={staffForm.phone}
                        onChange={(e) => setStaffForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                      <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                        Required: <b>Name</b> and <b>Role</b>.
                      </div>
                    </div>
                  </div>

                  <div style={ui.modalActions}>
                    <button
                      style={ui.btnGhost}
                      onClick={() => {
                        setShowAddStaff(false);
                        setStaffForm({ name: "", role: "", email: "", phone: "" });
                      }}
                      disabled={staffAdding}
                    >
                      Cancel
                    </button>
                    <button style={ui.btnPrimary} onClick={addStaff} disabled={staffAdding}>
                      {staffAdding ? "Adding…" : "Add Staff"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* UNITS */}
        {activeTab === "units" && orgId && (
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
        {activeTab === "shifts" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Shift Settings</div>
                <div style={ui.cardSub}>Click a role bubble to manage shift templates for that role.</div>
              </div>
            </div>

            <div style={ui.roleBubbleWrap}>
              <button
                type="button"
                onClick={() => selectShiftRole("ALL")}
                style={ui.roleBubble(selectedShiftRole === "ALL")}
                title="Show all roles"
              >
                All
              </button>

              {roleOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => selectShiftRole(r)}
                  style={ui.roleBubble(selectedShiftRole === r)}
                  title={`Manage ${r} shifts`}
                >
                  {r}
                </button>
              ))}

              {roleOptions.length === 0 ? (
                <div style={{ color: "#9CA3AF", fontSize: 12, padding: "6px 0" }}>
                  No roles yet. Add your first shift setting below.
                </div>
              ) : null}
            </div>

            <div style={ui.inlineFormWrap}>
              {selectedShiftRole === "ALL" ? (
                <input
                  style={{ ...ui.input, minWidth: 200 }}
                  placeholder="Role (CNA, LPN, RN)"
                  value={shiftForm.role}
                  onChange={(e) => setShiftForm({ ...shiftForm, role: e.target.value })}
                />
              ) : (
                <div style={ui.roleLockedPill} title="Role is locked by the selected bubble">
                  Role: <span style={{ fontWeight: 1000 }}>{selectedShiftRole}</span>
                  <button
                    type="button"
                    onClick={() => selectShiftRole("ALL")}
                    style={ui.roleUnlockBtn}
                    title="Unlock role (switch back to All)"
                  >
                    Change
                  </button>
                </div>
              )}

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
                  {filteredShiftSettings.map((s) => {
                    const isEdit = editingShiftId === s.id;
                    return (
                      <tr key={s.id} style={ui.tr}>
                        <td style={ui.td}>
                          {isEdit && selectedShiftRole === "ALL" ? (
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

                  {filteredShiftSettings.length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={4}>
                        {selectedShiftRole === "ALL"
                          ? "No shift settings yet."
                          : `No shift settings for ${selectedShiftRole} yet.`}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ROOMS & BEDS */}
        {activeTab === "rooms_beds" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Rooms & Beds</div>
                <div style={ui.cardSub}>
                  Fully customizable facility layout. Create rooms with any names, then add beds per room.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button style={ui.btnGhost} onClick={loadRooms} disabled={roomsLoading}>
                  {roomsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {!canManageFacility ? (
              <div style={ui.notice}>
                You don’t have permission to manage facility layout for this organization.
              </div>
            ) : (
              <div style={ui.rbGrid}>
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
                            <div key={r.id} onClick={() => setSelectedRoomId(r.id)} style={ui.roomRow(selected, inactive)}>
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
                                  <button style={ui.btnMiniGhost} onClick={() => moveBedByIndex(idx, idx - 1)} disabled={idx === 0}>
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
        {activeTab === "privacy" && orgId && (
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
                      <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                        Only initials / limited label. Never full name, DOB, MRN.
                      </div>
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

            {showAck ? (
              <div onMouseDown={() => setShowAck(false)} style={ui.modalOverlay}>
                <div onMouseDown={(e) => e.stopPropagation()} style={ui.modal}>
                  <div style={ui.modalTitle}>Acknowledge Privacy Risk</div>
                  <div style={ui.modalBody}>
                    You are enabling limited patient identifiers on the Census board. Only enable this if your facility policy allows it and access is
                    restricted. Do not enter full names or MRNs. You are responsible for operating compliantly.
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

function SuperAdminOrgSwitcher({ open, onClose, orgs, loading, onPick }) {
  if (!open) return null;

  const list = Array.isArray(orgs) ? orgs : [];

  return (
    <div style={ui.overlay} onMouseDown={() => onClose?.()} role="dialog" aria-modal="true">
      <div style={ui.modal2} onMouseDown={(e) => e.stopPropagation()}>
        <div style={ui.title2}>Choose Facility</div>
        <div style={ui.sub2}>As SuperAdmin, you can pick any organization to manage.</div>

        <div style={ui.list2}>
          {loading ? (
            <div style={ui.empty2}>Loading organizations…</div>
          ) : (
            list.map((o) => (
              <button
                key={o.id || o.org_code}
                type="button"
                style={ui.row2}
                onClick={() => onPick?.(o.id)}
                title={`orgId: ${o.id}`}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, textAlign: "left" }}>
                  <div style={{ color: "white", fontWeight: 1000, fontSize: 14 }}>
                    {o.name || "Unnamed Org"}
                  </div>
                  <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                    {o.org_code || "—"} • orgId:{" "}
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {o.id}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}

          {!loading && list.length === 0 ? <div style={ui.empty2}>No organizations found.</div> : null}
        </div>

        <div style={ui.actions2}>
          <button style={ui.btnGhost} onClick={() => onClose?.()} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function sortByOrderThenName(a, b) {
  const ao = a?.display_order ?? 999999;
  const bo = b?.display_order ?? 999999;
  if (ao !== bo) return ao - bo;
  return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

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

  roleBubbleWrap: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 12,
  },

  roleBubble: (active) => ({
    height: 38,
    borderRadius: 999,
    padding: "8px 12px",
    border: active ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: active ? "0 12px 34px rgba(0,0,0,0.35)" : "0 10px 28px rgba(0,0,0,0.22)",
  }),

  roleLockedPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    height: 40,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 900,
    minWidth: 200,
  },

  roleUnlockBtn: {
    height: 28,
    borderRadius: 999,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
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

  label: {
    color: "#9CA3AF",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 6,
  },

  // superadmin org picker styles
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal2: {
    width: "min(860px, 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.9)",
    boxShadow: "0 30px 120px rgba(0,0,0,0.75)",
    padding: 16,
  },
  title2: { color: "white", fontWeight: 1000, fontSize: 18 },
  sub2: { color: "#9CA3AF", marginTop: 6, fontSize: 13, lineHeight: 1.35 },
  list2: { display: "grid", gap: 10, marginTop: 14, maxHeight: "60vh", overflow: "auto" },
  row2: {
    width: "100%",
    textAlign: "left",
    borderRadius: 16,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    cursor: "pointer",
  },
  empty2: { color: "#9CA3AF", padding: 14, textAlign: "center" },
  actions2: { display: "flex", justifyContent: "flex-end", marginTop: 14 },
};
