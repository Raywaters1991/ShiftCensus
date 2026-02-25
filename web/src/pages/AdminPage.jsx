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
    switchOrg,

    // org-scoped perms
    isSuperadmin,
    isOrgAdmin,
    canManageAdmins,
    canScheduleWrite,
  } = useUser();

  // ---------------------------------
  // Grouped navigation
  // ---------------------------------
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") return "staff_settings";
    return window.localStorage.getItem("admin_active_section") || "staff_settings";
  });

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "staff";
    return window.localStorage.getItem("admin_active_tab") || "staff";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin_active_section", activeSection);
    }
  }, [activeSection]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin_active_tab", activeTab);
    }
  }, [activeTab]);

  // ---------------------------------
  // Top-level loading
  // ---------------------------------
  const [loading, setLoading] = useState(false);

  // Facility switcher
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [superOrgs, setSuperOrgs] = useState([]);
  const [superOrgsLoading, setSuperOrgsLoading] = useState(false);

  async function loadSuperOrgs() {
    if (!isSuperadmin) return;
    setSuperOrgsLoading(true);
    try {
      const data = await api.get("/organizations");
      setSuperOrgs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("LOAD SUPER ORGS ERROR:", e);
      setSuperOrgs([]);
    } finally {
      setSuperOrgsLoading(false);
    }
  }

  // ---------------------------------
  // Core Admin Data
  // ---------------------------------
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
    department_id: "",
  });

  const [unitForm, setUnitForm] = useState({ name: "" });

  const [shiftForm, setShiftForm] = useState({
    role: "",
    shift_type: "Day",
    start_local: "07:00",
    end_local: "15:00",
  });

  // ---------------------------------
  // ✅ Staff search + permissions UI
  // ---------------------------------
  const [staffSearch, setStaffSearch] = useState("");

  // Memberships that drive permissions (Admin + Census/Schedule read/write)
  const [adminMembers, setAdminMembers] = useState([]);
  const [adminMembersLoading, setAdminMembersLoading] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState(null);

  // Key idea: build lookup by staff_id (or user_id fallback)
  const memberByStaffId = useMemo(() => {
    const map = new Map();
    (adminMembers || []).forEach((m) => {
      if (m.staff_id) map.set(String(m.staff_id), m);
    });
    return map;
  }, [adminMembers]);

  async function loadAdminMembers() {
    if (!orgId || !orgCode) return;
    // If your API allows org admins to manage access, keep. Otherwise restrict by canManageAdmins/isSuperadmin
    if (!isOrgAdmin && !canManageAdmins && !isSuperadmin) return;

    setAdminMembersLoading(true);
    try {
      const data = await api.get("/adminmanagement/list", {
        headers: { "X-Org-Code": orgCode },
      });

      const list = Array.isArray(data?.memberships) ? data.memberships : [];
      setAdminMembers(list);
    } catch (e) {
      console.error("LOAD ADMIN MEMBERS ERROR:", e);
      setAdminMembers([]);
    } finally {
      setAdminMembersLoading(false);
    }
  }

  async function saveMemberPerms(membershipId, patch) {
    if (!orgCode) return;
    setSavingMemberId(membershipId);
    try {
      const data = await api.patch(`/adminmanagement/${membershipId}`, patch, {
        headers: { "X-Org-Code": orgCode },
      });

      const updated = data?.membership || null;
      if (!updated?.id) return;

      setAdminMembers((prev) =>
        prev.map((m) => (String(m.id) === String(updated.id) ? { ...m, ...updated } : m))
      );
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to update permissions.");
    } finally {
      setSavingMemberId(null);
    }
  }

  // ---------------------------------
  // ✅ Invite link UX
  // ---------------------------------
  const [inviteModal, setInviteModal] = useState(null); // { name, email, phone, actionLink, note }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      alert("Copied to clipboard.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = String(text || "");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Copied to clipboard.");
    }
  }

  // ---------------------------------
  // ✅ Shift Settings filters (role bubbles)
  // ---------------------------------
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

  function selectShiftRole(roleName) {
    const next = roleName || "ALL";
    setSelectedShiftRole(next);

    if (next !== "ALL") {
      setShiftForm((p) => ({ ...p, role: next }));
    }
    setEditingShiftId(null);
  }

  // ---------------------------------
  // CSV import
  // ---------------------------------
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffAdding, setStaffAdding] = useState(false);

  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  const csvInputRef = useRef(null);

  // ---------------------------------
  // Departments
  // ---------------------------------
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);

  const [deptForm, setDeptForm] = useState({ name: "", is_active: true });
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [deptSaving, setDeptSaving] = useState(false);

  async function loadDepartments() {
    if (!orgId) return;
    setDepartmentsLoading(true);
    try {
      const data = await api.get("/departments");
      setDepartments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("LOAD DEPARTMENTS ERROR:", e);
      setDepartments([]);
    } finally {
      setDepartmentsLoading(false);
    }
  }

  async function addDepartment() {
    const name = String(deptForm.name || "").trim();
    if (!name) return alert("Department name is required.");
    setDeptSaving(true);
    try {
      const created = await api.post("/departments", {
        name,
        is_active: !!deptForm.is_active,
      });
      setDepartments((prev) =>
        [...prev, created].sort((a, b) =>
          String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
            numeric: true,
            sensitivity: "base",
          })
        )
      );
      setDeptForm({ name: "", is_active: true });
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to add department.");
    } finally {
      setDeptSaving(false);
    }
  }

  async function saveDepartment(id) {
    const name = String(deptForm.name || "").trim();
    if (!name) return alert("Department name is required.");
    setDeptSaving(true);
    try {
      const updated = await api.patch(`/departments/${id}`, {
        name,
        is_active: !!deptForm.is_active,
      });
      setDepartments((prev) =>
        prev
          .map((d) => (d.id === id ? { ...d, ...updated } : d))
          .sort((a, b) =>
            String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
              numeric: true,
              sensitivity: "base",
            })
          )
      );
      setEditingDeptId(null);
      setDeptForm({ name: "", is_active: true });
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to save department.");
    } finally {
      setDeptSaving(false);
    }
  }

  async function toggleDepartmentActive(d) {
    setDeptSaving(true);
    try {
      const updated = await api.patch(`/departments/${d.id}`, {
        is_active: !(d.is_active !== false),
      });
      setDepartments((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...updated } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to update department.");
    } finally {
      setDeptSaving(false);
    }
  }

  // ---------------------------------
  // Privacy + Facility Settings
  // ---------------------------------
  const [orgSettings, setOrgSettings] = useState(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [showAck, setShowAck] = useState(false);

  // ✅ NEW: lunch break length (minutes) for PPD accuracy
  const [lunchBreakMins, setLunchBreakMins] = useState(30);
  const [lunchSaving, setLunchSaving] = useState(false);

  // ✅ NEW: pay period settings for OT
  const [payPeriod, setPayPeriod] = useState({
    length_days: 14,
    week_starts_on: "Sunday", // Sunday/Monday etc
    anchor_date: "", // YYYY-MM-DD (optional)
  });
  const [payPeriodSaving, setPayPeriodSaving] = useState(false);

  const canManagePrivacy = !!isOrgAdmin;
  const canManageFacility = !!isOrgAdmin;

  async function loadOrgSettings() {
    try {
      const data = await api.get("/org-settings");
      setOrgSettings(data);

      // best-effort fill for new settings (if your backend already stores them)
      const lb = Number(data?.lunch_break_minutes);
      if (!Number.isNaN(lb) && lb >= 0) setLunchBreakMins(lb);

      const pp = data?.pay_period || null;
      if (pp) {
        setPayPeriod((p) => ({
          ...p,
          length_days: Number(pp.length_days || p.length_days),
          week_starts_on: String(pp.week_starts_on || p.week_starts_on),
          anchor_date: String(pp.anchor_date || p.anchor_date || ""),
        }));
      }
    } catch (e) {
      console.error("ORG SETTINGS LOAD ERROR:", e);
      setOrgSettings({
        show_patient_identifiers: false,
        identifier_format: "first_last_initial",
      });
    }
  }

  async function savePrivacy({ enabled, format, acknowledged }) {
    setPrivacySaving(true);
    try {
      const updated = await api.put("/org-settings/identifiers", {
        enabled,
        format,
        acknowledged,
      });
      setOrgSettings(updated);
      setShowAck(false);
    } catch (e) {
      alert(e?.message || "Failed to update privacy settings");
    } finally {
      setPrivacySaving(false);
    }
  }

  // ✅ NEW: save lunch break minutes
  async function saveLunchBreakMinutes() {
    setLunchSaving(true);
    try {
      const mins = Math.max(0, Math.min(240, Number(lunchBreakMins || 0)));
      const updated = await api.put("/org-settings/lunch-break", { minutes: mins });
      setOrgSettings((p) => ({ ...p, ...(updated || {}) }));
      alert("Lunch break saved.");
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to save lunch break.");
    } finally {
      setLunchSaving(false);
    }
  }

  // ✅ NEW: save pay period settings
  async function savePayPeriod() {
    setPayPeriodSaving(true);
    try {
      const payload = {
        length_days: Number(payPeriod.length_days || 14),
        week_starts_on: String(payPeriod.week_starts_on || "Sunday"),
        anchor_date: payPeriod.anchor_date ? String(payPeriod.anchor_date) : null,
      };
      const updated = await api.put("/org-settings/pay-period", payload);
      setOrgSettings((p) => ({ ...p, ...(updated || {}) }));
      alert("Pay period saved.");
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Failed to save pay period.");
    } finally {
      setPayPeriodSaving(false);
    }
  }

  // ---------------------------------
  // Rooms & Beds
  // ---------------------------------
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

  async function loadRooms() {
    setRoomsLoading(true);
    try {
      const data = await api.get("/facility/rooms");
      const list = Array.isArray(data) ? data : [];
      const sorted = list.slice().sort(sortByOrderThenName);

      setRooms(sorted);

      const firstActive = sorted.find((r) => r.is_active !== false) || sorted[0] || null;

      setSelectedRoomId((prev) => (prev ? prev : firstActive?.id ?? null));

      const currentRoomId = (selectedRoomId ?? firstActive?.id) || null;

      if (currentRoomId) {
        const room = sorted.find((r) => r.id === currentRoomId);
        setBeds(Array.isArray(room?.beds) ? room.beds.slice().sort(sortByOrderThenLabel) : []);
      } else {
        setBeds([]);
      }
    } catch (e) {
      console.error("LOAD ROOMS ERROR:", e);
      alert(e?.message || "Failed to load rooms.");
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
        prev.map((r) => {
          if (r.id !== selectedRoomId) return r;
          const nextBeds = Array.isArray(r.beds) ? [...r.beds, created] : [created];
          return { ...r, beds: nextBeds };
        })
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
      const updated = await api.patch(`/facility/beds/${bed.id}`, {
        is_active: !(bed.is_active !== false),
      });

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

  function moveBedByIndex(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= beds.length) return;
    const next = beds.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    persistBedOrder(next);
  }

  // ---------------------------------
  // Units actions
  // ---------------------------------
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

  // ---------------------------------
  // Shift settings actions
  // ---------------------------------
  async function addShift() {
    const roleVal =
      selectedShiftRole !== "ALL" ? selectedShiftRole : String(shiftForm.role || "").trim();
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
      selectedShiftRole !== "ALL" ? selectedShiftRole : String(shiftForm.role || "").trim();
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

  // ---------------------------------
  // Staff actions
  // ---------------------------------
  async function addStaff() {
    const payload = {
      name: String(staffForm.name || "").trim(),
      role: String(staffForm.role || "").trim(),
      email: String(staffForm.email || "").trim() || null,
      phone: String(staffForm.phone || "").trim() || null,
      department_id: staffForm.department_id ? staffForm.department_id : null,
    };

    if (!payload.name || !payload.role) return alert("Name and Role are required.");

    setStaffAdding(true);
    try {
      const created = await api.post("/staff", payload);
      setStaff((prev) => [...prev, created]);
      setShowAddStaff(false);

      // invite UX
      if (created?.actionLink) {
        setInviteModal({
          name: created?.name || payload.name,
          email: created?.email || payload.email,
          phone: created?.phone || payload.phone,
          actionLink: created.actionLink,
          note:
            created?.note ||
            created?.error ||
            "Invite link created. Copy and send it to the staff member.",
        });
      } else if (created?.invite_sent === false && created?.login_created) {
        setInviteModal({
          name: created?.name || payload.name,
          email: created?.email || payload.email,
          phone: created?.phone || payload.phone,
          actionLink: null,
          note: created?.error || "Login created but invite was not sent.",
        });
      }

      setStaffForm({ name: "", role: "", email: "", phone: "", department_id: "" });

      // refresh permissions list because new staff might get membership row created
      loadAdminMembers();
    } catch (e) {
      alert(e?.message || "Failed to add staff.");
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
      department_id: staffForm.department_id ? staffForm.department_id : null,
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

  // ---------------------------------
  // CSV helpers
  // ---------------------------------
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
    const idxDept = header.findIndex(
      (h) =>
        h === "department_id" ||
        h === "department" ||
        h === "dept" ||
        h === "department_name"
    );

    const errors = [];
    if (idxName < 0) errors.push('Missing required column: "name"');
    if (idxRole < 0) errors.push('Missing required column: "role"');
    if (errors.length) return { staffRows: [], errors };

    const deptByName = new Map(
      (departments || []).map((d) => [String(d?.name || "").trim().toLowerCase(), d.id])
    );

    const staffRows = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];

      let department_id = null;
      if (idxDept >= 0) {
        const raw = String(r[idxDept] ?? "").trim();
        if (raw) {
          if (raw.includes("-") && raw.length >= 20) {
            department_id = raw;
          } else {
            department_id = deptByName.get(raw.toLowerCase()) || null;
          }
        }
      }

      const item = {
        name: String(r[idxName] ?? "").trim(),
        role: String(r[idxRole] ?? "").trim(),
        email: idxEmail >= 0 ? String(r[idxEmail] ?? "").trim() || null : null,
        phone: idxPhone >= 0 ? String(r[idxPhone] ?? "").trim() || null : null,
        department_id,
      };

      if (!item.name && !item.role && !item.email && !item.phone) continue;
      if (!item.name || !item.role) {
        errors.push(`Row ${i + 1}: name and role are required.`);
        continue;
      }
      staffRows.push(item);
    }

    if (staffRows.length === 0 && errors.length === 0) errors.push("No valid rows found.");
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

        if (c?.actionLink) {
          // eslint-disable-next-line no-await-in-loop
          await copyToClipboard(c.actionLink);
        }
      }

      setStaff((prev) => [...prev, ...created]);
      alert(`Imported ${created.length} staff member(s).`);

      loadAdminMembers();
    } catch (e) {
      console.error("CSV UPLOAD ERROR:", e);
      setCsvError(e?.message || "Failed to import CSV.");
    } finally {
      setCsvUploading(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  // ---------------------------------
  // Derived lists
  // ---------------------------------
  const deptOptions = useMemo(() => {
    return (departments || [])
      .slice()
      .sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [departments]);

  const filteredStaff = useMemo(() => {
    const q = String(staffSearch || "").trim().toLowerCase();
    if (!q) return staff;

    return (staff || []).filter((s) => {
      const hay = [s.id, s.name, s.role, s.email, s.phone, s.department_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [staff, staffSearch]);

  const headerSubtitle = useMemo(() => {
    const roomCount = rooms?.length ? rooms.length : null;
    const bedCount = beds?.length ? beds.length : null;
    if (activeTab !== "rooms_beds") return null;
    const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
    const roomLabel = selectedRoom ? `Room: ${selectedRoom.name}` : "No room selected";
    const suffix = bedCount !== null ? ` • ${bedCount} beds` : "";
    return `${roomLabel}${suffix}${roomCount !== null ? ` • ${roomCount} rooms total` : ""}`;
  }, [activeTab, rooms, beds, selectedRoomId]);

  // ---------------------------------
  // Tabs
  // ---------------------------------
  const staffTabs = useMemo(() => [{ key: "staff", label: "Staff" }], []);
  const facilityTabs = useMemo(
    () => [
      { key: "shifts", label: "Shift Settings" },
      { key: "departments", label: "Departments" },
      { key: "units", label: "Units" },
      { key: "rooms_beds", label: "Rooms & Beds" },
      { key: "privacy", label: "Privacy" },
      { key: "pay_period", label: "Pay Period" },
    ],
    []
  );

  function setSection(nextSection) {
    setActiveSection(nextSection);
    const nextTabs = nextSection === "facility_settings" ? facilityTabs : staffTabs;
    const safeTab = nextTabs.find((t) => t.key === activeTab)?.key || nextTabs[0]?.key || "staff";
    setActiveTab(safeTab);
  }

  // ---------------------------------
  // Initial loading
  // ---------------------------------
  useEffect(() => {
    if (!orgId) return;
    loadAll();
    loadOrgSettings();
    loadDepartments();
    loadAdminMembers(); // ✅ staff permissions need this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

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

  // On-demand loaders
  useEffect(() => {
    if (!orgId) return;

    if (activeTab === "rooms_beds") loadRooms();
    if (activeTab === "departments") loadDepartments();
    if (activeTab === "privacy" || activeTab === "pay_period" || activeTab === "shifts") loadOrgSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId]);

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

  // ---------------------------------
  // ✅ Permission helpers: Admin -> show census/schedule
  // ---------------------------------
  function getMembershipForStaff(staffId) {
    return memberByStaffId.get(String(staffId)) || null;
  }

  function isAdminForStaff(staffId) {
    const m = getMembershipForStaff(staffId);
    return !!(m?.is_org_admin || m?.can_manage_admins || m?.can_schedule_read || m?.can_schedule_write || m?.can_census_read || m?.can_census_write);
  }

  async function toggleAdminForStaff(staffId, checked) {
    const m = getMembershipForStaff(staffId);
    if (!m?.id) {
      alert("No permission record found for this staff member yet. (Backend needs to create membership row.)");
      return;
    }

    if (checked) {
      // turning admin ON (defaults: read access)
      await saveMemberPerms(m.id, {
        is_org_admin: true,
        can_census_read: true,
        can_census_write: false,
        can_schedule_read: true,
        can_schedule_write: false,
      });
    } else {
      // turning admin OFF -> clear everything
      await saveMemberPerms(m.id, {
        is_org_admin: false,
        can_manage_admins: false,
        can_census_read: false,
        can_census_write: false,
        can_schedule_read: false,
        can_schedule_write: false,
      });
    }
  }

  async function setAccess(staffId, patch) {
    const m = getMembershipForStaff(staffId);
    if (!m?.id) return alert("No permission record found for this staff member yet.");
    await saveMemberPerms(m.id, patch);
  }

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
                    {" "}
                    •{" "}
                    <span style={ui.mono}>{orgCode}</span>
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

      {/* ORG SWITCHERS */}
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

      {/* SECTION PICKER */}
      <div style={ui.sectionRow}>
        <button
          type="button"
          style={ui.sectionPill(activeSection === "staff_settings")}
          onClick={() => setSection("staff_settings")}
        >
          Staff Settings
        </button>
        <button
          type="button"
          style={ui.sectionPill(activeSection === "facility_settings")}
          onClick={() => setSection("facility_settings")}
        >
          Facility Settings
        </button>
      </div>

      {/* Tabs for section */}
      <div style={ui.tabs}>
        {(activeSection === "facility_settings" ? facilityTabs : staffTabs).map((t) => (
          <TabButton
            key={t.key}
            active={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
            label={t.label}
          />
        ))}
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

        {/* Invite modal */}
        {inviteModal ? (
          <div onMouseDown={() => setInviteModal(null)} style={ui.modalOverlay}>
            <div onMouseDown={(e) => e.stopPropagation()} style={ui.modal}>
              <div style={ui.modalTitle}>Invite Created</div>
              <div style={ui.modalBody}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <b>{inviteModal.name || "Staff member"}</b>
                    {inviteModal.email ? <span style={{ color: "#9CA3AF" }}> • {inviteModal.email}</span> : null}
                    {inviteModal.phone ? <span style={{ color: "#9CA3AF" }}> • {inviteModal.phone}</span> : null}
                  </div>

                  <div style={ui.notice}>{inviteModal.note || "Invite link created."}</div>

                  {inviteModal.actionLink ? (
                    <>
                      <div style={{ color: "#9CA3AF", fontSize: 12 }}>Invite / set-password link:</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <input style={{ ...ui.input, minWidth: 320, flex: 1 }} readOnly value={inviteModal.actionLink} />
                        <button style={ui.btnPrimary} onClick={() => copyToClipboard(inviteModal.actionLink)}>
                          Copy Link
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div style={ui.modalActions}>
                <button style={ui.btnGhost} onClick={() => setInviteModal(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ===========================
            STAFF SETTINGS
           =========================== */}
        {activeTab === "staff" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Staff</div>
                <div style={ui.cardSub}>
                  Add staff and manage access. When <b>Admin</b> is checked, choose Census/Schedule read/write.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ ...ui.input, minWidth: 260 }}
                  placeholder="Search staff…"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />

                <button
                  style={ui.btnPrimary}
                  onClick={() => {
                    setStaffForm({ name: "", role: "", email: "", phone: "", department_id: "" });
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
                  title="CSV columns: name, role, email, phone, department (optional)"
                >
                  {csvUploading ? "Importing…" : "Import CSV"}
                </button>

                <button style={ui.btnGhost} onClick={loadAdminMembers} disabled={adminMembersLoading}>
                  {adminMembersLoading ? "Loading Access…" : "Refresh Access"}
                </button>
              </div>
            </div>

            {csvError ? (
              <div style={{ ...ui.notice, borderColor: "rgba(239,68,68,0.35)" }}>{csvError}</div>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>ID</th>
                    <th style={ui.th}>Name</th>
                    <th style={ui.th}>Role</th>
                    <th style={ui.th}>Department</th>
                    <th style={ui.th}>Email</th>
                    <th style={ui.th}>Phone</th>
                    <th style={ui.th}>Admin</th>
                    <th style={ui.th}>Census</th>
                    <th style={ui.th}>Schedule</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredStaff.map((s) => {
                    const isEdit = editingStaffId === s.id;

                    const deptName =
                      deptOptions.find((d) => String(d.id) === String(s.department_id))?.name || "—";

                    const m = getMembershipForStaff(s.id);
                    const busy = String(savingMemberId) === String(m?.id);

                    const isAdmin = isAdminForStaff(s.id);

                    const censusRead = !!m?.can_census_read;
                    const censusWrite = !!m?.can_census_write;
                    const scheduleRead = !!m?.can_schedule_read;
                    const scheduleWrite = !!m?.can_schedule_write;

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
                            <select
                              style={ui.select}
                              value={staffForm.department_id || ""}
                              onChange={(e) => setStaffForm((p) => ({ ...p, department_id: e.target.value }))}
                            >
                              <option value="">No department</option>
                              {deptOptions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                  {d.is_active === false ? " (inactive)" : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={ui.muted}>{deptName}</span>
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

                        {/* Admin checkbox */}
                        <td style={ui.td}>
                          <input
                            type="checkbox"
                            checked={isAdmin}
                            disabled={busy || (!isOrgAdmin && !canManageAdmins && !isSuperadmin)}
                            onChange={(e) => toggleAdminForStaff(s.id, e.target.checked)}
                            title={!m?.id ? "No membership record yet" : "Admin"}
                          />
                        </td>

                        {/* Census (only show when admin true) */}
                        <td style={ui.td}>
                          {isAdmin ? (
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <label style={ui.smallToggle}>
                                <input
                                  type="checkbox"
                                  checked={censusRead}
                                  disabled={busy}
                                  onChange={(e) => setAccess(s.id, { can_census_read: e.target.checked })}
                                />
                                Read
                              </label>
                              <label style={ui.smallToggle}>
                                <input
                                  type="checkbox"
                                  checked={censusWrite}
                                  disabled={busy}
                                  onChange={(e) => setAccess(s.id, { can_census_write: e.target.checked })}
                                />
                                Write
                              </label>
                            </div>
                          ) : (
                            <span style={ui.muted}>—</span>
                          )}
                        </td>

                        {/* Schedule (only show when admin true) */}
                        <td style={ui.td}>
                          {isAdmin ? (
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <label style={ui.smallToggle}>
                                <input
                                  type="checkbox"
                                  checked={scheduleRead}
                                  disabled={busy}
                                  onChange={(e) => setAccess(s.id, { can_schedule_read: e.target.checked })}
                                />
                                Read
                              </label>
                              <label style={ui.smallToggle}>
                                <input
                                  type="checkbox"
                                  checked={scheduleWrite}
                                  disabled={busy}
                                  onChange={(e) => setAccess(s.id, { can_schedule_write: e.target.checked })}
                                />
                                Write
                              </label>
                            </div>
                          ) : (
                            <span style={ui.muted}>—</span>
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
                                  setStaffForm({ name: "", role: "", email: "", phone: "", department_id: "" });
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
                                    department_id: s.department_id || "",
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

                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={10}>
                        No matching staff.
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

                      <select
                        style={ui.select}
                        value={staffForm.department_id || ""}
                        onChange={(e) => setStaffForm((p) => ({ ...p, department_id: e.target.value }))}
                      >
                        <option value="">No department</option>
                        {deptOptions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                            {d.is_active === false ? " (inactive)" : ""}
                          </option>
                        ))}
                      </select>

                      <input
                        style={ui.input}
                        placeholder="Email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))}
                      />
                      <input
                        style={ui.input}
                        placeholder="Phone (+1... for SMS invites)"
                        value={staffForm.phone}
                        onChange={(e) => setStaffForm((p) => ({ ...p, phone: e.target.value }))}
                      />

                      <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                        Required: <b>Name</b> and <b>Role</b>.
                        <br />
                        If you enter an email, ShiftCensus will create a login and generate an invite link.
                        If you also enter an E.164 phone (+1...), it will SMS the link.
                      </div>
                    </div>
                  </div>

                  <div style={ui.modalActions}>
                    <button
                      style={ui.btnGhost}
                      onClick={() => {
                        setShowAddStaff(false);
                        setStaffForm({ name: "", role: "", email: "", phone: "", department_id: "" });
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

        {/* ===========================
            FACILITY SETTINGS
           =========================== */}

        {/* SHIFT SETTINGS (with lunch break minutes) */}
        {activeTab === "shifts" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Shift Settings</div>
                <div style={ui.cardSub}>
                  Define shift templates per role. Lunch break minutes are used to make PPD calculations more accurate.
                </div>
              </div>

              <button style={ui.btnGhost} onClick={loadAll} disabled={loading}>
                Refresh
              </button>
            </div>

            {/* Lunch break setting */}
            <div style={{ ...ui.notice, marginBottom: 12 }}>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>Lunch Break Length</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ ...ui.input, width: 120 }}
                  type="number"
                  min={0}
                  max={240}
                  value={lunchBreakMins}
                  onChange={(e) => setLunchBreakMins(e.target.value)}
                />
                <span style={ui.muted}>minutes (ex: 30)</span>
                <button style={ui.btnPrimary} onClick={saveLunchBreakMinutes} disabled={lunchSaving}>
                  {lunchSaving ? "Saving…" : "Save Lunch"}
                </button>
              </div>
            </div>

            {/* Role bubbles */}
            <div style={ui.roleBubbleWrap}>
              <button
                type="button"
                style={ui.roleBubble(selectedShiftRole === "ALL")}
                onClick={() => selectShiftRole("ALL")}
              >
                ALL
              </button>
              {roleOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  style={ui.roleBubble(selectedShiftRole === r)}
                  onClick={() => selectShiftRole(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Add/Edit shift */}
            <div style={ui.inlineFormWrap}>
              {selectedShiftRole === "ALL" ? (
                <input
                  style={ui.input}
                  placeholder="Role (ex: CNA)"
                  value={shiftForm.role || ""}
                  onChange={(e) => setShiftForm((p) => ({ ...p, role: e.target.value }))}
                />
              ) : (
                <div style={ui.roleLockedPill}>
                  Role: <b>{selectedShiftRole}</b>
                  <button style={ui.roleUnlockBtn} onClick={() => selectShiftRole("ALL")} type="button">
                    Unlock
                  </button>
                </div>
              )}

              <select
                style={ui.select}
                value={shiftForm.shift_type}
                onChange={(e) => setShiftForm((p) => ({ ...p, shift_type: e.target.value }))}
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
                onChange={(e) => setShiftForm((p) => ({ ...p, start_local: e.target.value }))}
              />
              <input
                style={ui.input}
                type="time"
                value={shiftForm.end_local}
                onChange={(e) => setShiftForm((p) => ({ ...p, end_local: e.target.value }))}
              />

              {editingShiftId ? (
                <>
                  <button style={ui.btnPrimary} onClick={() => saveShift(editingShiftId)}>
                    Save
                  </button>
                  <button
                    style={ui.btnGhost}
                    onClick={() => {
                      setEditingShiftId(null);
                      setShiftForm({ role: "", shift_type: "Day", start_local: "07:00", end_local: "15:00" });
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button style={ui.btnPrimary} onClick={addShift}>
                  Add
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Role</th>
                    <th style={ui.th}>Shift</th>
                    <th style={ui.th}>Start</th>
                    <th style={ui.th}>End</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredShiftSettings || []).map((s) => (
                    <tr key={s.id} style={ui.tr}>
                      <td style={ui.td}><span style={ui.pill}>{s.role}</span></td>
                      <td style={ui.td}>{s.shift_type}</td>
                      <td style={ui.td}>{s.start_local}</td>
                      <td style={ui.td}>{s.end_local}</td>
                      <td style={{ ...ui.td, textAlign: "right" }}>
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
                      </td>
                    </tr>
                  ))}
                  {(filteredShiftSettings || []).length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={5}>
                        No shift settings yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DEPARTMENTS */}
        {activeTab === "departments" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Departments</div>
                <div style={ui.cardSub}>Create departments (Nursing, Therapy, Dietary, etc.).</div>
              </div>

              <button style={ui.btnGhost} onClick={loadDepartments} disabled={departmentsLoading}>
                {departmentsLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {!isOrgAdmin && !canManageAdmins && !isSuperadmin ? (
              <div style={ui.notice}>You don’t have permission to manage departments for this organization.</div>
            ) : (
              <>
                <div style={ui.inlineForm}>
                  <input
                    style={ui.input}
                    placeholder="Department name"
                    value={deptForm.name}
                    onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <label style={ui.smallCheck}>
                    <input
                      type="checkbox"
                      checked={!!deptForm.is_active}
                      onChange={(e) => setDeptForm((p) => ({ ...p, is_active: e.target.checked }))}
                    />
                    Active
                  </label>

                  {editingDeptId ? (
                    <>
                      <button style={ui.btnPrimary} onClick={() => saveDepartment(editingDeptId)} disabled={deptSaving}>
                        {deptSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        style={ui.btnGhost}
                        onClick={() => {
                          setEditingDeptId(null);
                          setDeptForm({ name: "", is_active: true });
                        }}
                        disabled={deptSaving}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button style={ui.btnPrimary} onClick={addDepartment} disabled={deptSaving}>
                      {deptSaving ? "Adding…" : "Add"}
                    </button>
                  )}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={ui.table}>
                    <thead>
                      <tr>
                        <th style={ui.th}>Department</th>
                        <th style={ui.th}>Active</th>
                        <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptOptions.map((d) => {
                        const inactive = d.is_active === false;
                        return (
                          <tr key={d.id} style={ui.tr}>
                            <td style={ui.td}>
                              <div style={ui.cellStrong}>{d.name}</div>
                              <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                                id: <span style={ui.mono}>{d.id}</span>
                              </div>
                            </td>
                            <td style={ui.td}>
                              <span style={inactive ? ui.badgeOff : ui.badgeOn}>
                                {inactive ? "Inactive" : "Active"}
                              </span>
                            </td>
                            <td style={{ ...ui.td, textAlign: "right" }}>
                              <div style={ui.actions}>
                                <button
                                  style={ui.btnGhost}
                                  onClick={() => {
                                    setEditingDeptId(d.id);
                                    setDeptForm({ name: d.name || "", is_active: d.is_active !== false });
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  style={ui.btnMiniGhost}
                                  onClick={() => toggleDepartmentActive(d)}
                                  disabled={deptSaving}
                                >
                                  {inactive ? "Activate" : "Deactivate"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {!departmentsLoading && deptOptions.length === 0 ? (
                        <tr>
                          <td style={ui.emptyRow} colSpan={3}>
                            No departments yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* UNITS */}
        {activeTab === "units" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Units</div>
                <div style={ui.cardSub}>Create units/wings used across census and assignments.</div>
              </div>

              <button style={ui.btnGhost} onClick={loadAll} disabled={loading}>
                Refresh
              </button>
            </div>

            <div style={ui.inlineForm}>
              <input
                style={ui.input}
                placeholder="Unit name (ex: North Wing)"
                value={unitForm.name}
                onChange={(e) => setUnitForm({ name: e.target.value })}
              />
              {editingUnitId ? (
                <>
                  <button style={ui.btnPrimary} onClick={() => saveUnit(editingUnitId)}>
                    Save
                  </button>
                  <button
                    style={ui.btnGhost}
                    onClick={() => {
                      setEditingUnitId(null);
                      setUnitForm({ name: "" });
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button style={ui.btnPrimary} onClick={addUnit}>
                  Add
                </button>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>ID</th>
                    <th style={ui.th}>Name</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id} style={ui.tr}>
                      <td style={ui.tdMono}>{u.id}</td>
                      <td style={ui.td}><span style={ui.cellStrong}>{u.name}</span></td>
                      <td style={{ ...ui.td, textAlign: "right" }}>
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
                      </td>
                    </tr>
                  ))}
                  {units.length === 0 ? (
                    <tr>
                      <td style={ui.emptyRow} colSpan={3}>
                        No units yet.
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
                <div style={ui.cardSub}>Manage rooms, beds, active/inactive, and bed order.</div>
              </div>

              <button style={ui.btnGhost} onClick={loadRooms} disabled={roomsLoading}>
                {roomsLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {!canManageFacility ? (
              <div style={ui.notice}>You don’t have permission to manage facility settings.</div>
            ) : (
              <div style={ui.rbGrid}>
                {/* LEFT: ROOMS */}
                <div style={ui.rbLeft}>
                  <div style={ui.rbPanelTitle}>Rooms</div>

                  <div style={ui.inlineFormWrap}>
                    <input
                      style={{ ...ui.input, minWidth: 180, flex: 1 }}
                      placeholder="Room name (ex: 301)"
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
                        <button style={ui.btnMini} onClick={() => saveRoom(editingRoomId)} disabled={roomSaving}>
                          {roomSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          style={ui.btnMiniGhost}
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
                      <button style={ui.btnMini} onClick={addRoom} disabled={roomSaving}>
                        {roomSaving ? "Adding…" : "Add"}
                      </button>
                    )}
                  </div>

                  <div style={ui.rbList}>
                    {(rooms || []).map((r) => {
                      const selected = String(r.id) === String(selectedRoomId);
                      const inactive = r.is_active === false;
                      return (
                        <div
                          key={r.id}
                          style={ui.roomRow(selected, inactive)}
                          onClick={() => setSelectedRoomId(r.id)}
                          role="button"
                          tabIndex={0}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 950, color: "white" }}>{r.name}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                              <span style={inactive ? ui.badgeOff : ui.badgeOn}>
                                {inactive ? "Inactive" : "Active"}
                              </span>
                              <span style={ui.orderPill}>Beds: {Array.isArray(r.beds) ? r.beds.length : 0}</span>
                            </div>
                          </div>

                          <div style={ui.actions}>
                            <button
                              style={ui.btnMiniGhost}
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
                    })}

                    {!roomsLoading && (rooms || []).length === 0 ? (
                      <div style={ui.empty2}>No rooms yet.</div>
                    ) : null}
                  </div>
                </div>

                {/* RIGHT: BEDS */}
                <div style={ui.rbRight}>
                  <div style={ui.rbPanelTitle}>Beds</div>

                  {!selectedRoomId ? (
                    <div style={ui.notice}>Select a room to manage its beds.</div>
                  ) : (
                    <>
                      <div style={ui.inlineFormWrap}>
                        <input
                          style={{ ...ui.input, minWidth: 180, flex: 1 }}
                          placeholder="Bed label (ex: A, B, Door, Window)"
                          value={bedForm.label}
                          onChange={(e) => setBedForm((p) => ({ ...p, label: e.target.value }))}
                        />
                        <label style={ui.smallCheck}>
                          <input
                            type="checkbox"
                            checked={!!bedForm.is_active}
                            onChange={(e) => setBedForm((p) => ({ ...p, is_active: e.target.checked }))}
                          />
                          Active
                        </label>

                        {editingBedId ? (
                          <>
                            <button style={ui.btnMini} onClick={() => saveBed(editingBedId)} disabled={bedSaving}>
                              {bedSaving ? "Saving…" : "Save"}
                            </button>
                            <button
                              style={ui.btnMiniGhost}
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
                          <button style={ui.btnMini} onClick={addBed} disabled={bedSaving}>
                            {bedSaving ? "Adding…" : "Add"}
                          </button>
                        )}
                      </div>

                      <div style={ui.bedList}>
                        {bedsLoading ? <div style={ui.empty2}>Loading beds…</div> : null}

                        {(beds || []).map((b, idx) => {
                          const inactive = b.is_active === false;
                          return (
                            <div
                              key={b.id}
                              style={ui.bedRow(inactive)}
                              draggable
                              onDragStart={() => onBedDragStart(b.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => onBedDrop(b.id)}
                            >
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <div style={ui.dragHandle} title="Drag to reorder">
                                  ≡
                                </div>
                                <div>
                                  <div style={{ fontWeight: 950, color: "white" }}>{b.label}</div>
                                  <div style={{ marginTop: 6 }}>
                                    <span style={inactive ? ui.badgeOff : ui.badgeOn}>
                                      {inactive ? "Inactive" : "Active"}
                                    </span>
                                    <span style={{ marginLeft: 8, ...ui.orderPill }}>#{idx + 1}</span>
                                  </div>
                                </div>
                              </div>

                              <div style={ui.actions}>
                                <button
                                  style={ui.btnMiniGhost}
                                  onClick={() => moveBedByIndex(idx, idx - 1)}
                                  disabled={idx === 0}
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  style={ui.btnMiniGhost}
                                  onClick={() => moveBedByIndex(idx, idx + 1)}
                                  disabled={idx === beds.length - 1}
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  style={ui.btnMiniGhost}
                                  onClick={() => {
                                    setEditingBedId(b.id);
                                    setBedForm({ label: b.label || "", is_active: b.is_active !== false });
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  style={ui.btnMiniGhost}
                                  onClick={() => toggleBedActive(b)}
                                  disabled={bedSaving}
                                >
                                  {inactive ? "Activate" : "Deactivate"}
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {!bedsLoading && (beds || []).length === 0 ? (
                          <div style={ui.empty2}>No beds yet.</div>
                        ) : null}
                      </div>
                    </>
                  )}
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
                <div style={ui.cardSub}>Control patient identifiers shown in the app.</div>
              </div>
              <button style={ui.btnGhost} onClick={loadOrgSettings} disabled={privacySaving}>
                Refresh
              </button>
            </div>

            {!canManagePrivacy ? (
              <div style={ui.notice}>You don’t have permission to manage privacy settings.</div>
            ) : (
              <>
                <div
                  style={ui.checkRow}
                  onClick={() =>
                    setOrgSettings((p) => ({
                      ...p,
                      show_patient_identifiers: !p?.show_patient_identifiers,
                    }))
                  }
                >
                  <input
                    type="checkbox"
                    checked={!!orgSettings?.show_patient_identifiers}
                    onChange={(e) =>
                      setOrgSettings((p) => ({
                        ...p,
                        show_patient_identifiers: e.target.checked,
                      }))
                    }
                  />
                  <div>
                    <div style={{ fontWeight: 950 }}>Show patient identifiers</div>
                    <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>
                      When enabled, census boards can display patient names/initials based on format below.
                    </div>
                  </div>
                </div>

                <div style={ui.privacyRow}>
                  <div style={{ minWidth: 260 }}>
                    <div style={ui.label}>Identifier format</div>
                    <select
                      style={{ ...ui.select, minWidth: 260 }}
                      value={orgSettings?.identifier_format || "first_last_initial"}
                      onChange={(e) =>
                        setOrgSettings((p) => ({ ...p, identifier_format: e.target.value }))
                      }
                      disabled={!orgSettings?.show_patient_identifiers}
                    >
                      <option value="first_last_initial">First name + last initial (John D.)</option>
                      <option value="first_initial_last">First initial + last name (J. Doe)</option>
                      <option value="initials">Initials only (J.D.)</option>
                    </select>
                  </div>

                  <button
                    style={ui.btnPrimary}
                    disabled={privacySaving}
                    onClick={() => {
                      if (!!orgSettings?.show_patient_identifiers) {
                        setShowAck(true);
                        return;
                      }
                      savePrivacy({
                        enabled: false,
                        format: orgSettings?.identifier_format || "first_last_initial",
                        acknowledged: true,
                      });
                    }}
                  >
                    {privacySaving ? "Saving…" : "Save"}
                  </button>
                </div>

                {showAck ? (
                  <div onMouseDown={() => setShowAck(false)} style={ui.modalOverlay}>
                    <div onMouseDown={(e) => e.stopPropagation()} style={ui.modal}>
                      <div style={ui.modalTitle}>Privacy Acknowledgement</div>
                      <div style={ui.modalBody}>
                        You’re about to enable patient identifiers. Confirm you have authorization and are following facility policy.
                      </div>
                      <div style={ui.modalActions}>
                        <button style={ui.btnGhost} onClick={() => setShowAck(false)} disabled={privacySaving}>
                          Cancel
                        </button>
                        <button
                          style={ui.btnPrimary}
                          onClick={() =>
                            savePrivacy({
                              enabled: true,
                              format: orgSettings?.identifier_format || "first_last_initial",
                              acknowledged: true,
                            })
                          }
                          disabled={privacySaving}
                        >
                          {privacySaving ? "Saving…" : "I Acknowledge & Enable"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* PAY PERIOD */}
        {activeTab === "pay_period" && orgId && (
          <div style={ui.card}>
            <div style={ui.cardHeader}>
              <div>
                <div style={ui.cardTitle}>Pay Period</div>
                <div style={ui.cardSub}>
                  Configure pay period rules so overtime calculations match facility payroll.
                </div>
              </div>
              <button style={ui.btnGhost} onClick={loadOrgSettings} disabled={payPeriodSaving}>
                Refresh
              </button>
            </div>

            <div style={ui.notice}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={ui.label}>Pay period length (days)</div>
                    <input
                      style={{ ...ui.input, width: 160 }}
                      type="number"
                      min={7}
                      max={31}
                      value={payPeriod.length_days}
                      onChange={(e) => setPayPeriod((p) => ({ ...p, length_days: e.target.value }))}
                    />
                  </div>

                  <div>
                    <div style={ui.label}>Week starts on</div>
                    <select
                      style={{ ...ui.select, width: 200 }}
                      value={payPeriod.week_starts_on}
                      onChange={(e) => setPayPeriod((p) => ({ ...p, week_starts_on: e.target.value }))}
                    >
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={ui.label}>Anchor date (optional)</div>
                    <input
                      style={{ ...ui.input, width: 200 }}
                      type="date"
                      value={payPeriod.anchor_date || ""}
                      onChange={(e) => setPayPeriod((p) => ({ ...p, anchor_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={ui.btnPrimary} onClick={savePayPeriod} disabled={payPeriodSaving}>
                    {payPeriodSaving ? "Saving…" : "Save Pay Period"}
                  </button>
                </div>

                <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                  If you don’t use an anchor date, ShiftCensus will still use pay period length for overtime windows,
                  but anchoring makes the boundaries line up exactly with payroll.
                </div>
              </div>
            </div>
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
                  <div style={{ color: "white", fontWeight: 1000, fontSize: 14 }}>{o.name || "Unnamed Org"}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 12 }}>
                    {o.org_code || "—"} • orgId: <span style={ui.mono}>{o.id}</span>
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
  return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortByOrderThenLabel(a, b) {
  const ao = a?.display_order ?? 999999;
  const bo = b?.display_order ?? 999999;
  if (ao !== bo) return ao - bo;
  return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
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

  sectionRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  sectionPill: (active) => ({
    height: 38,
    borderRadius: 999,
    padding: "8px 12px",
    border: active ? "1px solid rgba(255,255,255,0.26)" : "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 1000,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
  }),

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
    whiteSpace: "nowrap",
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

  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
    whiteSpace: "nowrap",
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

  smallToggle: {
    display: "inline-flex",
    gap: 6,
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 900,
    fontSize: 12,
  },

  label: {
    color: "#9CA3AF",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 6,
  },

  // superadmin org picker
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
