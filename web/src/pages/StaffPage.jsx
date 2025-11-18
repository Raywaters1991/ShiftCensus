import { useEffect, useState } from "react";
import api from "../services/api";

export default function StaffPage() {
  const [staff, setStaff] = useState([]);

  // Add staff inputs
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Edit mode states
  const [editId, setEditId] = useState(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Search / filter / sort / pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [sortOption, setSortOption] = useState("name-asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    const res = await api.get("/staff");
    setStaff(res.data);
  };

  const addStaff = async () => {
    if (!firstName || !lastName || !role) {
      alert("Please fill in first name, last name, and role.");
      return;
    }

    const payload = {
  name: `${firstName.trim()} ${lastName.trim()}`,
  role,
  email,
  phone,
  org_code: localStorage.getItem("org_code")
};


    const res = await api.post("/staff", payload);

    setStaff([...staff, res.data]);

    // Clear form
    setFirstName("");
    setLastName("");
    setRole("");
    setEmail("");
    setPhone("");
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

    await api.put(`/staff/${editId}`, {
      name: fullName,
      role: editRole,
      email: editEmail,
      phone: editPhone,
    });

    setStaff(
      staff.map((s) =>
        s.id === editId
          ? {
              ...s,
              name: fullName,
              role: editRole,
              email: editEmail,
              phone: editPhone,
            }
          : s
      )
    );

    setEditId(null);
    setEditFirst("");
    setEditLast("");
    setEditRole("");
    setEditEmail("");
    setEditPhone("");
  };

  // Delete system
  const openDeleteModal = (person) => {
    setDeleteTarget(person);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/staff/${deleteTarget.id}`);
      setStaff(staff.filter((s) => s.id !== deleteTarget.id));
      closeDeleteModal();

      setTimeout(() => {
        alert(`Deleted ${deleteTarget.name}`);
      }, 150);
    } catch (err) {
      alert("Failed to delete staff. Check backend logs.");
    }
  };

  // --- FILTER + SEARCH + SORT LOGIC ---

  // reset to page 1 when search/filter/sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRole, sortOption]);

  const normalizedSearch = searchTerm.toLowerCase();

  const filtered = staff.filter((s) => {
    const matchesRole =
      filterRole === "All" ? true : s.role === filterRole;

    const matchesSearch =
      !normalizedSearch ||
      s.name.toLowerCase().includes(normalizedSearch) ||
      (s.email || "").toLowerCase().includes(normalizedSearch) ||
      (s.phone || "").toLowerCase().includes(normalizedSearch);

    return matchesRole && matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortOption === "name-asc") {
      return a.name.localeCompare(b.name);
    }
    if (sortOption === "name-desc") {
      return b.name.localeCompare(a.name);
    }
    if (sortOption === "role-asc") {
      return a.role.localeCompare(b.role) || a.name.localeCompare(b.name);
    }
    if (sortOption === "role-desc") {
      return b.role.localeCompare(a.role) || a.name.localeCompare(b.name);
    }
    return 0;
  });

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const currentPageItems = sorted.slice(startIndex, startIndex + pageSize);

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial", color: "white" }}>
      {/* Animations */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scaleIn {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}
      </style>

      <h1>Staff Management</h1>

      {/* ADD STAFF FORM */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <input
          placeholder="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={{ padding: "8px", width: "150px" }}
        />

        <input
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          style={{ padding: "8px", width: "150px" }}
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ padding: "8px", width: "120px" }}
        >
          <option value="">Role</option>
          <option value="RN">RN</option>
          <option value="LPN">LPN</option>
          <option value="CNA">CNA</option>
        </select>

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "8px", width: "180px" }}
        />

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ padding: "8px", width: "140px" }}
        />

        <button
          onClick={addStaff}
          style={{
            padding: "8px 14px",
            background: "#555",
            border: "1px solid #777",
            color: "white",
            cursor: "pointer",
          }}
        >
          Add Staff
        </button>
      </div>

      {/* SEARCH / FILTER / SORT BAR */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "15px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          placeholder="Search by name, email, or phone"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "8px", minWidth: "260px" }}
        />

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          style={{ padding: "8px" }}
        >
          <option value="All">All Roles</option>
          <option value="RN">RN</option>
          <option value="LPN">LPN</option>
          <option value="CNA">CNA</option>
        </select>

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

        <div style={{ marginLeft: "auto", fontSize: "14px", opacity: 0.8 }}>
          Showing {currentPageItems.length} of {totalItems} staff
        </div>
      </div>

      {/* STAFF TABLE */}
      <table
        border="1"
        cellPadding="12"
        style={{ width: "100%", textAlign: "left" }}
      >
        <thead>
          <tr>
            <th style={{ width: "50px" }}>ID</th>
            <th>Name</th>
            <th style={{ width: "90px" }}>Role</th>
            <th>Email</th>
            <th style={{ width: "130px" }}>Phone</th>
            <th style={{ width: "160px" }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {currentPageItems.map((s) => {
            const isEditing = editId === s.id;

            return (
              <tr key={s.id}>
                <td>{s.id}</td>

                {/* NAME */}
                <td>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        value={editFirst}
                        onChange={(e) => setEditFirst(e.target.value)}
                        style={{ width: "110px", padding: "5px" }}
                      />
                      <input
                        value={editLast}
                        onChange={(e) => setEditLast(e.target.value)}
                        style={{ width: "110px", padding: "5px" }}
                      />
                    </div>
                  ) : (
                    s.name
                  )}
                </td>

                {/* ROLE */}
                <td>
                  {isEditing ? (
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      style={{ padding: "6px" }}
                    >
                      <option value="RN">RN</option>
                      <option value="LPN">LPN</option>
                      <option value="CNA">CNA</option>
                    </select>
                  ) : (
                    s.role
                  )}
                </td>

                {/* EMAIL */}
                <td>
                  {isEditing ? (
                    <input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      style={{ padding: "6px", width: "180px" }}
                    />
                  ) : (
                    s.email || "-"
                  )}
                </td>

                {/* PHONE */}
                <td>
                  {isEditing ? (
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      style={{ padding: "6px", width: "130px" }}
                    />
                  ) : (
                    s.phone || "-"
                  )}
                </td>

                {/* ACTION BUTTONS */}
                <td>
                  {isEditing ? (
                    <>
                      <button
                        onClick={saveEdit}
                        style={{
                          padding: "6px 12px",
                          background: "#337",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                          marginRight: "8px",
                        }}
                      >
                        Save
                      </button>

                      <button
                        onClick={() => setEditId(null)}
                        style={{
                          padding: "6px 12px",
                          background: "#555",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(s)}
                        style={{
                          padding: "6px 12px",
                          background: "#444",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                          marginRight: "8px",
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => openDeleteModal(s)}
                        style={{
                          padding: "6px 12px",
                          background: "#b33",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}

          {currentPageItems.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>
                No staff found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* PAGINATION CONTROLS */}
      <div
        style={{
          marginTop: "15px",
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            padding: "6px 12px",
            cursor: currentPage === 1 ? "not-allowed" : "pointer",
          }}
        >
          ◀ Prev
        </button>

        <span>
          Page {currentPage} of {totalPages}
        </span>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{
            padding: "6px 12px",
            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          }}
        >
          Next ▶
        </button>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            animation: "fadeIn 0.2s ease-in-out",
          }}
        >
          <div
            style={{
              background: "#1e1e1e",
              padding: "25px",
              borderRadius: "12px",
              width: "350px",
              color: "white",
              textAlign: "center",
              boxShadow: "0 0 20px rgba(0,0,0,0.8)",
              animation: "scaleIn 0.18s ease-in-out",
            }}
          >
            <h2 style={{ marginBottom: "15px" }}>Confirm Delete</h2>

            <p style={{ marginBottom: "25px", fontSize: "17px" }}>
              Are you sure you want to delete <b>{deleteTarget?.name}</b>?<br />
              This action cannot be undone.
            </p>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button
                onClick={closeDeleteModal}
                style={{
                  padding: "10px 20px",
                  background: "#444",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  cursor: "pointer",
                  width: "45%",
                }}
              >
                Cancel
              </button>

              <button
                onClick={confirmDelete}
                style={{
                  padding: "10px 20px",
                  background: "#b33",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  cursor: "pointer",
                  width: "45%",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
